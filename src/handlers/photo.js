// src/handlers/photo.js
import textTemplates from '../utils/text-templates.js';

export default function photoHandler(bot) {
  bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    
    console.log(`📸 Фото от пользователя ${userId}`);
    
    await ctx.reply(
      '🔄 Анализирую ваше фото...\nЭто займет несколько секунд.',
      { parse_mode: 'Markdown' }
    );
    
    // Имитация анализа
    setTimeout(async () => {
      await ctx.reply(
        '✅ Анализ завершен!\n\n**Тип лица:** Овальное\n**Рекомендации:**\n• Стрижки с объемом на макушке\n• Асимметричные стрижки\n• Каре с челкой\n\n💡 Для получения полного анализа выберите тариф!',
        { parse_mode: 'Markdown' }
      );
      
      await ctx.reply(textTemplates.tariffs, { parse_mode: 'Markdown' });
    }, 2000);
  });

  bot.command('photo', (ctx) => {
    ctx.reply(textTemplates.photoInstructions, { parse_mode: 'Markdown' });
  });
}
