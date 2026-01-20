// src/handlers/start.js
import textTemplates from "../utils/text-templates.js";
import { mainMenuKeyboard } from "../keyboards/main.js";
import { setState } from "../utils/storage.js";

export default function startHandler(bot) {
  bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) setState(userId, { step: "idle" });

    await ctx.reply(
      "Привет! Я HairBot ✂️\n\nВыберите тариф или откройте примеры анализа:",
      mainMenuKeyboard()
    );
  });

  bot.command("menu", async (ctx) => {
    await ctx.reply("Главное меню:", mainMenuKeyboard());
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
