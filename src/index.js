import config from './config.js';

// Импорт основных модулей
import { Telegraf, session } from 'telegraf';
import dotenv from 'dotenv';
import { sequelize } from './database/connection.js';
import logger from './utils/logger.js';

// Импорт middleware для Express (если используется вебхук)
import express from 'express';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';

// Импорт обработчиков
import startHandler from './handlers/start.js';
import photoHandler from './handlers/photo.js';
import tariffsHandler from './handlers/tariffs.js';
import callbackHandler from './handlers/callback.js';
import { setupWebhook } from './handlers/index.js';

// Загрузка переменных окружения
dotenv.config();

// Проверка обязательных переменных окружения
const requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  logger.error(`❌ Отсутствуют обязательные переменные окружения: ${missingVars.join(', ')}`);
  logger.info('💡 Создайте файл .env на основе .env.example и заполните все значения');
  process.exit(1);
}

// Инициализация бота
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Настройка сессии
bot.use(session());

// Middleware для логирования всех входящих сообщений
bot.use(async (ctx, next) => {
  const startTime = Date.now();
  const userId = ctx.from?.id;
  const username = ctx.from?.username;
  const chatType = ctx.chat?.type;
  const messageType = ctx.message?.photo ? 'photo' : 
                     ctx.message?.text ? 'text' : 
                     ctx.callbackQuery ? 'callback' : 
                     'unknown';

  logger.info(`📨 Входящее сообщение: ${messageType} от @${username || 'unknown'} (ID: ${userId}) в ${chatType || 'unknown'}`);

  try {
    await next();
  } catch (error) {
    logger.error(`❌ Ошибка обработки сообщения: ${error.message}`);
    logger.error(error.stack);
    
    try {
      await ctx.reply('Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте позже или обратитесь в поддержку.');
    } catch (replyError) {
      logger.error(`❌ Не удалось отправить сообщение об ошибке: ${replyError.message}`);
    }
  } finally {
    const processingTime = Date.now() - startTime;
    logger.info(`⏱️  Время обработки: ${processingTime}ms`);
    
    // Логируем медленные запросы
    if (processingTime > 5000) {
      logger.warn(`🐌 Медленный запрос: ${processingTime}ms для пользователя ${userId}`);
    }
  }
});

// Middleware для проверки бана пользователя
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  const bannedUsers = process.env.BANNED_USERS ? process.env.BANNED_USERS.split(',').map(Number) : [];
  
  if (bannedUsers.includes(userId)) {
    logger.warn(`🚫 Заблокированный пользователь ${userId} попытался отправить сообщение`);
    await ctx.reply('Ваш доступ к боту ограничен. Если вы считаете это ошибкой, обратитесь в поддержку.');
    return;
  }
  
  await next();
});

// Middleware для лимита запросов на уровне бота
const userRequestTimestamps = new Map();
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  const now = Date.now();
  const userTimestamps = userRequestTimestamps.get(userId) || [];
  
  // Оставляем только метки времени за последнюю минуту
  const recentTimestamps = userTimestamps.filter(timestamp => now - timestamp < 60000);
  
  if (recentTimestamps.length >= 20) { // Макс 20 запросов в минуту на пользователя
    logger.warn(`🚫 Превышен лимит запросов для пользователя ${userId}`);
    await ctx.reply('Вы отправляете слишком много запросов. Пожалуйста, подождите 1 минуту.');
    return;
  }
  
  recentTimestamps.push(now);
  userRequestTimestamps.set(userId, recentTimestamps);
  
  // Очистка старых записей каждые 5 минут
  if (Math.random() < 0.01) { // 1% chance
    for (const [uid, timestamps] of userRequestTimestamps.entries()) {
      const cleaned = timestamps.filter(timestamp => now - timestamp < 300000); // 5 минут
      if (cleaned.length === 0) {
        userRequestTimestamps.delete(uid);
      } else {
        userRequestTimestamps.set(uid, cleaned);
      }
    }
  }
  
  await next();
});

// Регистрация обработчиков
startHandler(bot);
photoHandler(bot);
tariffsHandler(bot);
callbackHandler(bot);

// Обработка ошибок бота
bot.catch((error, ctx) => {
  logger.error(`🚨 Ошибка Telegraf: ${error.message}`);
  logger.error(error.stack);
  
  try {
    ctx.reply('Произошла внутренняя ошибка бота. Мы уже работаем над её устранением.');
  } catch (replyError) {
    logger.error(`❌ Не удалось отправить сообщение об ошибке: ${replyError.message}`);
  }
});

// Инициализация Express приложения для вебхуков
const app = express();

// Базовые middleware для безопасности
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Настройка CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || []
    : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Парсинг JSON
app.use(express.json({
  limit: '10mb', // Увеличенный лимит для изображений
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Парсинг URL-encoded данных
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Сжатие ответов (gzip/brotli)
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Rate limiting для API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // 100 запросов с одного IP
  message: { error: 'Слишком много запросов с вашего IP. Пожалуйста, попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Пропускаем health check
    if (req.path === '/health') return true;
    // Пропускаем запросы от trusted IPs
    const trustedIPs = process.env.TRUSTED_IPS ? process.env.TRUSTED_IPS.split(',') : [];
    return trustedIPs.includes(req.ip);
  }
});

app.use('/api/', apiLimiter);

// Более строгий лимит для вебхуков
const webhookLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 минут
  max: 50, // 50 запросов с одного IP
  message: { error: 'Слишком много запросов к вебхуку.' },
  standardHeaders: true
});

