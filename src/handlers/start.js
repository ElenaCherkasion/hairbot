// src/handlers/start.js
import textTemplates from '../utils/text-templates.js';

export default function startHandler(bot) {
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    const firstName = ctx.from.first_name;
    
    console.log(`👤 Новый пользователь: @${username} (${userId})`);
    
    await ctx.reply(
      textTemplates.welcome(firstName),
      { parse_mode: 'Markdown' }
    );
  });

  bot.help((ctx) => {
    ctx.reply(textTemplates.help, { parse_mode: 'Markdown' });
  });
}
