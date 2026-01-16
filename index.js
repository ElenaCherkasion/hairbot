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
const SUPPORT_EMAIL = "cherkashina720@gmail.com"; // Обновленный email
const SUPPORT_TELEGRAM = process.env.SUPPORT_TELEGRAM || "https://t.me/your_support";

// ТЕСТОВЫЕ ЦЕНЫ (в копейках)
const TEST_PRICES = {
  basic: 500,    // 5 рублей = 500 копеек
  pro: 1000,     // 10 рублей = 1000 копеек
  premium: 1500  // 15 рублей = 1500 копеек
};

const ORIGINAL_PRICES = {
  basic: 29900,
  pro: 59900,
  premium: 99900
};

// Используем тестовые цены
const USE_TEST_PRICES = process.env.NODE_ENV !== 'production';

const getPrice = (tariff) => {
  if (USE_TEST_PRICES) {
    console.log(`💰 Используется ТЕСТОВАЯ цена для ${tariff}: ${TEST_PRICES[tariff] / 100}₽`);
    return TEST_PRICES[tariff];
  }
  return ORIGINAL_PRICES[tariff];
};

const getPriceDisplay = (tariff) => {
  const price = getPrice(tariff);
  return `${price / 100}₽`;
};

// Валидация переменных окружения
const validateEnv = () => {
  const required = ['TELEGRAM_TOKEN', 'OPENAI_API_KEY', 'DATABASE_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА: Отсутствуют переменные: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  console.log("✅ Все обязательные переменные окружения установлены");
  console.log(`💰 Режим цен: ${USE_TEST_PRICES ? 'ТЕСТОВЫЙ (5/10/15₽)' : 'ПРОДАКШЕН (299/599/999₽)'}`);
  console.log(`📧 Email поддержки: ${SUPPORT_EMAIL}`);
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

      await this.pool.query('SELECT 1');
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
      )`,
      
      `CREATE TABLE IF NOT EXISTS free_usage (
        user_id BIGINT PRIMARY KEY,
        used_at TIMESTAMP DEFAULT NOW()
      )`
    ];

    for (const tableSQL of tables) {
      await this.query(tableSQL);
    }

    await this.query(`
      CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_consents_granted ON user_consents(granted);
      CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
      CREATE INDEX IF NOT EXISTS idx_free_usage_user_id ON free_usage(user_id);
    `);

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
    const tariffNames = {
      'basic': { name: "BASIC", description: "Полный анализ + 3 рекомендации" },
      'pro': { name: "PRO", description: "Анализ с цветотипом + PDF" },
      'premium': { name: "PREMIUM", description: "Расширенный анализ + приоритет" }
    };
    
    const tariffInfo = tariffNames[tariff];
    if (!tariffInfo) return { ok: false };
    
    const price = getPrice(tariff);
    const priceDisplay = getPriceDisplay(tariff);
    
    const payload = `${tariff}_${userId}_${Date.now()}`;
    
    userState.set(userId, { 
      selectedTariff: tariff,
      invoicePayload: payload
    });
    
    return this.request('sendInvoice', {
      chat_id: chatId,
      title: `HAIRbot - Тариф ${tariffInfo.name} (${priceDisplay})`,
      description: tariffInfo.description,
      payload: payload,
      provider_token: PROVIDER_TOKEN,
      currency: "RUB",
      prices: [{ label: "Тариф", amount: price }]
    });
  }
}

const telegram = new TelegramService();

// ================== KEYBOARDS (Вариант 3 с категориями) ==================
const Keyboards = {
  main: {
    inline_keyboard: [
      // КАТЕГОРИЯ: ИНФОРМАЦИЯ
      [{ text: "📚 О сервисе HAIRbot", callback_data: "about" }],
      [{ text: "📖 Примеры разборов", callback_data: "examples" }],
      
      // КАТЕГОРИЯ: ВЫБОР ТАРИФА (с тестовыми ценами)
      [{ text: "🎁 БЕСПЛАТНЫЙ АНАЛИЗ", callback_data: "free" }],
      [{ text: `💎 BASIC - ${getPriceDisplay('basic')} (тестовая цена)`, callback_data: "basic" }],
      [{ text: `✨ PRO - ${getPriceDisplay('pro')} (тестовая цена)`, callback_data: "pro" }],
      [{ text: `👑 PREMIUM - ${getPriceDisplay('premium')} (тестовая цена)`, callback_data: "premium" }],
      
      // КАТЕГОРИЯ: ДОПОЛНИТЕЛЬНО
      [
        { text: "💰 Сравнить тарифы", callback_data: "tariffs" },
        { text: "🔒 Политика", url: PRIVACY_POLICY_URL }
      ],
      [
        { text: "📧 Написать на почту", url: `mailto:${SUPPORT_EMAIL}` },
        { text: "📞 Telegram поддержка", url: SUPPORT_TELEGRAM }
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
  },
  
  requireConsent: (tariff = null) => {
    const buttons = [
      [{ text: "📝 Пройти процедуру согласия", callback_data: tariff ? `consent_${tariff}` : "consent" }],
      [{ text: "🔒 Политика", url: PRIVACY_POLICY_URL }],
      [{ text: "📧 Поддержка", url: `mailto:${SUPPORT_EMAIL}` }],
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
    
    if (USE_TEST_PRICES) {
      message += `💰 <b>ТЕСТОВЫЙ РЕЖИМ</b>\n`;
      message += `Цены для тестирования:\n`;
      message += `• BASIC: ${getPriceDisplay('basic')}\n`;
      message += `• PRO: ${getPriceDisplay('pro')}\n`;
      message += `• PREMIUM: ${getPriceDisplay('premium')}\n\n`;
    }
    
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
      `• Данные не передаются третьим лицам без согласия\n\n` +
      `📧 <b>Поддержка:</b> ${SUPPORT_EMAIL}`;
    
    await telegram.sendMessage(chatId, message, Keyboards.back);
  }

  static async tariffs(userId, chatId) {
    const message = 
      `💰 <b>Тарифы HAIRbot</b>\n\n`;
    
    if (USE_TEST_PRICES) {
      message += `🎯 <b>ТЕСТОВЫЕ ЦЕНЫ (для проверки работы)</b>\n\n`;
    }
    
    message +=
      `🎁 <b>БЕСПЛАТНЫЙ</b> (1 раз)\n` +
      `• Определение формы лица\n` +
      `• 2 рекомендации\n` +
      `• 2 изображения\n\n` +
      
      `💎 <b>BASIC - ${getPriceDisplay('basic')}</b>\n` +
      `• Полный анализ лица\n` +
      `• 3 рекомендации стрижек\n` +
      `• 3 изображения\n` +
      `• Сохранение в истории\n\n` +
      
      `✨ <b>PRO - ${getPriceDisplay('pro')}</b>\n` +
      `• Всё из BASIC +\n` +
      `• Анализ цветотипа\n` +
      `• 4 рекомендации с цветами\n` +
      `• PDF-отчет\n\n` +
      
      `👑 <b>PREMIUM - ${getPriceDisplay('premium')}</b>\n` +
      `• Всё из PRO +\n` +
      `• Учёт текстуры волос\n` +
      `• 5 рекомендаций\n` +
      `• Приоритетная обработка\n\n`;
    
    if (USE_TEST_PRICES) {
      message += `⚠️ <i>Это тестовые цены для проверки работы бота.</i>\n`;
      message += `<i>После тестирования цены будут изменены на стандартные.</i>\n\n`;
    }
    
    message += `💳 <b>Оплата внутри Telegram:</b> картой, ЮMoney, СБП\n\n` +
              `📧 <b>Поддержка:</b> ${SUPPORT_EMAIL}`;
    
    await telegram.sendMessage(chatId, message, Keyboards.main);
  }

  static async examples(userId, chatId) {
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
    
    await telegram.sendMessage(chatId, message, Keyboards.back);
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
      
      // Показываем тестовую цену
      const priceDisplay = getPriceDisplay(tariff);
      await telegram.sendMessage(chatId,
        `💳 <b>Оплата тарифа ${tariff.toUpperCase()}</b>\n\n` +
        `Сумма к оплате: <b>${priceDisplay}</b>\n` +
        `${USE_TEST_PRICES ? '(тестовая цена)' : ''}\n\n` +
        `Нажмите кнопку ниже для оплаты:`,
        Keyboards.back
      );
      
      await telegram.sendInvoice(userId, chatId, tariff);
    }
  }

  static async startFreeAnalysis(userId, chatId) {
    // Проверяем использовал ли уже free
    const result = await db.query("SELECT 1 FROM free_usage WHERE user_id = $1", [userId]);
    
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
        `Для использования сервиса необходимо дать все согласия.\n\n` +
        `📧 <b>Вопросы?</b> Пишите: ${SUPPORT_EMAIL}`,
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
        const priceDisplay = getPriceDisplay(tariff);
        await telegram.sendMessage(chatId,
          `✅ <b>Все согласия получены!</b>\n\n` +
          `Теперь вы можете оплатить тариф <b>${tariff.toUpperCase()}</b>.\n` +
          `Сумма: <b>${priceDisplay}</b>\n` +
          `${USE_TEST_PRICES ? '(тестовая цена)' : ''}\n\n` +
          `Нажмите кнопку ниже для оплаты:`,
          Keyboards.back
        );
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
      const amount = paymentData.total_amount / 100; // Конвертируем в рубли
      await db.query(
        `INSERT INTO payments (user_id, tariff, status, amount, payment_id)
         VALUES ($1, $2, 'completed', $3, $4)`,
        [userId, tariff, amount, `telegram_${paymentData.telegram_payment_charge_id || Date.now()}`]
      );
      
      console.log(`✅ Платёж сохранён: user ${userId}, тариф ${tariff}, сумма ${amount}₽`);
      
      // Если это free тариф - отмечаем использование
      if (tariff === 'free') {
        await db.query(
          `INSERT INTO free_usage (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
          [userId]
        );
      }
      
      // Начинаем анализ
      userState.set(userId, { mode: tariff, awaitingPhoto: true });
      
      await telegram.sendMessage(chatId,
        `✅ <b>Оплата подтверждена!</b>\n\n` +
        `Тариф: <b>${tariff.toUpperCase()}</b>\n` +
        `Сумма: <b>${amount}₽</b>\n` +
        `Статус: <b>активирован</b>\n\n` +
        `📸 <b>Отправьте фото лица для анализа:</b>\n` +
        `• Лицо анфас\n` +
        `• Хорошее освещение\n` +
        `• Чёткое изображение`,
        Keyboards.back
      );
      
    } catch (error) {
      console.error("❌ Ошибка обработки платежа:", error.message);
      await telegram.sendMessage(chatId,
        `❌ <b>Ошибка обработки платежа</b>\n\n` +
        `Пожалуйста, обратитесь в поддержку:\n` +
        `📧 ${SUPPORT_EMAIL}`,
        Keyboards.main
      );
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
      `Тариф: <b>${tariff.toUpperCase()}</b>\n` +
      `Пожалуйста, подождите 30-60 секунд...`,
      Keyboards.back
    );
    
    // TODO: Здесь будет логика анализа через OpenAI
    // await analyzeAndSendResults(userId, chatId, photo, tariff);
    
    // Временно - заглушка
    setTimeout(async () => {
      await telegram.sendMessage(chatId,
        `✅ <b>Анализ завершён!</b>\n\n` +
        `К сожалению, модуль анализа временно недоступен.\n\n` +
        `📧 <b>Обратитесь в поддержку:</b>\n` +
        `${SUPPORT_EMAIL}\n\n` +
        `Мы вернём вам средства за платные тарифы.`,
        Keyboards.main
      );
      
      userState.clear(userId);
    }, 3000);
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
        case 'examples':
          await BotHandlers.examples(userId, chatId);
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
    has_provider_token: !!PROVIDER_TOKEN,
    test_prices: USE_TEST_PRICES,
    support_email: SUPPORT_EMAIL
  });
});

app.get("/", (req, res) => {
  res.send(`
    🤖 HAIRbot is running
    📧 Поддержка: ${SUPPORT_EMAIL}
    💰 Режим: ${USE_TEST_PR
