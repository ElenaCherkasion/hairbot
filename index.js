import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fetch from "node-fetch";

// ================== КОНСТАНТЫ ==================
const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PRIVACY_POLICY_URL = "https://ваш-сайт.ru/privacy";
const SUPPORT_EMAIL = "cherkashina720@gmail.com";

// Проверяем обязательные переменные
if (!TELEGRAM_TOKEN) {
  console.error("❌ ОШИБКА: TELEGRAM_TOKEN не установлен");
  process.exit(1);
}

console.log("✅ Бот запускается...");

// ================== ТЕСТОВЫЕ ЦЕНЫ ==================
const TEST_PRICES = {
  basic: 500,    // 5 рублей
  pro: 1000,     // 10 рублей
  premium: 1500  // 15 рублей
};

const getPriceDisplay = (tariff) => {
  const price = TEST_PRICES[tariff] || 0;
  return `${price / 100}₽`;
};

// ================== СОСТОЯНИЕ ПОЛЬЗОВАТЕЛЕЙ ==================
const userStates = new Map();

// ================== TELEGRAM API ==================
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

async function telegramRequest(method, data) {
  try {
    const response = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      timeout: 10000
    });
    return await response.json();
  } catch (error) {
    console.error(`Ошибка Telegram API (${method}):`, error.message);
    return { ok: false };
  }
}

async function sendMessage(chatId, text, replyMarkup = null) {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
    disable_web_page_preview: true
  });
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  return telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text
  });
}

// ================== КЛАВИАТУРЫ ==================
const Keyboards = {
  main: {
    inline_keyboard: [
      [{ text: "📚 О сервисе HAIRbot", callback_data: "about" }],
      [{ text: "📖 Примеры разборов", callback_data: "examples" }],
      [{ text: "🎁 БЕСПЛАТНЫЙ АНАЛИЗ", callback_data: "free" }],
      [{ text: `💎 BASIC - ${getPriceDisplay('basic')} (тест)`, callback_data: "basic" }],
      [{ text: `✨ PRO - ${getPriceDisplay('pro')} (тест)`, callback_data: "pro" }],
      [{ text: `👑 PREMIUM - ${getPriceDisplay('premium')} (тест)`, callback_data: "premium" }],
      [
        { text: "💰 Сравнить тарифы", callback_data: "tariffs" },
        { text: "🔒 Политика", url: PRIVACY_POLICY_URL }
      ],
      [
        { text: "📧 Поддержка", url: `mailto:${SUPPORT_EMAIL}` },
        { text: "🏠 Главное меню", callback_data: "menu" }
      ]
    ]
  },
  
  back: {
    inline_keyboard: [[{ text: "🏠 Главное меню", callback_data: "menu" }]]
  },
  
  consent: {
    inline_keyboard: [
      [{ text: "✅ Согласен(а)", callback_data: "consent_yes" }],
      [{ text: "❌ Не согласен(а)", callback_data: "consent_no" }]
    ]
  }
};

// ================== ОБРАБОТЧИКИ ==================
async function handleStart(userId, chatId) {
  const message = 
    `👋 <b>Добро пожаловать в HAIRbot!</b>\n\n` +
    `💰 <b>ТЕСТОВЫЙ РЕЖИМ</b>\n` +
    `Цены для тестирования:\n` +
    `• BASIC: ${getPriceDisplay('basic')}\n` +
    `• PRO: ${getPriceDisplay('pro')}\n` +
    `• PREMIUM: ${getPriceDisplay('premium')}\n\n` +
    `Я помогу подобрать идеальную стрижку по форме вашего лица.\n` +
    `Выберите действие:`;
  
  await sendMessage(chatId, message, Keyboards.main);
}

async function handleAbout(userId, chatId) {
  const message = 
    `📋 <b>О сервисе HAIRbot</b>\n\n` +
    `Автоматизированный анализ формы лица и подбор стрижек.\n\n` +
    `🔹 <b>Как это работает:</b>\n` +
    `1. Вы отправляете фото лица\n` +
    `2. ИИ анализирует форму и пропорции\n` +
    `3. Получаете рекомендации стрижек\n` +
    `4. Смотрите визуализации\n\n` +
    `🔒 <b>Конфиденциальность:</b>\n` +
    `• Фото удаляются после анализа\n` +
    `• Личность не определяется\n` +
    `• Данные не передаются третьим лицам без согласия\n\n` +
    `📧 <b>Поддержка:</b> ${SUPPORT_EMAIL}`;
  
  await sendMessage(chatId, message, Keyboards.back);
}

