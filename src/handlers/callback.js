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

export default function callbackHandler(bot, pool) {
  // ---------- text input for support ----------
  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);
    const msgText = ctx.message?.text || "";

    if (st.step === "wait_support_text") {
      setState(userId, { step: "idle" });

      const subject = `HAIRbot Support | user_id=${userId}`;
      const text = `User ID: ${userId}\n\nMessage:\n${msgText}`;

      try {
        await sendSupportEmail({ subject, text });
      } catch (e) {
        console.warn("⚠️ sendSupportEmail failed:", e?.message || e);
      }

      await ctx.reply("✅ Спасибо! Сообщение отправлено.", mainMenuKeyboard());
    }
  });

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

    const payKeyboard = (plan) => ({
      reply_markup: {
        inline_keyboard: [
          [{ text: "💳 Перейти к оплате", callback_data: `PAY_START_${plan}` }],
          [{ text: "⬅️ В меню", callback_data: "MENU_HOME" }],
        ],
      },
    });

    // ---------- MENU_HOME ----------
    if (data === "MENU_HOME") {
      await safeEdit("Главное меню:", mainMenuKeyboard());
      return;
    }

    // ---------- TARIFFS ----------
    if (data === "MENU_TARIFF_FREE") {
      setState(userId, { plan: "free" });
      await safeEdit(textTemplates.tariffFree);
      return;
    }

    if (data === "MENU_TARIFF_PRO") {
      setState(userId, { plan: "pro" });
      await safeEdit(textTemplates.tariffPro, payKeyboard("PRO"));
      return;
    }

    if (data === "MENU_TARIFF_PREMIUM") {
      setState(userId, { plan: "premium" });
      await safeEdit(textTemplates.tariffPremium, payKeyboard("PREMIUM"));
      return;
    }

    // ---------- COMPARE / EXAMPLES / DOCS ----------
    if (data === "MENU_WHATSIN") {
      await safeEdit(textTemplates.tariffsCompare);
      return;
    }
    if (data === "MENU_EXAMPLES") {
      await safeEdit(textTemplates.examples);
      return;
    }
    if (data === "MENU_PRIVACY") {
      await safeEdit(textTemplates.privacy);
      return;
    }
    if (data === "MENU_PAYMENTS") {
      await safeEdit(textTemplates.payments);
      return;
    }

    // ---------- SUPPORT (one button) ----------
    if (data === "MENU_SUPPORT") {
      setState(userId, { step: "wait_support_text" });
      await ctx.reply(textTemplates.supportPrompt, {
        parse_mode: "HTML",
        ...mainMenuKeyboard(),
      });
      return;
    }

    // ---------- CONSENTS ----------
    if (data === "DOC_CONSENT_PD") {
      await safeEdit(textTemplates.docs.consentPd);
      return;
    }
    if (data === "DOC_CONSENT_THIRD") {
      await safeEdit(textTemplates.docs.consentThird);
      return;
    }
    if (data === "CONSENT_ACCEPT_ALL") {
      acceptAllConsents(userId);
      await safeEdit("✅ Спасибо! Согласия приняты. Можно продолжать.", mainMenuKeyboard());
      return;
    }
    if (data === "CONSENT_DECLINE") {
      setState(userId, { step: "idle" });
      await safeEdit("Понимаю. Без согласий мы не можем обрабатывать фото.", mainMenuKeyboard());
      return;
    }

    // ---------- PAYMENT FLOW ----------
    // PAY_START_PRO / PAY_START_PREMIUM
    if (data === "PAY_START_PRO" || data === "PAY_START_PREMIUM") {
      const st = getState(userId);

      // 1) перед оплатой просим согласия
      if (!st.consentPd || !st.consentThird) {
        await safeEdit(textTemplates.consentScreen, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Принять и продолжить", callback_data: "CONSENT_ACCEPT_ALL" }],
              [{ text: "🔒 Политика конфиденциальности", callback_data: "MENU_PRIVACY" }],
              [{ text: "📄 Согласие на обработку ПДн", callback_data: "DOC_CONSENT_PD" }],
              [{ text: "📄 Согласие на третьих лиц", callback_data: "DOC_CONSENT_THIRD" }],
              [{ text: "❌ Отказаться", callback_data: "CONSENT_DECLINE" }],
            ],
          },
        });
        return;
      }

      // 2) показываем оплату ЮMoney
      const plan = data === "PAY_START_PRO" ? "PRO" : "PREMIUM";

      // ссылки задаёшь в Render env:
      // YOOMONEY_PAY_URL_PRO, YOOMONEY_PAY_URL_PREMIUM
      const url =
        plan === "PRO"
          ? process.env.YOOMONEY_PAY_URL_PRO
          : process.env.YOOMONEY_PAY_URL_PREMIUM;

      const paymentText =
        `${textTemplates.paymentInfoCommon}\n\n` +
        `<b>Выбран тариф:</b> ${plan}\n` +
        (url
          ? `\n👉 <a href="${url}">Открыть оплату ЮMoney</a>`
          : `\n⚠️ Ссылка оплаты не настроена. Добавьте env: YOOMONEY_PAY_URL_${plan}`);

      await safeEdit(paymentText, {
        reply_markup: {
          inline_keyboard: [
            url ? [{ text: "💳 Оплатить в ЮMoney", url }] : [],
            [{ text: "⬅️ В меню", callback_data: "MENU_HOME" }],
          ].filter((row) => row.length > 0),
        },
      });

      // дальше подтверждение оплаты: пока через /pay_ok или вручную
      return;
    }

    // ---------- DELETE FLOW ----------
    if (data === "MENU_DELETE") {
      await safeEdit(textTemplates.deleteIntro, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Удалить", callback_data: "DELETE_CONFIRM" },
              { text: "❌ Не удалять", callback_data: "DELETE_CANCEL" },
            ],
          ],
        },
      });
      return;
    }

    if (data === "DELETE_CANCEL") {
      await safeEdit(textTemplates.deleteCancelled);
      return;
    }

    if (data === "DELETE_CONFIRM") {
      if (pool) {
        try {
          await deleteUserDataFromDB(pool, userId);
        } catch (e) {
          console.warn("⚠️ deleteUserDataFromDB failed:", e?.message || e);
        }
      } else {
        console.warn("⚠️ pool is not provided; DB delete skipped");
      }

      resetUserData(userId);
      await safeEdit(textTemplates.deleteDone);
      return;
    }
  });
}
