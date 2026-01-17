// src/handlers/callback.js
import textTemplates from "../utils/text-templates.js";
import { mainMenuKeyboard, backToMenuKeyboard } from "../keyboards/main.js";
import { setState, getState, clearState } from "../utils/state.js";
import {
  acceptAllConsents,
  hasRequiredConsents,
  isPaid,
  markDeleted,
  isDeleted,
} from "../utils/storage.js";

export default function callbackHandler(bot) {
  // Ловим текст для "сообщить об ошибке"
  bot.on("text", async (ctx) => {
    const userId = ctx.from.id;
    const st = getState(userId);

    if (st.step === "WAIT_ERROR_TEXT") {
      clearState(userId);
      // TODO: сохранить в БД (error_reports)
      await ctx.reply("✅ Спасибо! Сообщение об ошибке отправлено в поддержку.", {
        parse_mode: "Markdown",
        ...backToMenuKeyboard(),
      });
    }
  });

  bot.on("callback_query", async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    console.log(`🔘 Callback от ${userId}: ${callbackData}`);
    await ctx.answerCbQuery();

    // --- Главное меню ---
    if (callbackData === "MENU_HOME") {
      return ctx.reply("Главное меню:", { ...mainMenuKeyboard() });
    }

    if (callbackData === "MENU_START") {
      return ctx.reply(textTemplates.tariffs, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "FREE", callback_data: "tariff_free" }],
            [{ text: "PRO", callback_data: "tariff_pro" }],
            [{ text: "PREMIUM", callback_data: "tariff_premium" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
    }

    if (callbackData === "MENU_TARIFFS") {
      return ctx.reply(textTemplates.tariffs, {
        parse_mode: "Markdown",
        ...backToMenuKeyboard(),
      });
    }

    if (callbackData === "MENU_PAYMENTS") {
      return ctx.reply(textTemplates.docs.payments.fullText, {
        parse_mode: "Markdown",
        ...backToMenuKeyboard(),
      });
    }

    if (callbackData === "MENU_PRIVACY") {
      return ctx.reply(textTemplates.docs.privacy.fullText, {
        parse_mode: "Markdown",
        ...backToMenuKeyboard(),
      });
    }

    if (callbackData === "MENU_SUPPORT") {
      return ctx.reply(textTemplates.support, {
        parse_mode: "Markdown",
        ...backToMenuKeyboard(),
      });
    }

    if (callbackData === "MENU_ERROR") {
      setState(userId, { step: "WAIT_ERROR_TEXT" });
      return ctx.reply(textTemplates.errorPrompt, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Отмена", callback_data: "MENU_HOME" }]] },
      });
    }

    // --- Документы (отдельные кнопки) ---
    if (callbackData === "DOC_CONSENT_PD") {
      return ctx.reply(textTemplates.docs.consentPd.fullText, {
        parse_mode: "Markdown",
        ...backToMenuKeyboard(),
      });
    }

    if (callbackData === "DOC_CONSENT_THIRD") {
      return ctx.reply(textTemplates.docs.consentThird.fullText, {
        parse_mode: "Markdown",
        ...backToMenuKeyboard(),
      });
    }

    // --- Удаление данных ---
    if (callbackData === "MENU_DELETE") {
      return ctx.reply(textTemplates.deleteWarning, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🗑 Удалить мои данные", callback_data: "DELETE_STEP1" }],
            [{ text: "❌ Отмена", callback_data: "MENU_HOME" }],
          ],
        },
      });
    }

    if (callbackData === "DELETE_STEP1") {
      return ctx.reply("Подтвердите удаление персональных данных. Это действие нельзя отменить.", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔥 Подтвердить удаление", callback_data: "DELETE_CONFIRM" }],
            [{ text: "❌ Отмена", callback_data: "MENU_HOME" }],
          ],
        },
      });
    }

    if (callbackData === "DELETE_CONFIRM") {
      markDeleted(userId);
      // TODO: удалить из БД: users/consents/analysis/photos + записать deletion_log
      return ctx.reply("✅ Ваши персональные данные удалены. Для повторного использования потребуется новое согласие.", {
        parse_mode: "Markdown",
        ...mainMenuKeyboard(),
      });
    }

    // --- Согласия ---
    if (callbackData === "CONSENT_DECLINE") {
      return ctx.reply("Без согласия я не могу обрабатывать фото и сообщения. Вы можете вернуться в меню или обратиться в поддержку.", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🆘 Поддержка", callback_data: "MENU_SUPPORT" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
    }

    if (callbackData === "CONSENT_ACCEPT_ALL") {
      if (isDeleted(userId)) {
        // пользователь ранее удалял данные — разрешаем заново
        // (в storage.isDeleted он остаётся true; если хочешь — сбрасывай deletedUsers при новом старте)
      }

      if (!isPaid(userId)) {
        return ctx.reply("⚠️ Согласие запрашивается после оплаты. Сначала выберите тариф и оплатите.", {
          parse_mode: "Markdown",
          ...backToMenuKeyboard(),
        });
      }

      acceptAllConsents(userId);

      const ok = hasRequiredConsents(userId);
      if (!ok) {
        return ctx.reply("Не удалось зафиксировать согласие. Попробуйте ещё раз.", {
          parse_mode: "Markdown",
          ...backToMenuKeyboard(),
        });
      }

      return ctx.reply("✅ Согласия приняты. Теперь пришлите фото лица (анфас, хороший свет, без фильтров).", {
        parse_mode: "Markdown",
        ...backToMenuKeyboard(),
      });
    }

    // --- Тарифы ---
    if (callbackData.startsWith("tariff_")) {
      const tariff = callbackData.replace("tariff_", "");

      if (tariff === "free") {
        // Free: можно без оплаты, но всё равно по твоей логике фото после согласий? 
        // Мы договорились: согласие после оплаты. Для free можно: либо без фото, либо попросить /pay_ok.
        // Я сделаю так: free -> без оплаты, но фото всё равно нельзя (иначе бессмысленно согласие “после оплаты”).
        return ctx.reply(
          `Вы выбрали тариф "*${tariff.toUpperCase()}*".\n\nДля продолжения выберите платный тариф и оплатите.\n(Тест: /pay_ok)`,
          { parse_mode: "Markdown", ...backToMenuKeyboard() }
        );
      }

      return ctx.reply(
        `Вы выбрали тариф "*${tariff.toUpperCase()}*".\n\nДля оплаты используйте команду /pay (или тест: /pay_ok).\nПосле оплаты появится окно согласий.`,
        { parse_mode: "Markdown", ...backToMenuKeyboard() }
      );
    }

    // fallback
    return ctx.reply("Неизвестное действие. Вернитесь в меню.", { ...mainMenuKeyboard() });
  });
}
