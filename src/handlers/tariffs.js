// src/handlers/tariffs.js
import textTemplates from '../utils/text-templates.js';

export default function tariffsHandler(bot) {
  bot.command('tariffs', (ctx) => {
    ctx.reply(textTemplates.tariffs, { parse_mode: 'Markdown' });
  });
}