async function handleTariffs(userId, chatId) {
  const message = 
    `💰 <b>Тарифы HAIRbot</b>\n\n` +
    `🎯 <b>ТЕСТОВЫЕ ЦЕНЫ (для проверки работы)</b>\n\n` +
    `🎁 <b>БЕСПЛАТНЫЙ</b> (1 раз)\n` +
    `• Определение формы лица\n` +
    `• 2 рекомендации\n` +
    `• 2 изображения\n\n` +
    `💎 <b>BASIC - ${getPriceDisplay('basic')}</b>\n` +
    `• Полный анализ лица\n` +
    `• 3 рекомендации стрижек\n` +
    `• 3 изображения\n\n` +
    `✨ <b>PRO - ${getPriceDisplay('pro')}</b>\n` +
    `• Всё из BASIC +\n` +
    `• Анализ цветотипа\n` +
    `• 4 рекомендации с цветами\n` +
    `• PDF-отчет\n\n` +
    `👑 <b>PREMIUM - ${getPriceDisplay('premium')}</b>\n` +
    `• Всё из PRO +\n` +
    `• Учёт текстуры волос\n` +
    `• 5 рекомендаций\n` +
    `• Приоритетная обработка\n\n` +
    `⚠️ <i>Это тестовые цены для проверки работы бота.</i>\n\n` +
    `📧 <b>Поддержка:</b> ${SUPPORT_EMAIL}`;
  
  await sendMessage(chatId, message, Keyboards.main);
}

async function handleExamples(userId, chatId) {
  const message = 
    `📖 <b>Примеры разборов</b>\n\n` +
    `Посмотрите, как работает HAIRbot на реальных примерах:\n\n` +
    `👩 <b>Пример 1:</b> Овальное лицо\n` +
    `• Форма: овальная\n` +
    `• Рекомендации: каскад, длинный боб\n` +
    `• Цвет: холодные каштановые оттенки\n\n` +
    `👩 <b>Пример 2:</b> Круглое лицо\n` +
    `• Форма: круглая\n` +
    `• Рекомендации: асимметричная стрижка\n` +
    `• Цвет: медовые блики\n\n` +
    `👩 <b>Пример 3:</b> Квадратное лицо\n` +
    `• Форма: квадратная\n` +
    `• Рекомендации: длинные слои\n` +
    `• Цвет: шоколадный\n\n` +
    `📧 <b>Вопросы?</b> Пишите: ${SUPPORT_EMAIL}`;
  
  await sendMessage(chatId, message, Keyboards.back);
}

async function handleTariffSelection(userId, chatId, tariff) {
  if (tariff === 'free') {
    // Сохраняем состояние
    userStates.set(userId, { mode: tariff, awaitingPhoto: true });
    
    await sendMessage(chatId,
      `🎁 <b>Бесплатный анализ</b>\n\n` +
      `📸 <b>Отправьте фото лица:</b>\n` +
      `• Лицо анфас\n` +
      `• Хорошее освещение\n` +
      `• Чёткое изображение\n` +
      `• Без очков/головных уборов`,
      Keyboards.back
    );
  } else {
    // Для платных тарифов показываем сообщение о тестовом режиме
    await sendMessage(chatId,
      `💳 <b>Оплата тарифа ${tariff.toUpperCase()}</b>\n\n` +
      `В тестовом режиме оплата временно недоступна.\n` +
      `Сумма: <b>${getPriceDisplay(tariff)}</b> (тестовая цена)\n\n` +
      `📧 <b>Для тестирования оплаты свяжитесь с поддержкой:</b>\n` +
      `${SUPPORT_EMAIL}`,
      Keyboards.back
    );
  }
}

async function handlePhoto(userId, chatId, photo) {
  const state = userStates.get(userId);
  
  if (!state?.awaitingPhoto) {
    await sendMessage(chatId,
      "📸 Сначала выберите тариф в меню.",
      Keyboards.main
    );
    return;
  }
  
  const tariff = state.mode || 'free';
  
  // Начинаем обработку
  await sendMessage(chatId,
    `⏳ <b>Начинаю анализ...</b>\n\n` +
    `Тариф: <b>${tariff.toUpperCase()}</b>\n` +
    `Пожалуйста, подождите...`,
    Keyboards.back
  );
  
  // Имитация обработки
  setTimeout(async () => {
    await sendMessage(chatId,
      `✅ <b>Анализ завершён!</b>\n\n` +
      `В тестовом режиме модуль анализа работает в упрощённом виде.\n\n` +
      `📧 <b>Вопросы или предложения?</b>\n` +
      `${SUPPORT_EMAIL}`,
      Keyboards.main
    );
    
    // Очищаем состояние
    userStates.delete(userId);
  }, 3000);
}

