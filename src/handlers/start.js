// src/handlers/start.js
import textTemplates from "../utils/text-templates.js";
import { mainMenuKeyboard, backToMenuKeyboard } from "../keyboards/main.js";
import { getState, setState } from "../utils/storage.js";

export default function startHandler(bot) {
  bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    getState(userId); // ensure state exists
    await ctx.reply("Привет! Я HairBot ✂️\n\nВыберите действие в меню ниже:", mainMenuKeyboard());
  });

  bot.command("menu", async (ctx) => {
    await ctx.reply("Главное меню:", mainMenuKeyboard());
  });

  // ТЕСТОВАЯ команда "оплата успешна" — заменишь на реальную оплату
  bot.command("pay_ok", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);
    if (!st.plan || st.plan === "free") {
      await ctx.reply("Сначала выберите тариф PRO или PREMIUM в меню.", backToMenuKeyboard());
      return;
    }

    setState(userId, { paid: true, step: "awaiting_consents" });

    await ctx.reply("✅ Оплата подтверждена (тестовый режим). Теперь нужно принять согласия.");
    await ctx.reply(textTemplates.consentScreen, {
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
