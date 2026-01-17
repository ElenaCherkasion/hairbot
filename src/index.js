// src/index.js - УПРОЩЕННАЯ РАБОЧАЯ ВЕРСИЯ

console.log('🔧 Загрузка src/index.js...');

// Экспортируем функцию ДО всех импортов и кода
export async function startBot() {
  console.log('🚀 Функция startBot вызвана!');
  
  try {
    // Импорты внутри функции (чтобы ошибки не мешали экспорту)
    const { Telegraf, session } = await import('telegraf');
    const dotenv = await import('dotenv');
    const { sequelize } = await import('./database/connection.js');
    const logger = await import('./utils/logger.js');
    
    dotenv.default.config();
    
    console.log('✅ Все модули загружены');
    
    // Проверка переменных
    const botToken = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const openaiKey = process.env.OPENAI_API_KEY;
    
    if (!botToken || !openaiKey) {
      throw new Error('Отсутствуют обязательные переменные окружения');
    }
    
    // Подключение к БД
    await sequelize.authenticate();
    console.log('✅ Подключение к БД установлено');
    
    // Создание бота
    const bot = new Telegraf(botToken);
    bot.use(session());
    
    // Простой middleware
    bot.use(async (ctx, next) => {
      console.log(`📨 Сообщение от ${ctx.from?.id}`);
      await next();
    });
    
    // Загрузка обработчиков
    const startHandler = await import('./handlers/start.js');
    const photoHandler = await import('./handlers/photo.js');
    const tariffsHandler = await import('./handlers/tariffs.js');
    const callbackHandler = await import('./handlers/callback.js');
    
    startHandler.default(bot);
    photoHandler.default(bot);
    tariffsHandler.default(bot);
    callbackHandler.default(bot);
    
    // Получение информации о боте
    const botInfo = await bot.telegram.getMe();
    console.log(`🤖 Бот запущен: @${botInfo.username}`);
    
    // Запуск в режиме polling
    bot.launch();
    console.log('✅ Бот запущен в режиме polling');
    
    // Graceful shutdown
    process.once('SIGINT', () => {
      console.log('\n🛑 Остановка бота...');
      bot.stop('SIGINT');
      process.exit(0);
    });
    
    process.once('SIGTERM', () => {
      console.log('\n🛑 Остановка бота...');
      bot.stop('SIGTERM');
      process.exit(0);
    });
    
    return { bot, sequelize };
    
  } catch (error) {
    console.error('❌ Ошибка запуска бота:', error.message);
    console.error(error.stack);
    throw error;
  }
}

console.log('✅ Функция startBot экспортирована');