// ================== ОБРАБОТКА ОБНОВЛЕНИЙ ==================
async function handleUpdate(update) {
  console.log(`📨 Получен update ID: ${update.update_id}`);
  console.log('📄 Содержимое update:', JSON.stringify(update, null, 2)); // ВАЖНО: увидим структуру

  try {
    // Обработка сообщений
    if (update.message) {
      const userId = update.message.from.id;
      const chatId = update.message.chat.id;
      const text = update.message.text || '';
      
      console.log(`👤 Пользователь ${userId} в чате ${chatId} написал: "${text}"`);

      if (text === '/start') {
        console.log('🎯 Обнаружена команда /start, вызываю handleStart...');
        await handleStart(userId, chatId);
        console.log('✅ handleStart выполнен (вроде бы)');
        return;
      }

      if (update.message.photo?.length > 0) {
        console.log('🖼️ Получено фото...');
        const photo = update.message.photo[update.message.photo.length - 1];
        await handlePhoto(userId, chatId, photo);
        return;
      }

      if (text) {
        console.log('📝 Отправляю стандартный ответ на текст...');
        await sendMessage(chatId, "🤖 Используйте кнопки меню или отправьте /start", Keyboards.main);
      }
    }

    // Обработка callback-запросов (кнопок)
    if (update.callback_query) {
      console.log('🔄 Обрабатываю нажатие кнопки...');
      const callback = update.callback_query;
      const userId = callback.from.id;
      const chatId = callback.message.chat.id;
      const data = callback.data;

      await answerCallbackQuery(callback.id);
      console.log(`🔼 Callback data: "${data}" от пользователя ${userId}`);

      switch(data) {
        case 'menu':
          await handleStart(userId, chatId);
          break;
        case 'about':
          await handleAbout(userId, chatId);
          break;
        // ... остальные case
        default:
          await sendMessage(chatId, "Неизвестная команда", Keyboards.main);
          break;
      }
    }

    console.log(`✓ Update ${update.update_id} обработан без видимых ошибок.`);

  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА в handleUpdate:', error);
    console.error('Стек ошибки:', error.stack);
  }
}
// ================== EXPRESS APP ==================
const app = express();

// Middleware для парсинга JSON
app.use(express.json({ limit: "10mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok",
    service: "HAIRbot",
    timestamp: new Date().toISOString(),
    test_mode: true,
    support_email: SUPPORT_EMAIL
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>HAIRbot</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .container { text-align: center; }
        h1 { color: #333; }
        .status { color: green; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🤖 HAIRbot</h1>
        <p class="status">✅ Сервис работает</p>
        <p>Тестовый режим с ценами:</p>
        <ul>
          <li>BASIC: ${getPriceDisplay('basic')}</li>
          <li>PRO: ${getPriceDisplay('pro')}</li>
          <li>PREMIUM: ${getPriceDisplay('premium')}</li>
        </ul>
        <p>📧 Поддержка: ${SUPPORT_EMAIL}</p>
        <p><a href="/health">Проверить статус</a></p>
      </div>
    </body>
    </html>
  `);
});

// Webhook endpoint
app.post("/webhook", async (req, res) => {
  console.log("📨 Webhook получен");
  
  // Всегда отвечаем OK, чтобы Telegram не повторял запрос
  res.status(200).send('OK');
  
  // Обрабатываем update асинхронно
  if (req.body && req.body.update_id) {
    try {
      await handleUpdate(req.body);
    } catch (error) {
      console.error("❌ Ошибка в обработке webhook:", error);
    }
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`
🎉 HAIRbot запущен!
📍 Порт: ${PORT}
💰 Режим: ТЕСТОВЫЙ
📧 Поддержка: ${SUPPORT_EMAIL}
🌐 Health: http://localhost:${PORT}/health
📨 Webhook: http://localhost:${PORT}/webhook
  `);
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
  console.error('❌ Необработанная ошибка:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанный промис:', reason);
});
