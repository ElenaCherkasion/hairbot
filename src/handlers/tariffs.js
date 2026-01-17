// src/handlers/tariffs.js
import textTemplates from "../utils/text-templates.js";
import { backToMenuKeyboard } from "../keyboards/main.js";

export default function tariffsHandler(bot) {
  bot.command("tariffs", async (ctx) => {
    await ctx.reply(textTemplates.tariffs, { parse_mode: "Markdown", ...backToMenuKeyboard() });
  });
}
