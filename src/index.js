#!/usr/bin/env node
// src/index.js - ОСНОВНОЙ КОД БОТА

console.log('🔧 Загрузка src/index.js...');

// ЭКСПОРТ ФУНКЦИИ В САМОМ НАЧАЛЕ (чтобы модуль всегда был валидным)
export async function startBot() {
  console.log('🚀 Вызов функции startBot()');
  
  try {
    // Динамические импорты (безопаснее, чем статические)
    const { Telegraf, session } = await import('telegraf');
    const dotenv = await import('dotenv');
    const express = await import('express');
    
    // Загрузка переменных окружения
    dotenv.default.config();
    
    // Проверка обязательных переменных
    const botToken = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const openaiKey = process.env.OPENAI_API_KEY;
    
    if (!botToken) {
      throw new Error('TELEGRAM_TOKEN не установлен');
    }
    if (!openaiKey) {
      console.warn('⚠️  OPENAI_API_KEY не установлен (некоторые функции не будут работать)');
    }
    
    console.log('✅ Переменные окружения проверены');
    
    // Инициализация бота
    const bot = new Telegraf(botToken);
    bot.use(session());
    
    // Middleware для логирования
    bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      const username = ctx.from?.username;
      console.log(`📨 Сообщение от @${username || 'unknown'} (${userId})`);
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
    
    // Инициализация Express
    const app = express.default();
    const PORT = process.env.PORT || 3000;
    
    // Базовая конфигурация Express
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'hairbot'
      });
    });
    
    // Запуск Express сервера
    app.listen(PORT, () => {
      console.log(`🚀 Express сервер запущен на порту ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
    
    // Получение информации о боте
    const botInfo = await bot.telegram.getMe();
    console.log(`🤖 Бот запущен: @${botInfo.username} (ID: ${botInfo.id})`);
    
    // Запуск бота в режиме polling
    bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'callback_query']
    });
    
    console.log('✅ HairBot успешно запущен!');
    console.log('🔄 Бот работает в режиме polling');
    
    // Graceful shutdown
    process.once('SIGINT', () => {
      console.log('\n🛑 Получен SIGINT. Остановка бота...');
      bot.stop('SIGINT');
      process.exit(0);
    });
    
    process.once('SIGTERM', () => {
      console.log('\n🛑 Получен SIGTERM. Остановка бота...');
      bot.stop('SIGTERM');
      process.exit(0);
    });
    
    return { bot, app };
    
  } catch (error) {
    console.error('❌ Ошибка запуска бота:', error.message);
    console.error(error.stack);
    throw error;
  }
}

console.log('✅ Модуль src/index.js загружен, функция startBot экспортирована');

// Автозапуск если файл запущен напрямую (для тестирования)
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🔧 Прямой запуск src/index.js');
  startBot().catch(error => {
    console.error('Критическая ошибка:', error);
    process.exit(1);
  });
}
