import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { КОНФИГ, проверитьКонфигурацию } from './config.js';
import { logger } from './utils/logger.js';

// ================== ИНИЦИАЛИЗАЦИЯ ==================
console.log('🤖 Запуск HAIRbot...');

// Проверяем конфигурацию
if (!проверитьКонфигурацию()) {
  console.error('❌ Неверная конфигурация. Завершение работы.');
  process.exit(1);
}

// Инициализируем Express
const приложение = express();

// Middleware
приложение.use(express.json({ limit: '10mb' }));
приложение.use(express.urlencoded({ extended: true }));

// ================== ПОДКЛЮЧЕНИЕ БАЗЫ ДАННЫХ ==================
let базаДанныхГотова = false;
try {
  const { testDatabaseConnection } = await import('./database/connection.js');
  базаДанныхГотова = await testDatabaseConnection();
  
  if (базаДанныхГотова) {
    console.log('✅ База данных подключена');
  } else {
    console.warn('⚠️  База данных не подключена. Некоторые функции будут недоступны.');
  }
} catch (error) {
  console.warn('⚠️  Не удалось подключиться к базе данных:', error.message);
}

// ================== ИНИЦИАЛИЗАЦИЯ OPENAI ==================
let openaiДоступен = false;
try {
  const { isOpenAIAvailable } = await import('./services/ai-service.js');
  openaiДоступен = isOpenAIAvailable();
  
  if (openaiДоступен) {
    console.log('✅ OpenAI доступен');
  } else {
    console.warn('⚠️  OpenAI не доступен. Будут использоваться тестовые данные.');
  }
} catch (error) {
  console.warn('⚠️  Не удалось инициализировать OpenAI:', error.message);
}

// ================== СОСТОЯНИЕ ПОЛЬЗОВАТЕЛЕЙ ==================
const состояниеПользователей = new Map();

// Очистка старых состояний каждые 5 минут
setInterval(() => {
  const сейчас = Date.now();
  let удалено = 0;
  
  for (const [userId, состояние] of состояниеПользователей.entries()) {
    if (сейчас - состояние.timestamp > КОНФИГ.ОЧИСТКА_ЧАСЫ * 60 * 60 * 1000) {
      состояниеПользователей.delete(userId);
      удалено++;
    }
  }
  
  if (удалено > 0 && КОНФИГ.РЕЖИМ_ОТЛАДКИ) {
    console.log(`🧹 Очищено ${удалено} устаревших состояний`);
  }
}, 5 * 60 * 1000);

// ================== TELEGRAM API ФУНКЦИИ ==================
import { 
  запросТелеграм, 
  отправитьСообщение, 
  ответитьНаCallback,
  получитьФайлТелеграм,
  проверитьТокенБота 
} from './utils/telegram-api.js';

// ================== ИМПОРТ ОБРАБОТЧИКОВ ==================
import { 
  handleStart,
  handlePhoto,
  handleCallback,
  handleTariffSelection 
} from './handlers/index.js';

