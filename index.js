import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fetch from "node-fetch";
import pg from "pg";

const { Pool } = pg;

// ================== КОНСТАНТЫ И КОНФИГУРАЦИЯ ==================
const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PROVIDER_TOKEN = process.env.PROVIDER_TOKEN;
const PRIVACY_POLICY_URL = process.env.PRIVACY_POLICY_URL || "https://ваш-сайт.ru/privacy";

// Валидация переменных окружения
const validateEnv = () => {
  const required = ['TELEGRAM_TOKEN', 'OPENAI_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА: Отсутствуют переменные: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  console.log("✅ Все обязательные переменные окружения установлены");
};

validateEnv();

// ================== STATE MANAGEMENT ==================
class UserStateManager {
  constructor() {
    this.states = new Map();
    this.seenUpdateIds = new Set();
  }

  get(userId) {
    return this.states.get(userId) || {};
  }

  set(userId, data) {
    const current = this.get(userId);
    this.states.set(userId, { ...current, ...data });
  }

  clear(userId) {
    this.states.delete(userId);
  }

  isDuplicateUpdate(updateId) {
    if (this.seenUpdateIds.has(updateId)) {
      return true;
    }
    this.seenUpdateIds.add(updateId);
    // Очищаем через 1 минуту
    setTimeout(() => this.seenUpdateIds.delete(updateId), 60000);
    return false;
  }
}

const userState = new UserStateManager();

// ================== DATABASE SERVICE ==================
class DatabaseService {
  constructor() {
    this.pool = null;
    this.connected = false;
  }

  async initialize() {
    if (!process.env.DATABASE_URL) {
      console.log("⚠️ DATABASE_URL не установлен, работа без базы данных");
      return false;
    }

    try {
      console.log("🔗 Подключаюсь к PostgreSQL...");
      
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });

      await this.pool.query('SELECT 1'); // Проверка подключения
      console.log("✅ PostgreSQL подключен успешно");
      
      await this.createTables();
      this.connected = true;
      global.dbConnected = true;
      
      return true;
    } catch (error) {
      console.error("❌ Ошибка инициализации базы данных:", error.message);
      return false;
    }
  }

  async query(query, params = []) {
    if (!this.connected || !this.pool) {
      console.log("⚠️ База данных недоступна для запроса:", query.substring(0, 50));
      return { rows: [], rowCount: 0 };
    }
    
    try {
      return await this.pool.query(query, params);
    } catch (error) {
      console.error("Ошибка запроса к базе данных:", error.message);
      return { rows: [], rowCount: 0 };
    }
  }

  async createTables() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS user_consents (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        consent_type VARCHAR(50) NOT NULL,
        granted BOOLEAN NOT NULL,
        granted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, consent_type)
      )`,
      `CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        amount DECIMAL(10,2),
        tariff VARCHAR(50),
        payment_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )`
    ];

    for (const tableSQL of tables) {
      await this.query(tableSQL);
    }

    console.log("✅ Таблицы базы данных готовы");
  }
}

const db = new DatabaseService();

// ================== CONSENT SERVICE ==================
class ConsentService {
  constructor() {
    this.REQUIRED_CONSENTS = ['pd_processing', 'third_party_transfer'];
  }

  async saveConsent(userId, consentType, granted) {
    try {
      await db.query(
        `INSERT INTO user_consents (user_id, consent_type, granted)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, consent_type) 
         DO UPDATE SET granted = $3, granted_at = NOW()`,
        [userId, consentType, granted]
      );
      return true;
    } catch (error) {
      console.error("❌ Ошибка сохранения согласия:", error.message);
      return false;
    }
  }

  async hasAllConsents(userId) {
    try {
      const result = await db.query(
        `SELECT consent_type FROM user_consents 
         WHERE user_id = $1 AND granted = true`,
        [userId]
      );
      
      const grantedConsents = result.rows.map(row => row.consent_type);
      return this.REQUIRED_CONSENTS.every(consent => grantedConsents.includes(consent));
    } catch (error) {
      console.error("❌ Ошибка проверки согласий:", error.message);
      return false;
    }
  }

  async checkMissingConsents(userId) {
    try {
      const result = await db.query(
        `SELECT consent_type FROM user_consents WHERE user_id = $1 AND granted = true`,
        [userId]
      );
      
      const grantedConsents = result.rows.map(row => row.consent_type);
      return this.REQUIRED_CONSENTS.filter(consent => !grantedConsents.includes(consent));
    } catch (error) {
      console.error("❌ Ошибка проверки отсутствующих согласий:", error.message);
      return this.REQUIRED_CONSENTS;
    }
  }

  getConsentText(step) {
    const texts = {
      1: {
        title: "📋 Согласие на обработку персональных данных",
        text: `Я даю согласие на обработку моего имени и фото только для анализа изображения.\n` +
              `• Личность не определяется\n` +
              `• Лицо не распознаётся\n` +
              `• Биометрия не создаётся и не хранится\n` +
              `• Фото используется для ответа и удаляется сразу после обработки\n\n` +
              `🔗 Полная версия: <a href="${PRIVACY_POLICY_URL}">Политика обработки ПДн</a>\n\n` +
              `<b>Вы согласны на обработку персональных данных?</b>`
      },
      2: {
        title: "🌐 Согласие на передачу данных третьему лицу",
        text: `Я согласен(на) на передачу моего фото внешнему сервису только для анализа изображения.\n` +
              `• Личность не определяется\n` +
              `• Лицо не распознаётся\n` +
              `• Биометрия не создаётся и не хранится\n` +
              `• Фото удаляется после обработки\n` +
              `• Возможна трансграничная передача (OpenAI, США)\n\n` +
              `<b>Вы даёте согласие на передачу персональных данных?</b>`
      }
    };
    
    return texts[step] || texts[1];
  }
}

const consentService = new ConsentService();

// ================== TELEGRAM SERVICE ==================
class TelegramService {
  constructor() {
    this.apiUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
  }

  async request(method, data) {
    try {
      const response = await fetch(`${this.apiUrl}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        timeout: 10000
      });
      
      const result = await response.json();
      
      if (!result.ok) {
        console.error(`Ошибка Telegram API (${method}):`, result.description);
      }
      
      return result;
    } catch (error) {
      console.error(`Ошибка подключения к Telegram API (${method}):`, error.message);
      return { ok: false };
    }
  }

  async sendMessage(chatId, text, replyMarkup = null) {
    return this.request('sendMessage', {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
      disable_web_page_preview: true
    });
  }

  async answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
    return this.request('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: text,
      show_alert: showAlert
    });
  }

  async sendInvoice(userId, chatId, tariff) {
    const tariffs = {
      'basic': { price: 29900, name: "BASIC", description: "Полный анализ + 3 рекомендации" },
      'pro': { price: 59900, name: "PRO", description: "Анализ с цветотипом + PDF" },
      'premium': { price: 99900, name: "PREMIUM", description: "Расширенный анализ + приоритет" }
    };
    
    const tariffInfo = tariffs[tariff];
    if (!tariffInfo) return { ok: false };
    
    const payload = `${tariff}_${userId}_${Date.now()}`;
    
    userState.set(userId, { 
      selectedTariff: tariff,
      invoicePayload: payload
    });
    
    return this.request('sendInvoice', {
      chat_id: chatId,
      title: `HAIRbot - Тариф ${tariffInfo.name}`,
      description: tariffInfo.description,
      payload: payload,
      provider_token: PROVIDER_TOKEN,
      currency: "RUB",
      prices: [{ label: "Тариф", amount: tariffInfo.price }]
    });
  }
}

