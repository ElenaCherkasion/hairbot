// src/handlers/start.js
import textTemplates from "../utils/text-templates.js";
import { mainMenuKeyboard } from "../keyboards/main.js";

export default function startHandler(bot) {
  bot.start(async (ctx) => {
    await ctx.reply(
      "Привет! Я HairBot ✂️\nВыберите действие в меню ниже:",
      { parse_mode: "Markdown", ...mainMenuKeyboard() }
    );
  });

  bot.command("menu", async (ctx) => {
    await ctx.reply("Главное меню:", { ...mainMenuKeyboard() });
  });

  // Тестовая команда, чтобы включить оплату (потом заменишь реальной оплатой)
  bot.command("pay_ok", async (ctx) => {
    const userId = ctx.from.id;
    const { markPaid } = await import("../utils/storage.js");
    markPaid(userId);
    await ctx.reply("✅ Оплата отмечена (тестовый режим). Теперь нужно принять согласия.", {
      parse_mode: "Markdown",
    });
    await ctx.reply(textTemplates.consentScreen, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Принять и продолжить", callback_data: "CONSENT_ACCEPT_ALL" }],
          [{ text: "📄 Политика конфиденциальности", callback_data: "MENU_PRIVACY" }],
          [{ text: "📄 Согласие на обработку ПДн", callback_data: "DOC_CONSENT_PD" }],
          [{ text: "📄 Согласие на передачу третьим лицам", callback_data: "DOC_CONSENT_THIRD" }],
          [{ text: "❌ Отказаться", callback_data: "CONSENT_DECLINE" }],
          [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
        ],
      },
    });
  });
}
