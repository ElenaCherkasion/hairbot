// src/handlers/callback.js
import textTemplates from "../utils/text-templates.js";
import { mainMenuKeyboard, backToMenuKeyboard } from "../keyboards/main.js";
import { replyLong } from "../utils/reply-long.js";
import { getState, setState, resetUserData, acceptAllConsents } from "../utils/storage.js";

export default function callbackHandler(bot) {
  // ловим текст после "Сообщить об ошибке"
  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);
    if (st.step === "wait_error_text") {
      setState(userId, { step: "idle" });
      // TODO: сохранить в БД error_reports
      await ctx.reply("✅ Спасибо! Сообщение об ошибке принято. Мы рассмотрим обращение.", backToMenuKeyboard());
    }
  });

  bot.on("callback_query", async (ctx) => {
    const userId = ctx.from?.id;
    const data = ctx.callbackQuery?.data;
    if (!userId || !data) return;

    await ctx.answerCbQuery().catch(() => {});

    // MENU
    if (data === "MENU_HOME") {
      await ctx.reply("Главное меню:", mainMenuKeyboard());
      return;
    }

    if (data === "MENU_START") {
      await ctx.reply(textTemplates.tariffs, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "FREE", callback_data: "TARIFF_free" }],
            [{ text: "PRO", callback_data: "TARIFF_pro" }],
            [{ text: "PREMIUM", callback_data: "TARIFF_premium" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    if (data === "MENU_TARIFFS") {
      await ctx.reply(textTemplates.tariffs, backToMenuKeyboard());
      return;
    }

    if (data === "MENU_PAYMENTS") {
      // ВАЖНО: без Markdown + разбиение на части
      await replyLong(ctx, textTemplates.docs.payments, backToMenuKeyboard());
      return;
    }

    if (data === "MENU_PRIVACY") {
      // ✅ FIX: больше не зависает
      await replyLong(ctx, textTemplates.docs.privacy, backToMenuKeyboard());
      return;
    }

    if (data === "MENU_SUPPORT") {
      await ctx.reply(textTemplates.support, backToMenuKeyboard());
      return;
    }

    if (data === "MENU_ERROR") {
      setState(userId, { step: "wait_error_text" });
      await ctx.reply(textTemplates.errorPrompt, {
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Отмена", callback_data: "MENU_HOME" }]] },
      });
      return;
    }

    if (data === "MENU_DELETE") {
      await ctx.reply(textTemplates.deleteWarning, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🗑 Удалить мои данные", callback_data: "DELETE_STEP1" }],
            [{ text: "❌ Отмена", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    if (data === "DELETE_STEP1") {
      await ctx.reply("Подтвердите удаление персональных данных. Это действие нельзя отменить.", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔥 Подтвердить удаление", callback_data: "DELETE_CONFIRM" }],
            [{ text: "❌ Отмена", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    if (data === "DELETE_CONFIRM") {
      resetUserData(userId);
      await ctx.reply("✅ Ваши персональные данные удалены. Для повторного использования потребуется новое согласие.", mainMenuKeyboard());
      return;
    }

    // DOCS
    if (data === "DOC_CONSENT_PD") {
      await replyLong(ctx, textTemplates.docs.consentPd, backToMenuKeyboard());
      return;
    }
    if (data === "DOC_CONSENT_THIRD") {
      await replyLong(ctx, textTemplates.docs.consentThird, backToMenuKeyboard());
      return;
    }

    // CONSENTS
    if (data === "CONSENT_DECLINE") {
      await ctx.reply(
        "Без согласия я не могу обрабатывать фото и сообщения.\nВы можете вернуться в меню или обратиться в поддержку.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🆘 Поддержка", callback_data: "MENU_SUPPORT" }],
              [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
            ],
          },
        }
      );
      return;
    }

    if (data === "CONSENT_ACCEPT_ALL") {
      const st = getState(userId);
      if (!st.paid) {
        await ctx.reply("⚠️ Согласие запрашивается после оплаты. Сначала оплатите тариф. (Тест: /pay_ok)", backToMenuKeyboard());
        return;
      }
      acceptAllConsents(userId);
      await ctx.reply("✅ Согласия приняты. Теперь пришлите фото лица.", backToMenuKeyboard());
      return;
    }

    // TARIFF SELECT
    if (data.startsWith("TARIFF_")) {
      const plan = data.replace("TARIFF_", "");
      if (!["free", "pro", "premium"].includes(plan)) return;

      // строго: при смене тарифа сбрасываем оплату/согласия
      setState(userId, {
        plan,
        paid: false,
        consentPd: false,
        consentThird: false,
        consentPdAt: null,
        consentThirdAt: null,
        consentPdVersion: null,
        consentThirdVersion: null,
        consentPdHash: null,
        consentThirdHash: null,
        step: "awaiting_payment",
        deleted: false,
      });

      if (plan === "free") {
        await ctx.reply("Вы выбрали FREE.\nДля анализа по фото нужен PRO или PREMIUM.", backToMenuKeyboard());
        return;
      }

      await ctx.reply(
        `Вы выбрали ${plan.toUpperCase()}.\n\nДля продолжения оплатите тариф.\n(Тест: /pay_ok)\nПосле оплаты появится окно согласий.`,
        backToMenuKeyboard()
      );
      return;
    }

    // fallback
    await ctx.reply("Неизвестное действие. Вернитесь в меню.", mainMenuKeyboard());
  });
}