const telegram = new TelegramService();

// ================== KEYBOARDS ==================
const Keyboards = {
  main: {
    inline_keyboard: [
      [{ text: "📋 О сервисе", callback_data: "about" }],
      [{ text: "💰 Тарифы", callback_data: "tariffs" }],
      [{ text: "🎁 Бесплатный анализ", callback_data: "free" }],
      [{ text: "💎 BASIC - 299₽", callback_data: "basic" }],
      [{ text: "✨ PRO - 599₽", callback_data: "pro" }],
      [{ text: "👑 PREMIUM - 999₽", callback_data: "premium" }],
      [{ text: "🔒 Политика конфиденциальности", url: PRIVACY_POLICY_URL }]
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
  },
  
  requireConsent: (tariff = null) => {
    const buttons = [
      [{ text: "📝 Пройти процедуру согласия", callback_data: tariff ? `consent_${tariff}` : "consent" }],
      [{ text: "🔒 Политика", url: PRIVACY_POLICY_URL }],
      [{ text: "🏠 Главное меню", callback_data: "menu" }]
    ];
    
    return { inline_keyboard: buttons };
  }
};

// ================== HANDLERS ==================
class BotHandlers {
  static async start(userId, chatId) {
    const hasConsents = await consentService.hasAllConsents(userId);
    
    let message = `👋 <b>Добро пожаловать в HAIRbot!</b>\n\n`;
    
    if (hasConsents) {
      message += `✅ <b>Ваши согласия получены</b>\n\n`;
    } else {
      message += `📋 <b>Для начала работы необходимо дать согласие на обработку данных</b>\n\n`;
    }
    
    message += `Я помогу подобрать идеальную стрижку по форме вашего лица.\nВыберите действие:`;
    
    await telegram.sendMessage(chatId, message, Keyboards.main);
  }

  static async about(userId, chatId) {
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
      `• Данные не передаются третьим лицам без согласия`;
    
    await telegram.sendMessage(chatId, message, Keyboards.back);
  }

  static async tariffs(userId, chatId) {
    const message = 
      `💰 <b>Тарифы HAIRbot</b>\n\n` +
      `🎁 <b>БЕСПЛАТНЫЙ</b> (1 раз)\n` +
      `• Определение формы лица\n` +
      `• 2 рекомендации\n` +
      `• 2 изображения\n\n` +
      `💎 <b>BASIC - 299₽</b>\n` +
      `• Полный анализ\n` +
      `• 3 рекомендации\n` +
      `• 3 изображения\n\n` +
      `✨ <b>PRO - 599₽</b>\n` +
      `• Анализ с цветотипом\n` +
      `• 4 рекомендации\n` +
      `• PDF-отчет\n\n` +
      `👑 <b>PREMIUM - 999₽</b>\n` +
      `• Расширенный анализ\n` +
      `• 5 рекомендаций\n` +
      `• Приоритетная обработка`;
    
    await telegram.sendMessage(chatId, message, Keyboards.main);
  }

  static async handleTariff(userId, chatId, tariff) {
    // Проверяем согласия
    const hasConsents = await consentService.hasAllConsents(userId);
    
    if (!hasConsents) {
      const missing = await consentService.checkMissingConsents(userId);
      const missingText = missing.map((m, i) => `${i+1}. ${m === 'pd_processing' ? 'Обработка ПДн' : 'Передача третьим лицам'}`).join('\n');
      
      await telegram.sendMessage(chatId,
        `❌ <b>Необходимо дать согласие</b>\n\n` +
        `Отсутствуют согласия:\n${missingText}\n\n` +
        `Пройдите процедуру согласия перед выбором тарифа:`,
        Keyboards.requireConsent(tariff)
      );
      return;
    }
    
    if (tariff === 'free') {
      await BotHandlers.startFreeAnalysis(userId, chatId);
    } else {
      if (!PROVIDER_TOKEN) {
        await telegram.sendMessage(chatId,
          `❌ <b>Оплата временно недоступна</b>\n\n`,
          Keyboards.main
        );
        return;
      }
      
      await telegram.sendInvoice(userId, chatId, tariff);
    }
  }

  static async startFreeAnalysis(userId, chatId) {
    // Проверяем использовал ли уже free
    const result = await db.query("SELECT 1 FROM payments WHERE user_id = $1 AND tariff = 'free'", [userId]);
    
    if (result.rowCount > 0) {
      await telegram.sendMessage(chatId,
        `❌ <b>Бесплатный анализ уже использован</b>\n\n` +
        `Вы можете выбрать платный тариф:`,
        Keyboards.main
      );
      return;
    }
    
    userState.set(userId, { mode: 'free', awaitingPhoto: true });
    
    await telegram.sendMessage(chatId,
      `🎁 <b>Бесплатный анализ</b>\n\n` +
      `📸 <b>Отправьте фото лица:</b>\n` +
      `• Лицо анфас\n` +
      `• Хорошее освещение\n` +
      `• Чёткое изображение\n` +
      `• Без очков/головных уборов`,
      Keyboards.back
    );
  }

  static async startConsentFlow(userId, chatId, tariff = null) {
    userState.set(userId, {
      inConsentFlow: true,
      consentStep: 1,
      consentTariff: tariff,
      consentsGranted: {}
    });
    
    const consentText = consentService.getConsentText(1);
    await telegram.sendMessage(chatId, consentText.text, Keyboards.consent);
  }

  static async handleConsentResponse(userId, chatId, granted, callbackId = null) {
    const state = userState.get(userId);
    
    if (!state?.inConsentFlow) {
      if (callbackId) await telegram.answerCallbackQuery(callbackId, "Ошибка, начните заново");
      return;
    }
    
    const currentStep = state.consentStep;
    const consentType = currentStep === 1 ? 'pd_processing' : 'third_party_transfer';
    
    // Сохраняем ответ
    await consentService.saveConsent(userId, consentType, granted);
    
    if (callbackId) {
      await telegram.answerCallbackQuery(callbackId, granted ? "Согласие получено" : "Согласие отклонено");
    }
    
    if (!granted) {
      await telegram.sendMessage(chatId,
        `❌ <b>Согласие не получено</b>\n\n` +
        `Для использования сервиса необходимо дать все согласия.\n` +
        `Вы можете ознакомиться с политикой конфиденциальности.`,
        Keyboards.requireConsent()
      );
      userState.clear(userId);
      return;
    }
    
    // Обновляем состояние
    userState.set(userId, {
      ...state,
      consentsGranted: { ...state.consentsGranted, [consentType]: true },
      consentStep: currentStep + 1
    });
    
    // Проверяем, все ли согласия получены
    const newState = userState.get(userId);
    const allGranted = await consentService.hasAllConsents(userId);
    
    if (allGranted) {
      const tariff = newState.consentTariff;
      
      if (tariff === 'free') {
        await BotHandlers.startFreeAnalysis(userId, chatId);
      } else if (tariff && ['basic', 'pro', 'premium'].includes(tariff)) {
        await telegram.sendInvoice(userId, chatId, tariff);
      } else {
        await telegram.sendMessage(chatId,
          `✅ <b>Все согласия получены!</b>\n\n` +
          `Теперь вы можете выбрать тариф и начать анализ.`,
          Keyboards.main
        );
      }
      
      userState.clear(userId);
    } else {
      // Показываем следующий экран согласия
      const consentText = consentService.getConsentText(newState.consentStep);
      await telegram.sendMessage(chatId, consentText.text, Keyboards.consent);
    }
  }

  static async handleSuccessfulPayment(userId, chatId, paymentData) {
    try {
      const payload = paymentData.invoice_payload;
      const parts = payload.split('_');
      
      if (parts.length < 2) {
        console.error("❌ Неверный формат payload:", payload);
        return;
      }
      
      const tariff = parts[0];
      const userIdFromPayload = parts[1];
      
      if (parseInt(userIdFromPayload) !== userId) {
        console.error("❌ Несоответствие userId в payload");
        return;
      }
      
      // Сохраняем платеж
      await db.query(
        `INSERT INTO payments (user_id, tariff, status, amount)
         VALUES ($1, $2, 'completed', $3)`,
        [userId, tariff, paymentData.total_amount / 100]
      );
      
      // Начинаем анализ
      userState.set(userId, { mode: tariff, awaitingPhoto: true });
      
      await telegram.sendMessage(chatId,
        `✅ <b>Оплата подтверждена!</b>\n` +
        `Тариф "${tariff.toUpperCase()}" активирован.\n\n` +
        `📸 <b>Отправьте фото лица для анализа:</b>\n` +
        `• Лицо анфас\n` +
        `• Хорошее освещение\n` +
        `• Чёткое изображение`,
        Keyboards.back
      );
      
    } catch (error) {
      console.error("❌ Ошибка обработки платежа:", error.message);
      await telegram.sendMessage(chatId, "❌ Ошибка обработки платежа", Keyboards.main);
    }
  }

  static async handlePhoto(userId, chatId, photo) {
    // Проверяем согласия
    const hasConsents = await consentService.hasAllConsents(userId);
    
    if (!hasConsents) {
      await telegram.sendMessage(chatId,
        `❌ <b>Необходимо дать согласие на обработку данных</b>\n\n` +
        `Перед отправкой фото пройдите процедуру согласия:`,
        Keyboards.requireConsent()
      );
      return;
    }
    
    const state = userState.get(userId);
    const tariff = state?.mode || 'free';
    
    // Проверяем, ожидаем ли мы фото
    if (!state?.awaitingPhoto) {
      await telegram.sendMessage(chatId,
        `📸 <b>Сначала выберите тариф</b>\n\n` +
        `Для анализа выберите тариф в меню:`,
        Keyboards.main
      );
      return;
    }
    
    // Начинаем обработку фото
    await telegram.sendMessage(chatId,
      `⏳ <b>Начинаю анализ...</b>\n\n` +
      `Тариф: ${tariff.toUpperCase()}\n` +
      `Пожалуйста, подождите...`,
      Keyboards.back
    );
    
    // Здесь будет логика анализа через OpenAI
    // await analyzeAndSendResults(userId, chatId, photo, tariff);
  }
}

// ================== UPDATE HANDLER ==================
async function handleUpdate(update) {
  console.log(`📨 Update ${update.update_id}`);
  
  // Проверяем дубликаты
  if (userState.isDuplicateUpdate(update.update_id)) {
    console.log(`⏭️ Пропускаем дубликат`);
    return;
  }
  
  try {
    // Обработка сообщений
    if (update.message) {
      const userId = update.message.from.id;
      const chatId = update.message.chat.id;
      
      if (update.message.text === '/start') {
        await BotHandlers.start(userId, chatId);
        return;
      }
      
      if (update.message.photo?.length > 0) {
        const photo = update.message.photo[update.message.photo.length - 1];
        await BotHandlers.handlePhoto(userId, chatId, photo);
        return;
      }
      
      if (update.message.successful_payment) {
        await BotHandlers.handleSuccessfulPayment(userId, chatId, update.message.successful_payment);
        return;
      }
      
      if (update.message.text) {
        await telegram.sendMessage(chatId,
          "🤖 Используйте кнопки меню или отправьте /start",
          Keyboards.main
        );
      }
    }
    
    // Обработка callback-запросов
    if (update.callback_query) {
      const callback = update.callback_query;
      const userId = callback.from.id;
      const chatId = callback.message.chat.id;
      const data = callback.data;
      
      await telegram.answerCallbackQuery(callback.id);
      
      console.log(`🔼 Callback: ${data} от ${userId}`);
      
      switch(data) {
        case 'menu':
          await BotHandlers.start(userId, chatId);
          break;
        case 'about':
          await BotHandlers.about(userId, chatId);
          break;
        case 'tariffs':
          await BotHandlers.tariffs(userId, chatId);
          break;
        case 'free':
          await BotHandlers.handleTariff(userId, chatId, 'free');
          break;
        case 'basic':
        case 'pro':
        case 'premium':
          await BotHandlers.handleTariff(userId, chatId, data);
          break;
        case 'consent':
          await BotHandlers.startConsentFlow(userId, chatId);
          break;
        case 'consent_yes':
          await BotHandlers.handleConsentResponse(userId, chatId, true, callback.id);
          break;
        case 'consent_no':
          await BotHandlers.handleConsentResponse(userId, chatId, false, callback.id);
          break;
        default:
          // Обработка consent_<tariff>
          if (data.startsWith('consent_')) {
            const tariff = data.replace('consent_', '');
            if (['free', 'basic', 'pro', 'premium'].includes(tariff)) {
              await BotHandlers.startConsentFlow(userId, chatId, tariff);
            }
          }
          break;
      }
    }
    
  } catch (error) {
    console.error("❌ Ошибка обработки update:", error.message, error.stack);
  }
}

// ================== EXPRESS APP ==================
const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok",
    timestamp: new Date().toISOString(),
    db_connected: db.connected,
    has_provider_token: !!PROVIDER_TOKEN
  });
});

app.get("/", (req, res) => {
  res.send("🤖 HAIRbot is running");
});

app.post("/webhook", async (req, res) => {
  res.status(200).send('OK');
  
  if (req.body?.update_id) {
    // Асинхронная обработка без ожидания
    handleUpdate(req.body).catch(error => {
      console.error("❌ Необработанная ошибка в handleUpdate:", error);
    });
  }
});

// ================== STARTUP ==================
async function start() {
  await db.initialize();
  
  app.listen(PORT, () => {
    console.log(`
🎉 HAIRbot запущен!
📍 Порт: ${PORT}
🔗 Health: /health
📨 Webhook: /webhook
    `);
  });
}

start().catch(error => {
  console.error("❌ Ошибка запуска приложения:", error);
  process.exit(1);
});
