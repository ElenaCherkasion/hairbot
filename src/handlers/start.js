// src/handlers/start.js
import textTemplates from "../utils/text-templates.js";
import { mainMenuKeyboard } from "../keyboards/main.js";
import { setState } from "../utils/storage.js";

export default function startHandler(bot) {
  bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) setState(userId, { step: "idle" });

    await ctx.reply(
      "Привет 🤍\n" +
        "Я здесь, чтобы помочь тебе лучше понять свою внешность.\n\n" +
        "Мы внимательно посмотрим на твои особенности и переведём это в понятные рекомендации.\n\n" +
        "Ты ничего не обязана менять.\n" +
        "Этот анализ не про «исправить», а про подчеркнуть то, что уже есть.\n\n" +
        "Когда будешь готова — можем начать 🌿"
    );

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
