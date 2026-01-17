// src/index.js - СУПЕР ПРОСТОЙ РАБОЧИЙ КОД
console.log('✅ src/index.js загружен');

// ЭКСПОРТИРУЕМ функцию ПЕРВОЙ СТРОКОЙ
export async function startBot() {
  console.log('🚀 Функция startBot() вызвана!');
  
  try {
    // Самый простой импорт telegraf
    const { Telegraf } = await import('telegraf');
    
    // Проверяем токен
    const botToken = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new Error('TELEGRAM_TOKEN не установлен');
    }
    
    // Создаем бота
    const bot = new Telegraf(botToken);
    
    // Простейшая команда
    bot.start((ctx) => {
      console.log(`Пользователь ${ctx.from.id} запустил бота`);
      ctx.reply('Привет! Я HairBot! 🎉');
    });
    
    // Команда help
    bot.help((ctx) => {
      ctx.reply('Отправьте фото для анализа лица');
    });
    
    // Любое сообщение
    bot.on('text', (ctx) => {
      ctx.reply('Отправьте фото для анализа или используйте /start');
    });
    
    // Получаем информацию о боте
    const botInfo = await bot.telegram.getMe();
    console.log(`🤖 Бот: @${botInfo.username} (ID: ${botInfo.id})`);
    
    // Запускаем
    bot.launch();
    console.log('✅ Бот запущен в режиме polling');
    
    return { bot };
    
  } catch (error) {
    console.error('❌ Ошибка запуска:', error.message);
    console.error(error.stack);
    throw error;
  }
}

console.log('✅ Экспорт завершен');
