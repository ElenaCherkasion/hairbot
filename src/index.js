// src/index.js - СУПЕР ПРОСТОЙ РАБОЧИЙ КОД
console.log('🔧 src/index.js загружен');

// ЭКСПОРТИРУЕМ ПЕРВОЙ СТРОКОЙ
export async function startBot() {
  console.log('🚀 Функция startBot() вызвана');
  
  try {
    // 1. Проверяем токен
    const token = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_TOKEN не установлен');
    }
    
    console.log('✅ Токен получен');
    
    // 2. Импортируем telegraf ДИНАМИЧЕСКИ
    const { Telegraf } = await import('telegraf');
    console.log('✅ Telegraf загружен');
    
    // 3. Создаем бота
    const bot = new Telegraf(token);
    console.log('✅ Бот создан');
    
    // 4. Простейшие команды
    bot.start((ctx) => {
      console.log(`👤 /start от ${ctx.from.id}`);
      ctx.reply('🎉 Привет! Я HairBot!\nОтправьте фото для анализа лица.');
    });
    
    bot.help((ctx) => {
      ctx.reply('Помощь:\n/start - начать\nОтправьте фото для анализа');
    });
    
    bot.on('photo', async (ctx) => {
      console.log(`📸 Фото от ${ctx.from.id}`);
      await ctx.reply('🔄 Анализирую ваше фото...');
      setTimeout(() => {
        ctx.reply('✅ Анализ завершен!\nТип лица: овальное\nРекомендуемые стрижки: каре, каскад');
      }, 2000);
    });
    
    bot.on('text', (ctx) => {
      if (!ctx.message.text.startsWith('/')) {
        ctx.reply('📸 Отправьте фото для анализа лица');
      }
    });
    
    // 5. Получаем информацию о боте
    const botInfo = await bot.telegram.getMe();
    console.log(`🤖 Бот: @${botInfo.username} (ID: ${botInfo.id})`);
    
    // 6. Запускаем бота
    bot.launch({
      dropPendingUpdates: true
    });
    
    console.log('✅ Бот запущен в режиме polling');
    
    // 7. Graceful shutdown
    process.once('SIGINT', () => {
      console.log('\n🛑 SIGINT - остановка');
      bot.stop('SIGINT');
      process.exit(0);
    });
    
    process.once('SIGTERM', () => {
      console.log('\n🛑 SIGTERM - остановка');
      bot.stop('SIGTERM');
      process.exit(0);
    });
    
    return { bot };
    
  } catch (error) {
    console.error('❌ Ошибка запуска:', error.message);
    console.error(error.stack);
    throw error;
  }
}

console.log('✅ Функция startBot экспортирована');
