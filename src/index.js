#!/usr/bin/env node
// src/index.js - ОСНОВНОЙ КОД БОТА

import { Telegraf, session } from 'telegraf';
import dotenv from 'dotenv';
import { sequelize } from './database/connection.js';
import logger from './utils/logger.js';

// Express для вебхуков (если нужно)
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

// Проверка обязательных переменных
const requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Отсутствуют обязательные переменные окружения: ${missingVars.join(', ')}`);
  console.error('💡 Установите их в Render Dashboard → Environment');
  process.exit(1);
}

// Инициализация бота (используем let, чтобы можно было переопределить если нужно)
const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;
let bot;

// Инициализация Express приложения для вебхуков
const app = express();

// ================ КОНФИГУРАЦИЯ ================

// Middleware для безопасности
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // 100 запросов с одного IP
  message: { error: 'Слишком много запросов с вашего IP. Пожалуйста, попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// ================ HEALTH CHECK ================

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: 'unknown',
    bot: 'unknown',
    version: process.env.npm_package_version || '1.0.0'
  };
  
  try {
    // Проверка базы данных
    await sequelize.authenticate();
    health.database = 'connected';
    
    // Проверка бота
    if (bot) {
      const botInfo = await bot.telegram.getMe();
      health.bot = {
        id: botInfo.id,
        username: botInfo.username,
        firstName: botInfo.first_name
      };
    }
    
    res.json(health);
  } catch (error) {
    health.status = 'unhealthy';
    health.error = error.message;
    health.database = 'disconnected';
    res.status(503).json(health);
  }
});

// ================ СТАТИСТИКА ================

// Статистика
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

// ================ WEBHOOK ENDPOINT ================

// Webhook endpoint (будет настроен позже)
app.post('/webhook/:token', (req, res) => {
  const { token } = req.params;
  if (token === botToken && bot) {
    logger.info(`Webhook получен: ${req.body?.update_id || 'unknown'}`);
    bot.handleUpdate(req.body, res).catch(error => {
      logger.error(`Ошибка обработки webhook: ${error.message}`);
      res.status(500).send('Internal Server Error');
    });
  } else {
    res.status(403).send('Forbidden');
  }
});

// ================ ОБРАБОТКА ОШИБОК ================

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

// ================ ГЛАВНАЯ ФУНКЦИЯ ЗАПУСКА БОТА ================

export async function startBot() {
  try {
    logger.info('🚀 Запуск HairBot...');
    
    // 1. Проверка подключения к базе данных
    await sequelize.authenticate();
    logger.info('✅ Подключение к базе данных установлено');
    
    // 2. Синхронизация моделей (только в development)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('✅ Модели базы данных синхронизированы');
    }
    
    // 3. Инициализация бота (если еще не инициализирован)
    if (!bot) {
      bot = new Telegraf(botToken);
      
      // Настройка сессии
      bot.use(session());

      // Middleware для логирования
      bot.use(async (ctx, next) => {
        const startTime = Date.now();
        const userId = ctx.from?.id;
        const username = ctx.from?.username;
        const messageType = ctx.message?.photo ? 'photo' : 
                          ctx.message?.text ? 'text' : 
                          ctx.callbackQuery ? 'callback' : 
                          'unknown';

        logger.info(`📨 ${messageType} от @${username || userId} (ID: ${userId})`);

        try {
          await next();
        } catch (error) {
          logger.error(`❌ Ошибка обработки: ${error.message}`);
          
          try {
            await ctx.reply('Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте позже или обратитесь в поддержку.');
          } catch (replyError) {
            logger.error(`❌ Не удалось отправить сообщение об ошибке: ${replyError.message}`);
          }
        } finally {
          const processingTime = Date.now() - startTime;
          logger.debug(`⏱️  Время обработки: ${processingTime}ms`);
        }
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
    }
    
    // 4. Получение информации о боте
    const botInfo = await bot.telegram.getMe();
    const botId = botInfo.id;
    logger.info(`🤖 Бот: @${botInfo.username} (ID: ${botId})`);
    
    // 5. Определение режима запуска
    const isProduction = process.env.NODE_ENV === 'production';
    const hasWebhookUrl = process.env.WEBHOOK_URL;
    const PORT = process.env.PORT || 3000;
    
    // 6. Запуск Express сервера
    app.listen(PORT, () => {
      logger.info(`🚀 Express сервер запущен на порту ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`📈 Статистика: http://localhost:${PORT}/api/stats`);
      if (hasWebhookUrl) {
        logger.info(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook/${botToken}`);
      }
    });
    
    // 7. Настройка режима работы бота
    if (isProduction && hasWebhookUrl) {
      // Режим вебхука для продакшена
      logger.info(`🌐 Режим: Webhook (Production)`);
      logger.info(`🔗 Webhook URL: ${process.env.WEBHOOK_URL}`);
      
      await setupWebhook(bot, process.env.WEBHOOK_URL);
    } else {
      // Режим polling для разработки
      logger.info(`🌐 Режим: Polling (${isProduction ? 'Production' : 'Development'})`);
      
      // Запуск бота в режиме polling
      bot.launch({
        dropPendingUpdates: isProduction,
        allowedUpdates: ['message', 'callback_query', 'inline_query']
      });
      
      logger.info('🔄 Бот запущен в режиме polling');
    }
    
    // 8. Graceful shutdown
    process.once('SIGINT', () => {
      logger.info('🛑 Получен SIGINT. Остановка бота...');
      if (bot) {
        bot.stop('SIGINT');
      }
      process.exit(0);
    });
    
    process.once('SIGTERM', () => {
      logger.info('🛑 Получен SIGTERM. Остановка бота...');
      if (bot) {
        bot.stop('SIGTERM');
      }
      process.exit(0);
    });
    
    // 9. Успешный запуск
    logger.info('✅ HairBot успешно запущен и готов к работе!');
    
    return { bot, app, sequelize };
    
  } catch (error) {
    logger.error(`❌ Ошибка запуска бота: ${error.message}`);
    logger.error(error.stack);
    throw error;
  }
}

// Если файл запущен напрямую (например, для тестирования)
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🔧 Прямой запуск src/index.js');
  startBot().catch(error => {
    console.error('Критическая ошибка при запуске:', error);
    process.exit(1);
  });
}
