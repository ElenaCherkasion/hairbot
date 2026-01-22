// src/handlers/start.js
import textTemplates from "../utils/text-templates.js";
import { mainMenuKeyboard } from "../keyboards/main.js";
import { getState, setState } from "../utils/storage.js";
const buildSupportContactKeyboard = (username) => [
  ...(username ? [[{ text: `✅ Использовать ${username}`, callback_data: "SUPPORT_USE_USERNAME" }]] : []),
  [{ text: "✍️ Указать другой контакт", callback_data: "SUPPORT_ENTER_CONTACT" }],
  [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
];

export default function startHandler(bot, restartState) {
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId && restartState?.id) {
      const st = getState(userId);
      if (st.restartNoticeSeenId !== restartState.id) {
        setState(userId, { restartNoticeSeenId: restartState.id });
        await ctx.reply(textTemplates.restartNotice(restartState.reason), {
          parse_mode: "HTML",
        });
      }
    }
    return next();
  });

  bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) setState(userId, { step: "idle" });

    const payload = ctx.startPayload || ctx.message?.text?.split(" ")[1] || "";
    if (payload === "menu_support") {
      setState(userId, { step: "support_contact", supportContact: null, supportContactType: null });
      const username = ctx.from?.username ? `@${ctx.from.username}` : null;
      const keyboard = buildSupportContactKeyboard(username);
      await ctx.reply(textTemplates.supportContactPrompt(username, ""), {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
      return;
    }

    await ctx.reply(textTemplates.mainMenuDescription, { parse_mode: "HTML", ...mainMenuKeyboard() });
  });

  bot.command("menu", async (ctx) => {
    await ctx.reply(textTemplates.mainMenuDescription, { parse_mode: "HTML", ...mainMenuKeyboard() });
  });

  // тестовая команда
  bot.command("pay_ok", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) {
      setState(userId, { paid: true });
    }
    await ctx.reply("✅ Тест: оплата подтверждена (заглушка).");
  });
}
