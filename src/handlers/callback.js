// src/handlers/callback.js
import textTemplates from "../utils/text-templates.js";
import { mainMenuKeyboard } from "../keyboards/main.js";
import {
  getState,
  setState,
  resetUserData,
  acceptAllConsents,
  deleteUserDataFromDB,
  canUseFreeTariff,
  getNextFreeTariffAt,
} from "../utils/storage.js";
import { withTimeout } from "../utils/with-timeout.js";

const SUPPORT_MESSAGE_TIMEOUT_MS = Number(process.env.SUPPORT_MESSAGE_TIMEOUT_MS || 10000);
const SUPPORT_CHAT_ID = process.env.SUPPORT_CHAT_ID;
const SUPPORT_TG_LINK = process.env.SUPPORT_TG_LINK || "";

export default function callbackHandler(bot, pool) {
  // ====== TEXT INPUT HANDLER (support message) ======
  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);
    const msgText = (ctx.message?.text || "").trim();

    // --- SUPPORT: final message to send ---
    if (st.step === "wait_support_message" || st.step === "support_ready_to_message") {
      setState(userId, { step: "idle" });

      if (!SUPPORT_CHAT_ID) {
        await ctx.reply("⚠️ Поддержка временно недоступна. Пожалуйста, попробуйте позже.", {
          parse_mode: "HTML",
          ...mainMenuKeyboard(),
        });
        return;
      }

      const text = `User ID: ${userId}\n\nMessage:\n${msgText}\n`;

      try {
        await withTimeout(
          bot.telegram.sendMessage(SUPPORT_CHAT_ID, text),
          SUPPORT_MESSAGE_TIMEOUT_MS,
          "Support message send timed out"
        );
        await ctx.reply(textTemplates.supportThanks, {
          parse_mode: "HTML",
          ...mainMenuKeyboard(),
        });
      } catch (e) {
        console.error("❌ sendSupportMessage failed:", {
          message: e?.message,
          code: e?.code,
          response: e?.response,
          stack: e?.stack,
        });
        await ctx.reply(
          textTemplates.supportThanksFallback(
            SUPPORT_TG_LINK ? `<a href="${SUPPORT_TG_LINK}">написать в поддержку</a>` : "написать в поддержку"
          ),
          {
            parse_mode: "HTML",
            ...mainMenuKeyboard(),
          }
        );
      }
      return;
    }
  });

  // ====== CALLBACK HANDLER ======
  bot.on("callback_query", async (ctx) => {
    const userId = ctx.from?.id;
    const data = ctx.callbackQuery?.data;
    if (!userId || !data) return;

    try {
      await ctx.answerCbQuery();
    } catch (error) {
      await ctx.reply(textTemplates.stuckInstruction, mainMenuKeyboard());
      return;
    }

    const safeEdit = async (html, extra) => {
      const payload = { parse_mode: "HTML", ...(extra || mainMenuKeyboard()) };
      try {
        await ctx.editMessageText(html, payload);
      } catch {
        try {
          await ctx.reply(html, payload);
        } catch {
          await ctx.reply(textTemplates.stuckInstruction, mainMenuKeyboard());
        }
      }
    };

    const backToMenuKb = {
      reply_markup: { inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]] },
    };

    // ---------------- MENU_HOME ----------------
    if (data === "MENU_HOME") {
      await safeEdit(textTemplates.mainMenuDescription, mainMenuKeyboard());
      return;
    }

    // ---------------- TARIFFS ----------------
    if (data === "MENU_TARIFF_FREE") {
      setState(userId, { plan: "free", paid: false });
      await safeEdit(textTemplates.tariffFree, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✨ Сделать пробную генерацию", callback_data: "FREE_START" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    if (data === "MENU_TARIFF_PRO") {
      setState(userId, { plan: "pro", paid: false });
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
      setState(userId, { plan: "premium", paid: false });
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
    if (data === "MENU_OFFER") {
      await safeEdit(textTemplates.offer, backToMenuKb);
      return;
    }
    if (data === "MENU_FAQ") {
      await safeEdit(textTemplates.faqIntro, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Насколько обобщенным будет анализ?", callback_data: "FAQ_GENERAL" }],
            [{ text: "У меня обычное фото с телефона, подойдет?", callback_data: "FAQ_PHOTO" }],
            [{ text: "Если у меня сейчас другой цвет волос, это не исказит анализ?", callback_data: "FAQ_HAIR_COLOR" }],
            [{ text: "Если мне не нравится результат анализа?", callback_data: "FAQ_RESULT" }],
            [{ text: "Для чего мне это анализ?", callback_data: "FAQ_PURPOSE" }],
            [{ text: "Мои фото где-то сохраняются?", callback_data: "FAQ_STORAGE" }],
            [{ text: "Что если бот ошибется?", callback_data: "FAQ_ERRORS" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    const faqBackKb = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Назад к FAQ", callback_data: "MENU_FAQ" }],
          [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
        ],
      },
    };

    if (data === "FAQ_GENERAL") {
      await safeEdit(textTemplates.faqAnswers.general, faqBackKb);
      return;
    }
    if (data === "FAQ_PHOTO") {
      await safeEdit(textTemplates.faqAnswers.photo, faqBackKb);
      return;
    }
    if (data === "FAQ_HAIR_COLOR") {
      await safeEdit(textTemplates.faqAnswers.hairColor, faqBackKb);
      return;
    }
    if (data === "FAQ_RESULT") {
      await safeEdit(textTemplates.faqAnswers.result, faqBackKb);
      return;
    }
    if (data === "FAQ_PURPOSE") {
      await safeEdit(textTemplates.faqAnswers.purpose, faqBackKb);
      return;
    }
    if (data === "FAQ_STORAGE") {
      await safeEdit(textTemplates.faqAnswers.storage, faqBackKb);
      return;
    }
    if (data === "FAQ_ERRORS") {
      await safeEdit(textTemplates.faqAnswers.errors, faqBackKb);
      return;
    }

    // ---------------- SUPPORT ----------------
    if (data === "MENU_SUPPORT") {
      setState(userId, { step: "wait_support_message", supportContact: null, supportContactType: null });
      const supportLink = SUPPORT_TG_LINK ? `<a href="${SUPPORT_TG_LINK}">написать в поддержку</a>` : "";
      const keyboard = [
        ...(SUPPORT_TG_LINK ? [[{ text: "💬 Написать в поддержку", url: SUPPORT_TG_LINK }]] : []),
        [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
      ];
      await safeEdit(textTemplates.supportStart(supportLink), {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
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
        `${pdOk ? "✅" : "⬜️"} Согласие на обработку персональных данных`,
        `${thirdOk ? "✅" : "⬜️"} Согласие на третьих лиц`,
      ].join("\n");

      await safeEdit(lines, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔒 Политика конфиденциальности", callback_data: "PRIVACY_IN_FLOW" }],
            [
              {
                text: `${pdOk ? "✅ " : ""}Согласие на обработку персональных данных`,
                callback_data: "DOC_CONSENT_PD_IN_FLOW",
              },
            ],
            [{ text: `${thirdOk ? "✅ " : ""}Согласие на третьих лиц`, callback_data: "DOC_CONSENT_THIRD_IN_FLOW" }],
            [{ text: "⬅️ Назад", callback_data: "MENU_HOME" }],
          ],
        },
      });
    };

    const goToPaymentScreen = async () => {
      const st = getState(userId);
      const plan = st.plan; // "pro" | "premium"
      if (plan !== "pro" && plan !== "premium") {
        await safeEdit("⚠️ Не удалось продолжить оформление. Пожалуйста, начните с выбора тарифа.", {
          reply_markup: {
            inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]],
          },
        });
        return;
      }
      const planLabel = plan === "premium" ? "PREMIUM" : "PRO";

      const url = plan === "premium" ? process.env.YOOMONEY_PAY_URL_PREMIUM : process.env.YOOMONEY_PAY_URL_PRO;
      const offerUrl = (process.env.PUBLIC_OFFER_URL || process.env.OFFER_URL || "").trim();

      const html =
        `${textTemplates.paymentInfoCommon}\n\n` +
        `<b>Выбран тариф:</b> ${planLabel}\n` +
        (url ? "\nНажмите кнопку ниже, чтобы перейти к оплате." : "\n⚠️ Ссылка оплаты не настроена.") +
        "\n\nНажимая «Продолжить», вы подтверждаете согласие с условиями публичной оферты.";

      await safeEdit(html, {
        reply_markup: {
          inline_keyboard: [
            ...(url
              ? [[{ text: "Продолжить", callback_data: "PAY_CONTINUE" }]]
              : []),
            [
              offerUrl
                ? { text: "📄 Публичная оферта", url: offerUrl }
                : { text: "📄 Публичная оферта", callback_data: "MENU_OFFER" },
            ],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
    };

    const showPaymentButton = async () => {
      const st = getState(userId);
      const plan = st.plan;
      if (plan !== "pro" && plan !== "premium") {
        await safeEdit("⚠️ Не удалось продолжить оформление. Пожалуйста, начните с выбора тарифа.", {
          reply_markup: {
            inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]],
          },
        });
        return;
      }
      const planLabel = plan === "premium" ? "PREMIUM" : "PRO";
      const url = plan === "premium" ? process.env.YOOMONEY_PAY_URL_PREMIUM : process.env.YOOMONEY_PAY_URL_PRO;
      const offerUrl = (process.env.PUBLIC_OFFER_URL || process.env.OFFER_URL || "").trim();

      const html =
        `${textTemplates.paymentInfoCommon}\n\n` +
        `<b>Выбран тариф:</b> ${planLabel}\n` +
        (url ? "\nНажмите кнопку ниже, чтобы перейти к оплате." : "\n⚠️ Ссылка оплаты не настроена.") +
        "\n\nНажимая кнопку оплаты, вы принимаете условия публичной оферты со ссылкой на отдельную страницу с документом.";

      await safeEdit(html, {
        reply_markup: {
          inline_keyboard: [
            ...(url ? [[{ text: "💳 Оплатить в ЮMoney", url }]] : []),
            [
              offerUrl
                ? { text: "📄 Публичная оферта", url: offerUrl }
                : { text: "📄 Публичная оферта", callback_data: "MENU_OFFER" },
            ],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
    };

    // ---------------- FREE START ----------------
    if (data === "FREE_START") {
      if (!canUseFreeTariff(userId)) {
        const nextAt = getNextFreeTariffAt(userId);
        const nextText = nextAt
          ? `Следующая бесплатная попытка будет доступна ${nextAt.toLocaleDateString("ru-RU")}.`
          : "Следующая бесплатная попытка будет доступна позже.";
        await safeEdit(`⚠️ Бесплатный тариф доступен раз в 30 дней.\n${nextText}`, backToMenuKb);
        return;
      }
      setState(userId, { plan: "free", paid: false, step: "consent_flow" });
      await showConsentMenu();
      return;
    }

    // ---------------- PAYMENT START ----------------
    if (data === "PAY_START_PRO" || data === "PAY_START_PREMIUM") {
      setState(userId, { plan: data === "PAY_START_PREMIUM" ? "premium" : "pro", paid: false });

      const st = getState(userId);
      if (st.consentPd && st.consentThird) {
        await goToPaymentScreen();
      } else {
        setState(userId, { step: "consent_flow" });
        await showConsentMenu();
      }
      return;
    }

    if (data === "PAY_CONTINUE") {
      await showPaymentButton();
      return;
    }

    // ---------------- PRIVACY IN FLOW ----------------
    if (data === "PRIVACY_IN_FLOW") {
      await safeEdit(textTemplates.privacyInConsentFlow, {
        reply_markup: {
          inline_keyboard: [[{ text: "Далее к соглашениям", callback_data: "CONSENT_MENU" }]],
        },
      });
      return;
    }

    if (data === "CONSENT_MENU") {
      await showConsentMenu();
      return;
    }

    // ---------------- DOCS IN FLOW ----------------
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
      setState(userId, { consentPd: true });
      const st = getState(userId);
      if (st.consentPd && st.consentThird) {
        acceptAllConsents(userId);
        if (st.plan === "pro" || st.plan === "premium") {
          await goToPaymentScreen();
        } else {
          await safeEdit("✅ Согласия приняты. Теперь отправьте фото сообщением в этот чат.", {
            reply_markup: {
              inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]],
            },
          });
        }
      } else {
        await showConsentMenu();
      }
      return;
    }

    if (data === "CONSENT_THIRD_ACCEPT") {
      setState(userId, { consentThird: true });
      const st = getState(userId);
      if (st.consentPd && st.consentThird) {
        acceptAllConsents(userId);
        if (st.plan === "pro" || st.plan === "premium") {
          await goToPaymentScreen();
        } else {
          await safeEdit("✅ Согласия приняты. Теперь отправьте фото сообщением в этот чат.", {
            reply_markup: {
              inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]],
            },
          });
        }
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

    // fallback
    await safeEdit("Неизвестная команда. Откройте меню:", mainMenuKeyboard());
    return;
  }); // <-- закрываем bot.on("callback_query"...)
} // <-- закрываем callbackHandler
