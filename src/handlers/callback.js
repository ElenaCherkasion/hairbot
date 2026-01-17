// src/handlers/callback.js
export default function callbackHandler(bot) {
  bot.on('callback_query', async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    
    console.log(`🔘 Callback от ${userId}: ${callbackData}`);
    
    await ctx.answerCbQuery();
    
    if (callbackData.startsWith('tariff_')) {
      const tariff = callbackData.replace('tariff_', '');
      await ctx.reply(
        `Вы выбрали тариф "${tariff}"\n\nДля оплаты используйте команду /pay`,
        { parse_mode: 'Markdown' }
      );
    }
  });
}