// ================== ОБРАБОТКА ОБНОВЛЕНИЙ TELEGRAM ==================
async function обработкаОбновления(update) {
  if (КОНФИГ.РЕЖИМ_ОТЛАДКИ) {
    console.log('📨 Полчен обновление:', update.update_id);
  }
  
  try {
    // Обработка сообщений
    if (update.message) {
      const userId = update.message.from.id;
      const chatId = update.message.chat.id;
      const текст = update.message.text || '';
      
      logger.logCommand(userId, текст || 'фото', {
        username: update.message.from.username,
        first_name: update.message.from.first_name
      });
      
      if (текст === '/start' || текст === '/menu') {
        await handleStart(userId, chatId);
        return;
      }
      
      if (update.message.photo?.length > 0) {
        const фото = update.message.photo[update.message.photo.length - 1];
        const состояние = состояниеПользователей.get(userId);
        
        if (состояние?.awaitingPhoto) {
          await handlePhoto(userId, chatId, фото, состояние.tariff);
          состояниеПользователей.delete(userId);
        } else {
          await отправитьСообщение(chatId, 
            '📸 Сначала выберите тариф в меню.',
            { inline_keyboard: [[{ text: "🏠 Главное меню", callback_data: "menu" }]] }
          );
        }
        return;
      }
      
      if (текст) {
        await отправитьСообщение(chatId, 
          '🤖 Используйте кнопки меню или отправьте /start',
          { inline_keyboard: [[{ text: "🏠 Главное меню", callback_data: "menu" }]] }
        );
      }
    }
    
    // Обработка callback-запросов (кнопок)
    if (update.callback_query) {
      const callback = update.callback_query;
      const userId = callback.from.id;
      const chatId = callback.message.chat.id;
      const данные = callback.data;
      
      await ответитьНаCallback(callback.id);
      
      switch(данные) {
        case 'menu':
          await handleStart(userId, chatId);
          break;
        case 'about':
        case 'examples':
        case 'tariffs':
          await handleCallback(userId, chatId, данные);
          break;
        case 'free':
        case 'basic':
        case 'pro':
        case 'premium':
          // Сохраняем выбор тарифа
          состояниеПользователей.set(userId, {
            tariff: данные,
            awaitingPhoto: true,
            timestamp: Date.now()
          });
          await handleTariffSelection(userId, chatId, данные);
          break;
        default:
          await отправитьСообщение(chatId, 'Неизвестная команда', 
            { inline_keyboard: [[{ text: "🏠 Главное меню", callback_data: "menu" }]] }
          );
          break;
      }
    }
    
  } catch (error) {
    console.error('❌ Ошибка обработки обновления:', error);
    logger.error('Ошибка обработки обновления', error);
  }
}

// ================== WEBHOOK ЭНДПОИНТ ==================
приложение.post('/webhook', async (req, res) => {
  // Всегда отвечаем OK, чтобы Telegram не повторял запрос
  res.status(200).send('OK');
  
  // Обрабатываем обновление асинхронно
  if (req.body && req.body.update_id) {
    try {
      await обработкаОбновления(req.body);
    } catch (error) {
      console.error('❌ Ошибка в обработке webhook:', error);
    }
  }
});

// ================== HEALTH CHECK ==================
приложение.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'HAIRbot',
    version: '1.0.0',
    environment: КОНФИГ.ОКРУЖЕНИЕ,
    timestamp: new Date().toISOString(),
    features: {
      database: базаДанныхГотова,
      openai: openaiДоступен,
      test_mode: КОНФИГ.ТЕСТ_ПЛАТЕЖИ,
      max_free_analyses: КОНФИГ.МАКС_БЕСПЛАТНЫЕ
    },
    stats: {
      active_users: состояниеПользователей.size,
      support_email: КОНФИГ.ПОЧТА_ПОДДЕРЖКИ
    }
  });
});

