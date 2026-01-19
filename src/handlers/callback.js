// src/handlers/callback.js
import textTemplates from "../utils/text-templates.js";
import { mainMenuKeyboard } from "../keyboards/main.js";
import {
  getState,
  setState,
  resetUserData,
  acceptAllConsents,
  deleteUserDataFromDB,
} from "../utils/storage.js";
import { sendSupportEmail } from "../utils/mailer.js";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}
function isValidTgUsername(u) {
  const s = String(u || "").trim();
  return /^@?[a-zA-Z0-9_]{5,32}$/.test(s);
}
function normTgUsername(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  return s.startsWith("@") ? s : `@${s}`;
}

export default function callbackHandler(bot, pool) {
  // ====== TEXT INPUT HANDLER (support email / support tg / support message) ======
  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);
    const msgText = (ctx.message?.text || "").trim();

    // --- SUPPORT: entering email ---
    if (st.step === "wait_support_email") {
      if (!isValidEmail(msgText)) {
        await ctx.reply("❗ Похоже, это не email. Пожалуйста, отправьте email ещё раз сообщением ниже.");
        return;
      }
      const contact = msgText;
      setState(userId, { supportContact: contact, supportContactType: "email", step: "support_confirm_contact" });

      await ctx.reply(textTemplates.supportConfirmContact(contact), {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Подтвердить", callback_data: "SUPPORT_CONFIRM_CONTACT" }],
            [{ text: "✏️ Изменить", callback_data: "SUPPORT_CHANGE_CONTACT" }],
            [{ text: "⬅️ В меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    // --- SUPPORT: entering tg username manually ---
    if (st.step === "wait_support_tg") {
      if (!isValidTgUsername(msgText)) {
        await ctx.reply("❗ Отправьте, пожалуйста, Telegram username в формате @username (латиница/цифры/подчёркивания).");
        return;
      }
      const contact = normTgUsername(msgText);
      setState(userId, { supportContact: contact, supportContactType: "tg", step: "support_confirm_contact" });

      await ctx.reply(textTemplates.supportConfirmContact(contact), {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Подтвердить", callback_data: "SUPPORT_CONFIRM_CONTACT" }],
            [{ text: "✏️ Изменить", callback_data: "SUPPORT_CHANGE_CONTACT" }],
            [{ text: "⬅️ В меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    // --- SUPPORT: final message to send ---
    if (st.step === "wait_support_message") {
      setState(userId, { step: "idle" });

      const contact = st.supportContact || "не указан";
      const contactType = st.supportContactType || "unknown";

      const subject = `HAIRbot Support | user_id=${userId}`;
      const text =
        `User ID: ${userId}\n` +
        `Contact type: ${contactType}\n` +
        `Contact: ${contact}\n\n` +
        `Message:\n${msgText}\n`;

      try {
        await sendSupportEmail({ subject, text });
      } catch (e) {
        console.warn("⚠️ sendSupportEmail failed:", e?.message || e);
      }

      await ctx.reply(textTemplates.supportThanks, { parse_mode: "HTML", ...mainMenuKeyboard() });
      return;
    }
  });

  // ====== CALLBACK HANDLER ======
  bot.on("callback_query", async (ctx) => {
    const userId = ctx.from?.id;
    const data = ctx.callbackQuery?.data;
    if (!userId || !data) return;

    await ctx.answerCbQuery();

    const safeEdit = async (html, extra) => {
      const payload = { parse_mode: "HTML", ...(extra || mainMenuKeyboard()) };
      try {
        await ctx.editMessageText(html, payload);
      } catch {
        await ctx.reply(html, payload);
      }
    };

    const backToMenuKb = {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]] },
    };

    // ---------------- MENU_HOME ----------------
    if (data === "MENU_HOME") {
      await safeEdit("Главное меню:", mainMenuKeyboard());
      return;
    }

    // ---------------- TARIFFS ----------------
    if (data === "MENU_TARIFF_FREE") {
      setState(userId, { plan: "free" });
      await safeEdit(textTemplates.tariffFree, backToMenuKb);
      return;
    }

    if (data === "MENU_TARIFF_PRO") {
      setState(userId, { plan: "pro" });
      await safeEdit(textTemplates.tariffPro, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Перейти к оплате", callback_data: "PAY_START_PRO" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    if (data === "MENU_TARIFF_PREMIUM") {
      setState(userId, { plan: "premium" });
      await safeEdit(textTemplates.tariffPremium, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Перейти к оплате", callback_data: "PAY_START_PREMIUM" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    // ---------------- COMPARE / EXAMPLES ----------------
    if (data === "MENU_WHATSIN") {
      await safeEdit(textTemplates.tariffsCompare, backToMenuKb);
      return;
    }
    if (data === "MENU_EXAMPLES") {
      await safeEdit(textTemplates.examples, backToMenuKb);
      return;
    }

    // ---------------- STANDALONE PRIVACY / PAYMENTS ----------------
    if (data === "MENU_PRIVACY") {
      await safeEdit(textTemplates.privacyStandalone, backToMenuKb);
      return;
    }
    if (data === "MENU_PAYMENTS") {
      await safeEdit(textTemplates.paymentsStandalone, backToMenuKb);
      return;
    }

    // ---------------- SUPPORT (multi-step + legal SLA) ----------------
    if (data === "MENU_SUPPORT") {
      setState(userId, { step: "support_choose_channel", supportContact: null, supportContactType: null });
      await safeEdit(textTemplates.supportStart, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💬 Ответ в Telegram", callback_data: "SUPPORT_CHOOSE_TG" }],
            [{ text: "📩 Ответ на Email", callback_data: "SUPPORT_CHOOSE_EMAIL" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    if (data === "SUPPORT_CHOOSE_TG") {
      const username = ctx.from?.username ? `@${ctx.from.username}` : "";
      if (username) {
        setState(userId, { supportContactType: "tg", supportContact: username, step: "support_confirm_contact" });
        await safeEdit(textTemplates.supportConfirmContact(username), {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Подтвердить", callback_data: "SUPPORT_CONFIRM_CONTACT" }],
              [{ text: "✏️ Изменить", callback_data: "SUPPORT_CHANGE_CONTACT" }],
              [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
            ],
          },
        });
      } else {
        setState(userId, { supportContactType: "tg", supportContact: null, step: "wait_support_tg" });
        await ctx.reply(textTemplates.supportAskTg, { parse_mode: "HTML", ...mainMenuKeyboard() });
      }
      return;
    }

    if (data === "SUPPORT_CHOOSE_EMAIL") {
      setState(userId, { supportContactType: "email", supportContact: null, step: "wait_support_email" });
      await ctx.reply(textTemplates.supportAskEmail, { parse_mode: "HTML", ...mainMenuKeyboard() });
      return;
    }

    if (data === "SUPPORT_CHANGE_CONTACT") {
      // возвращаем к выбору канала, чтобы было понятно
      setState(userId, { step: "support_choose_channel", supportContact: null, supportContactType: null });
      await safeEdit(textTemplates.supportStart, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💬 Ответ в Telegram", callback_data: "SUPPORT_CHOOSE_TG" }],
            [{ text: "📩 Ответ на Email", callback_data: "SUPPORT_CHOOSE_EMAIL" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    if (data === "SUPPORT_CONFIRM_CONTACT") {
      setState(userId, { step: "support_ready_to_message" });
      await safeEdit(textTemplates.supportSendMessageHint, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✉️ Отправить сообщение", callback_data: "SUPPORT_SEND_MESSAGE" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    if (data === "SUPPORT_SEND_MESSAGE") {
      setState(userId, { step: "wait_support_message" });
      await ctx.reply("Напишите ваше сообщение <b>сообщением ниже</b>.", { parse_mode: "HTML", ...mainMenuKeyboard() });
      return;
    }

    // ---------------- CONSENT FLOW HELPERS ----------------
    const showConsentMenu = async () => {
      const st = getState(userId);
      const pdOk = !!st.consentPd;
      const thirdOk = !!st.consentThird;

      const lines = [
        textTemplates.consentMenu,
        "",
        `Статус:`,
        `${pdOk ? "✅" : "⬜️"} Согласие на обработку ПДн`,
        `${thirdOk ? "✅" : "⬜️"} Согласие на третьих лиц`,
      ].join("\n");

      await safeEdit(lines, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔒 Политика конфиденциальности", callback_data: "PRIVACY_IN_FLOW" }],
            [{ text: `${pdOk ? "✅ " : ""}Согласие на обработку ПДн`, callback_data: "DOC_CONSENT_PD_IN_FLOW" }],
            [{ text: `${thirdOk ? "✅ " : ""}Согласие на третьих лиц`, callback_data: "DOC_CONSENT_THIRD_IN_FLOW" }],
            [{ text: "⬅️ Назад", callback_data: "RETURN_FROM_CONSENTS" }],
          ],
        },
      });
    };

    const goToPaymentScreen = async () => {
      const st = getState(userId);
      const plan = st.plan; // "pro" | "premium"
      const planLabel = plan === "premium" ? "PREMIUM" : "PRO";

      const url =
        plan === "premium" ? process.env.YOOMONEY_PAY_URL_PREMIUM : process.env.YOOMONEY_PAY_URL_PRO;

      const html =
        `${textTemplates.paymentInfoCommon}\n\n` +
        `<b>Выбран тариф:</b> ${planLabel}\n` +
        (url ? `\n👉 <a href="${url}">Открыть оплату ЮMoney</a>` : `\n⚠️ Ссылка оплаты не настроена.`);

      await safeEdit(html, {
        reply_markup: {
          inline_keyboard: [
            url ? [{ text: "💳 Оплатить в ЮMoney", url }] : [],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ].filter((row) => row.length > 0),
        },
      });
    };

    // ---------------- PAYMENT START (from tariff) ----------------
    if (data === "PAY_START_PRO" || data === "PAY_START_PREMIUM") {
      // фиксируем выбранный план заранее (п.2)
      setState(userId, { plan: data === "PAY_START_PREMIUM" ? "premium" : "pro", afterConsents: "payment" });

      const st = getState(userId);
      if (st.consentPd && st.consentThird) {
        await goToPaymentScreen();
      } else {
        setState(userId, { step: "consent_flow" });
        await showConsentMenu();
      }
      return;
    }

    // ---------------- PRIVACY IN CONSENT FLOW ----------------
    if (data === "PRIVACY_IN_FLOW") {
      await safeEdit(textTemplates.privacyInConsentFlow, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Далее к соглашениям", callback_data: "CONSENT_MENU" }],
          ],
        },
      });
      return;
    }

    // ---------------- CONSENT MENU ----------------
    if (data === "CONSENT_MENU") {
      await showConsentMenu();
      return;
    }

    // Return button from consent menu
    if (data === "RETURN_FROM_CONSENTS") {
      // если пришли из оплаты — возвращаем на экран оплаты-старта (по смыслу: обратно к тарифу)
      // проще: вернуть в главное меню (но ты просила вести к оплате после согласий; назад не критично)
      await safeEdit("Главное меню:", mainMenuKeyboard());
      return;
    }

    // ---------------- DOCS IN FLOW (each with accept + back) ----------------
    if (data === "DOC_CONSENT_PD_IN_FLOW") {
      await safeEdit(textTemplates.docs.consentPd, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Принять и продолжить", callback_data: "CONSENT_PD_ACCEPT" }],
            [{ text: "⬅️ Назад к соглашениям", callback_data: "CONSENT_MENU" }],
          ],
        },
      });
      return;
    }

    if (data === "DOC_CONSENT_THIRD_IN_FLOW") {
      await safeEdit(textTemplates.docs.consentThird, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Принять и продолжить", callback_data: "CONSENT_THIRD_ACCEPT" }],
            [{ text: "⬅️ Назад к соглашениям", callback_data: "CONSENT_MENU" }],
          ],
        },
      });
      return;
    }

    if (data === "CONSENT_PD_ACCEPT") {
      setState(userId, { consentPd: true, consentPdAt: new Date().toISOString(), consentPdVersion: "2026-01-18" });

      const st = getState(userId);
      if (st.consentPd && st.consentThird) {
        // все согласия приняты -> перейти к оплате выбранного тарифа (п.2)
        acceptAllConsents(userId);
        await goToPaymentScreen();
      } else {
        await showConsentMenu();
      }
      return;
    }

    if (data === "CONSENT_THIRD_ACCEPT") {
      setState(userId, {
        consentThird: true,
        consentThirdAt: new Date().toISOString(),
        consentThirdVersion: "2026-01-18",
      });

      const st = getState(userId);
      if (st.consentPd && st.consentThird) {
        acceptAllConsents(userId);
        await goToPaymentScreen();
      } else {
        await showConsentMenu();
      }
      return;
    }

    // ---------------- DELETE FLOW ----------------
    if (data === "MENU_DELETE") {
      await safeEdit(textTemplates.deleteIntro, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Удалить", callback_data: "DELETE_CONFIRM" },
              { text: "❌ Не удалять", callback_data: "DELETE_CANCEL" },
            ],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    if (data === "DELETE_CANCEL") {
      await safeEdit(textTemplates.deleteCancelled, backToMenuKb);
      return;
    }

    if (data === "DELETE_CONFIRM") {
      if (pool) {
        try {
          await deleteUserDataFromDB(pool, userId);
        } catch (e) {
          console.warn("⚠️ deleteUserDataFromDB failed:", e?.message || e);
        }
      }
      resetUserData(userId);
      await safeEdit(textTemplates.deleteDone, backToMenuKb);
      return;
    }
  });
}