// Middleware для логирования HTTP запросов
app.use((req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;
  
  res.send = function(data) {
    const processingTime = Date.now() - startTime;
    const logData = {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString()
    };
    
    if (res.statusCode >= 400) {
      logger.error(`HTTP Error: ${JSON.stringify(logData)}`);
    } else if (processingTime > 1000) {
      logger.warn(`Медленный HTTP запрос: ${JSON.stringify(logData)}`);
    } else {
      logger.http(`HTTP Request: ${JSON.stringify(logData)}`);
    }
    
    originalSend.call(this, data);
  };
  
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: 'unknown',
    bot: 'unknown'
  };
  
  try {
    // Проверка подключения к базе данных
    await sequelize.authenticate();
    health.database = 'connected';
    
    // Проверка состояния бота
    const botInfo = await bot.telegram.getMe();
    health.bot = {
      id: botInfo.id,
      username: botInfo.username,
      firstName: botInfo.first_name
    };
    
    res.json(health);
  } catch (error) {
    health.status = 'unhealthy';
    health.error = error.message;
    health.database = 'disconnected';
    res.status(503).json(health);
  }
});

// API endpoint для статистики
app.get('/api/stats', async (req, res) => {
  try {
    const { User, Analysis, Payment } = await import('./database/models/index.js');
    
    const userCount = await User.count();
    const analysisCount = await Analysis.count();
    const paymentCount = await Payment.count();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const newUsersToday = await User.count({
      where: {
        createdAt: {
          [sequelize.Op.gte]: today
        }
      }
    });
    
    const stats = {
      users: {
        total: userCount,
        newToday: newUsersToday
      },
      analyses: {
        total: analysisCount
      },
      payments: {
        total: paymentCount
      },
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
      }
    };
    
    res.json(stats);
  } catch (error) {
    logger.error(`Ошибка получения статистики: ${error.message}`);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// Webhook endpoint
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, webhookLimiter, (req, res) => {
  logger.info(`Webhook получен: ${req.body?.update_id || 'unknown'}`);
  bot.handleUpdate(req.body, res).catch(error => {
    logger.error(`Ошибка обработки webhook: ${error.message}`);
    res.status(500).send('Internal Server Error');
  });
});

// Обработка 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error(`Unhandled error: ${error.message}`);
  logger.error(error.stack);
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Функция запуска бота
async function startBot() {
  try {
    // Проверка подключения к базе данных
    await sequelize.authenticate();
    logger.info('✅ Подключение к базе данных установлено');
    
    // Синхронизация моделей (только в development)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('✅ Модели базы данных синхронизированы');
    }
    
    // Проверка токена бота
    const botInfo = await bot.telegram.getMe();
    logger.info(`🤖 Бот запущен: @${botInfo.username} (${botInfo.first_name})`);
    
    // Запуск в зависимости от режима
    if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
      // Режим вебхука для продакшена
      const PORT = process.env.PORT || 3000;
      
      await setupWebhook(bot, process.env.WEBHOOK_URL);
      logger.info(`🌐 Webhook установлен на ${process.env.WEBHOOK_URL}`);
      
      app.listen(PORT, () => {
        logger.info(`🚀 Сервер запущен на порту ${PORT}`);
        logger.info(`🔗 Webhook endpoint: /webhook/${process.env.TELEGRAM_BOT_TOKEN}`);
        logger.info(`📊 Health check: http://localhost:${PORT}/health`);
        logger.info(`📈 Статистика: http://localhost:${PORT}/api/stats`);
      });
    } else {
      // Режим polling для разработки
      logger.info('🔄 Запуск в режиме polling...');
      bot.launch({
        dropPendingUpdates: process.env.DROP_PENDING_UPDATES === 'true',
        allowedUpdates: ['message', 'callback_query']
      });
      
      // Запуск Express для health check даже в режиме polling
      const PORT = process.env.PORT || 3001;
      app.listen(PORT, () => {
        logger.info(`🌐 Express сервер запущен на порту ${PORT} (для health check)`);
      });
    }
    
    // Graceful shutdown
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
  } catch (error) {
    logger.error(`❌ Ошибка запуска бота: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  logger.info(`⚠️  Получен сигнал ${signal}. Завершение работы...`);
  
  try {
    // Остановка бота
    bot.stop(signal);
    logger.info('🤖 Бот остановлен');
    
    // Закрытие подключения к БД
    await sequelize.close();
    logger.info('🗄️  Подключение к базе данных закрыто');
    
    logger.info('👋 Завершение работы');
    process.exit(0);
  } catch (error) {
    logger.error(`❌ Ошибка при graceful shutdown: ${error.message}`);
    process.exit(1);
  }
}

// Запуск бота
startBot();

// Экспорт для тестов
export { bot, app };