// ================== ГЛАВНАЯ СТРАНИЦА ==================
приложение.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>HAIRbot - AI Стилист</title>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .container { text-align: center; }
        h1 { color: #333; }
        .status { color: green; font-weight: bold; }
        .btn { display: inline-block; background: #0088cc; color: white; padding: 10px 20px; 
               text-decoration: none; border-radius: 5px; margin: 10px; }
        .features { text-align: left; margin: 30px 0; padding: 20px; background: #f9f9f9; border-radius: 8px; }
        .footer { margin-top: 40px; font-size: 0.9em; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🤖 HAIRbot - Ваш персональный стилист</h1>
        <p class="status">✅ Сервис работает</p>
        
        <div class="features">
          <h3>✨ Возможности:</h3>
          <ul>
            <li>Анализ формы лица по фото с помощью ИИ</li>
            <li>Подбор идеальных стрижек</li>
            <li>Рекомендации по цвету волос</li>
            <li>Визуализация результатов</li>
          </ul>
        </div>
        
        <p><strong>Технологии:</strong> Telegram Bot API • OpenAI GPT-4 • Node.js</p>
        
        <div>
          <a href="/health" class="btn">🩺 Проверить статус</a>
          <a href="https://t.me/${КОНФИГ.ТОКЕН_ТЕЛЕГРАМ?.split(':')[0] || 'bot'}" class="btn" target="_blank">🚀 Начать в Telegram</a>
        </div>
        
        <div class="footer">
          <p>📧 Поддержка: ${КОНФИГ.ПОЧТА_ПОДДЕРЖКИ}</p>
          <p>🔒 Все фотографии удаляются сразу после анализа</p>
          <p>© ${new Date().getFullYear()} HAIRbot</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ================== ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ ==================
приложение.get('/privacy', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Политика конфиденциальности - HAIRbot</title>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        h1 { color: #333; text-align: center; }
        h2 { color: #444; margin-top: 30px; }
        .section { margin-bottom: 20px; }
        .contact { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <h1>🔒 Политика конфиденциальности HAIRbot</h1>
      <p style="text-align: center; color: #666;"><i>Версия 1.0 | Дата: ${new Date().toLocaleDateString('ru-RU')}</i></p>
      
      <div class="section">
        <h2>1. Использование OpenAI API</h2>
        <p>При отправке фото для анализа, изображение передается в OpenAI API для обработки. 
        OpenAI не хранит данные для обучения своих моделей.</p>
      </div>
      
      <div class="section">
        <h2>2. Собираемые данные</h2>
        <ul>
          <li>Telegram ID пользователя</li>
          <li>Фотографии лиц (удаляются после анализа)</li>
          <li>Результаты анализа формы лица</li>
          <li>История взаимодействия с ботом</li>
        </ul>
      </div>
      
      <div class="section">
        <h2>3. Хранение данных</h2>
        <p>Все фотографии удаляются сразу после анализа. Результаты анализа хранятся для улучшения сервиса.</p>
      </div>
      
      <div class="section contact">
        <h2>Контакты</h2>
        <p>📧 Email: <a href="mailto:${КОНФИГ.ПОЧТА_ПОДДЕРЖКИ}">${КОНФИГ.ПОЧТА_ПОДДЕРЖКИ}</a></p>
        <p><a href="/">← Вернуться на главную</a></p>
      </div>
    </body>
    </html>
  `);
});

// ================== ОБРАБОТКА 404 ==================
приложение.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head><title>404 - Страница не найдена</title></head>
    <body style="text-align: center; padding: 50px;">
      <h1>404 🤷‍♂️</h1>
      <p>Страница не найдена</p>
      <a href="/">Вернуться на главную</a>
    </body>
    </html>
  `);
});

// ================== ЗАПУСК СЕРВЕРА ==================
const server = приложение.listen(КОНФИГ.ПОРТ, () => {
  console.log(`
🎉 HAIRbot запущен!
📍 Порт: ${КОНФИГ.ПОРТ}
🌐 Режим: ${КОНФИГ.ОКРУЖЕНИЕ}
🤖 Бот: https://t.me/${КОНФИГ.ТОКЕН_ТЕЛЕГРАМ?.split(':')[0] || 'не настроен'}
📧 Поддержка: ${КОНФИГ.ПОЧТА_ПОДДЕРЖКИ}
🌐 Веб-сайт: http://localhost:${КОНФИГ.ПОРТ}/
🔒 Политика: http://localhost:${КОНФИГ.ПОРТ}/privacy
🩺 Health: http://localhost:${КОНФИГ.ПОРТ}/health
📨 Webhook: http://localhost:${КОНФИГ.ПОРТ}/webhook
  `);
  
  // Проверяем токен бота
  проверитьТокенБота().then(result => {
    if (result.valid) {
      console.log(`✅ Бот: @${result.bot.username} (${result.bot.first_name})`);
    }
  });
});

// ================== ОБРАБОТКА ЗАВЕРШЕНИЯ ==================
process.on('SIGTERM', () => {
  console.log('🔄 Получен SIGTERM. Завершение работы...');
  server.close(() => {
    console.log('✅ Сервер остановлен');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🔄 Получен SIGINT. Завершение работы...');
  server.close(() => {
    console.log('✅ Сервер остановлен');
    process.exit(0);
  });
});

// Обработка необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error('❌ Необработанная ошибка:', error);
  logger.error('Необработанная ошибка', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанный промис:', reason);
  logger.error('Необработанный промис', reason);
});

export default приложение;
