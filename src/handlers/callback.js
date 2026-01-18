// src/handlers/callback.js
import textTemplates from "../utils/text-templates.js";
import { mainMenuKeyboard } from "../keyboards/main.js";
import { getState, setState, resetUserState, deleteUserDataFromDB } from "../utils/storage.js";
import { sendSupportEmail } from "../utils/mailer.js";

// ⚠️ TODO: подключи pool так, как у тебя в проекте.
// Вариант 1: если у тебя pool экспортируется из db.js:
// import { pool } from "../utils/db.js";
//
// Вариант 2: если pool в index.js — передавай его в callbackHandler(bot, pool)
//
// Я сделаю универсально: callbackHandler(bot, pool)
export default function callbackHandler(bot, pool) {
  // ====== ловим текст после "Поддержка" / "Сообщить об ошибке" ======
  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);
    const msgText = ctx.message?.text || "";

    // SUPPORT
    if (st.step === "wait_support_text") {
      setState(userId, { step: "idle" });

      const subject = `HAIRbot Support | user_id=${userId}`;
      const text = `User ID: ${userId}\n\nMessage:\n${msgText}`;

      await sendSupportEmail({ subject, text });

      await ctx.reply("✅ Спасибо! Сообщение отправлено в поддержку.", mainMenuKeyboard());
      return;
    }

    // ERROR
    if (st.step === "wait_error_text") {
      setState(userId, { step: "idle" });

      const subject = `HAIRbot Bug Report | user_id=${userId}`;
      const text = `User ID: ${userId}\n\nBug report:\n${msgText}`;

      await sendSupportEmail({ subject, text });

      await ctx.reply("✅ Спасибо! Ошибка отправлена разработчику.", mainMenuKeyboard());
      return;
    }
  });

  bot.on("callback_query", async (ctx) => {
    const userId = ctx.from?.id;
    const data = ctx.callbackQuery?.data;
    if (!userId || !data) return;

    await ctx.answerCbQuery();

    const safeEditMenu = async (html, extraReplyMarkup) => {
      const payload = {
        parse_mode: "HTML",
        ...(extraReplyMarkup ? extraReplyMarkup : mainMenuKeyboard()),
      };

      try {
        await ctx.editMessageText(html, payload);
      } catch (e) {
        await ctx.reply(html, payload);
      }
    };

    // ====== MENU_HOME (если где-то используется backToMenuKeyboard) ======
    if (data === "MENU_HOME") {
      await safeEditMenu("Меню:", mainMenuKeyboard());
      return;
    }

    // ====== ТАРИФЫ (логически в меню) ======
    if (data === "MENU_TARIFF_FREE") {
      await safeEditMenu(textTemplates.tariffFree);
      return;
    }
    if (data === "MENU_TARIFF_PRO") {
      await safeEditMenu(textTemplates.tariffPro);
      return;
    }
    if (data === "MENU_TARIFF_PREMIUM") {
      await safeEditMenu(textTemplates.tariffPremium);
      return;
    }

    // ====== СРАВНЕНИЕ ======
    if (data === "MENU_WHATSIN") {
      await safeEditMenu(textTemplates.tariffsCompare);
      return;
    }

    // ====== ПРИМЕРЫ ======
    if (data === "MENU_EXAMPLES") {
      await safeEditMenu(textTemplates.examples);
      return;
    }

    // ====== PRIVACY (фикс: чтобы открывалось) ======
    if (data === "MENU_PRIVACY") {
      await safeEditMenu(textTemplates.privacy);
      return;
    }

    // ====== SUPPORT ======
    if (data === "MENU_SUPPORT") {
      setState(userId, { step: "wait_support_text" });
      await ctx.reply(textTemplates.supportPrompt, {
        parse_mode: "HTML",
        ...mainMenuKeyboard(),
      });
      return;
    }

    // ====== ERROR ======
    if (data === "MENU_ERROR") {
      setState(userId, { step: "wait_error_text" });
      await ctx.reply(textTemplates.errorPrompt, {
        parse_mode: "HTML",
        ...mainMenuKeyboard(),
      });
      return;
    }

    // ====== DELETE (flow) ======
    if (data === "MENU_DELETE") {
      const deleteConfirmKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Удалить", callback_data: "DELETE_CONFIRM" },
              { text: "❌ Не удалять", callback_data: "DELETE_CANCEL" },
            ],
          ],
        },
      };
      await safeEditMenu(textTemplates.deleteIntro, deleteConfirmKeyboard);
      return;
    }

    if (data === "DELETE_CANCEL") {
      await safeEditMenu(textTemplates.deleteCancelled);
      return;
    }

    if (data === "DELETE_CONFIRM") {
      // 1) удаляем из БД автоматически
      if (pool) {
        await deleteUserDataFromDB(pool, userId);
      } else {
        console.warn("⚠️ pool не передан в callbackHandler(bot, pool). Удаление из БД пропущено.");
      }

      // 2) сбрасываем локальное состояние
      resetUserState(userId);

      await safeEditMenu(textTemplates.deleteDone);
      return;
    }
  });
}
