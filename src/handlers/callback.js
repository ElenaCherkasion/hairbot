// src/handlers/callback.js
import textTemplates from "../utils/text-templates.js";
import { mainMenuKeyboard } from "../keyboards/main.js";
import { getState, setState } from "../utils/storage.js";

export default function callbackHandler(bot) {
  // ловим текст после "Сообщить об ошибке"
  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);

    if (st.step === "wait_error_text") {
      setState(userId, { step: "idle" });
      // TODO: сохранить в БД error_reports
      await ctx.reply(
        "✅ Спасибо! Сообщение об ошибке принято. Мы рассмотрим обращение.",
        mainMenuKeyboard()
      );
    }
  });

  bot.on("callback_query", async (ctx) => {
    const userId = ctx.from?.id;
    const data = ctx.callbackQuery?.data;
    if (!userId || !data) return;

    await ctx.answerCbQuery();

    // helper: иногда editMessageText не срабатывает (например, сообщение уже не редактируется)
    const safeEdit = async (html) => {
      try {
        await ctx.editMessageText(html, {
          parse_mode: "HTML",
          ...mainMenuKeyboard(),
        });
      } catch (e) {
        await ctx.reply(html, {
          parse_mode: "HTML",
          ...mainMenuKeyboard(),
        });
      }
    };

    // ====== MENU ROUTES ======
    if (data === "MENU_START") {
      await safeEdit(textTemplates.start);
      return;
    }

    if (data === "MENU_TARIFFS") {
      await safeEdit(textTemplates.tariffs);
      return;
    }

    // MENU_WHATSIN = сравнение тарифов
    if (data === "MENU_WHATSIN") {
      await safeEdit(textTemplates.tariffsCompare);
      return;
    }

    if (data === "MENU_ABOUT") {
      await safeEdit(textTemplates.about);
      return;
    }

    if (data === "MENU_PAYMENTS") {
      await safeEdit(textTemplates.payments);
      return;
    }

    if (data === "MENU_PRIVACY") {
      await safeEdit(textTemplates.privacy);
      return;
    }

    if (data === "MENU_DELETE") {
      await safeEdit(textTemplates.deleteData);
      return;
    }

    if (data === "MENU_SUPPORT") {
      await safeEdit(textTemplates.support);
      return;
    }

    if (data === "MENU_ERROR") {
      setState(userId, { step: "wait_error_text" });
      await ctx.reply(textTemplates.error, {
        parse_mode: "HTML",
        ...mainMenuKeyboard(),
      });
      return;
    }

    // Если пришёл неизвестный callback — просто игнорируем/можно логировать
  });
}
