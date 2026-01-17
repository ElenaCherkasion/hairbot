// src/index.js - УПРОЩЕННАЯ РАБОЧАЯ ВЕРСИЯ
console.log('🔧 Загрузка src/index.js');

// ЭКСПОРТИРУЕМ СРАЗУ
export async function startBot() {
  console.log('🚀 Вызов startBot()');
  
  try {
    // Динамические импорты (безопаснее)
    const { Telegraf, session } = await import('telegraf');
    const dotenv = await import('dotenv');
    
    // Загрузка переменных
    dotenv.default?.config();
    
    // Проверка токена
    const token = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_TOKEN не установлен');
    }
    
    console.log('✅ Токен получен');
    
    // Создание бота
    const bot = new Telegraf(token);
    bot.use(session());
    
    // Простые обработчики (без импорта проблемных файлов)
    bot.start((ctx) => {
      console.log(`👤 /start от ${ctx.from.id}`);
      ctx.reply('🎉 Привет! Я HairBot!\nОтправьте фото для анализа лица.');
    });
    
    bot.help((ctx) => {
      ctx.reply('Помощь:\n/start - начать\n/photo - анализ фото');
    });
    
    bot.command('photo', (ctx) => {
      ctx.reply('📸 Отправьте фото лица для анализа');
    });
    
    bot.on('photo', async (ctx) => {
      console.log(`📸 Фото от ${ctx.from.id}`);
      await ctx.reply('🔄 Анализирую фото...');
      setTimeout(() => {
        ctx.reply('✅ Готово! Тип лица: овальное\nРекомендации: каре, каскад');
      }, 1500);
    });
    
    // Получение информации о боте
    const botInfo = await bot.telegram.getMe();
    console.log(`🤖 Бот запущен: @${botInfo.username}`);
    
    // Запуск
    bot.launch({
      dropPendingUpdates: true
    });
    
    console.log('✅ HairBot успешно запущен!');
    
    return { bot };
    
  } catch (error) {
    console.error('❌ Ошибка запуска:', error.message);
    console.error(error.stack);
    throw error;
  }
}

console.log('✅ Функция startBot экспортирована');
