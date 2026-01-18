// src/handlers/start.js
import textTemplates from "../utils/text-templates.js";
import { mainMenuKeyboard, backToMenuKeyboard } from "../keyboards/main.js";
import { getState, setState } from "../utils/storage.js";

export default function startHandler(bot) {
  bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    getState(userId); // ensure state exists
    await ctx.reply(
      "Привет! Я HairBot ✂️\n\nВыберите действие в меню ниже:",
      mainMenuKeyboard()
    );
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

    // оплачено — переходим к согласию
    setState(userId, { paid: true, step: "awaiting_consents" });

    const consentScreen = `
<b>✅ Остался один шаг</b>

Чтобы мы могли анализировать фото и сформировать <b>PDF-отчёт по визуальному коду</b>,
нужно принять согласия на обработку данных.

Нажмите кнопку ниже:
`.trim();

    await ctx.reply("✅ Оплата подтверждена (тестовый режим).", mainMenuKeyboard());

    await ctx.reply(consentScreen, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Принять и продолжить", callback_data: "CONSENT_ACCEPT_ALL" }],
          [{ text: "🔒 Политика конфиденциальности", callback_data: "MENU_PRIVACY" }],
          [{ text: "📄 Согласие на обработку ПДн", callback_data: "DOC_CONSENT_PD" }],
          [{ text: "📄 Согласие на передачу третьим лицам", callback_data: "DOC_CONSENT_THIRD" }],
          [{ text: "❌ Отказаться", callback_data: "CONSENT_DECLINE" }],
        ],
      },
    });
  });
}
