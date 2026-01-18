// src/handlers/start.js
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

  // ТЕСТОВАЯ команда "оплата успешна" — пока без вебхука ЮMoney
  bot.command("pay_ok", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);
    if (!st.plan || st.plan === "free") {
      await ctx.reply("Сначала выберите тариф PRO или PREMIUM в меню.", backToMenuKeyboard());
      return;
    }

    setState(userId, { paid: true, step: "awaiting_photo" });

    await ctx.reply("✅ Оплата подтверждена (тестовый режим). Теперь можно продолжить.", mainMenuKeyboard());
  });
}
