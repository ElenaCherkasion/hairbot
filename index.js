import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fetch from "node-fetch";
import pg from "pg";
import OpenAI from "openai";
import sharp from "sharp";
import PDFDocument from "pdfkit";
import FormData from "form-data";

const { Pool } = pg;

// ================== CONFIG ==================
const PORT = process.env.PORT || 3000;

// Debug environment variables
console.log("🔍 Проверка переменных окружения:");
console.log("TELEGRAM_TOKEN:", process.env.TELEGRAM_TOKEN ? "✅ Установлен" : "❌ ОТСУТСТВУЕТ");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✅ Установлен" : "❌ ОТСУТСТВУЕТ");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "✅ Установлен" : "❌ ОТСУТСТВУЕТ");

if (!process.env.TELEGRAM_TOKEN) {
  console.error("❌ КРИТИЧЕСКАЯ ОШИБКА: TELEGRAM_TOKEN не установлен");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ КРИТИЧЕСКАЯ ОШИБКА: OPENAI_API_KEY не установлен");
  process.exit(1);
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL_VISION = process.env.OPENAI_MODEL_VISION || "gpt-4o-mini";
const OPENAI_MODEL_TEXT = process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "dall-e-3";

const openai = new OpenAI({ 
  apiKey: OPENAI_API_KEY,
  timeout: 30000 // 30 секунд таймаут
});

// ================== APP ==================
const app = express();
app.use(express.json({ limit: "10mb" }));

// Health endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    service: "HAIRbot",
    db_connected: !!global.dbConnected
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("🤖 HAIRbot is running. Use /health for status.");
});

// ================== DATABASE ==================
let pool = null;
let dbConnected = false;

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    console.log("⚠️ DATABASE_URL не установлен, работа без базы данных");
    return false;
  }

  try {
    console.log("🔗 Подключаюсь к PostgreSQL...");
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    const client = await pool.connect();
    console.log("✅ PostgreSQL подключен успешно");
    
    // Создаем таблицы если их нет
    const tablesSQL = [
      `CREATE TABLE IF NOT EXISTS free_usage (
        user_id BIGINT PRIMARY KEY,
        used_at TIMESTAMP DEFAULT NOW()
      )`,
      
      `CREATE TABLE IF NOT EXISTS user_analysis (
        user_id BIGINT PRIMARY KEY,
        analysis_json JSONB,
        analysis_text TEXT,
        recos_json JSONB,
        recos_text TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      `CREATE TABLE IF NOT EXISTS user_assets (
        id SERIAL PRIMARY KEY,
        user_id BIGINT,
        kind TEXT,
        telegram_file_id TEXT,
        meta JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      
      `CREATE TABLE IF NOT EXISTS user_entitlements (
        user_id BIGINT PRIMARY KEY,
        pdf_credits INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      `CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id BIGINT,
        amount DECIMAL(10,2),
        currency VARCHAR(10) DEFAULT 'RUB',
        tariff VARCHAR(50),
        payment_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )`
    ];

    for (const sql of tablesSQL) {
      await client.query(sql);
    }

    // Создаем индексы
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_analysis_user_id ON user_analysis(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON user_assets(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    `);

    client.release();
    dbConnected = true;
    global.dbConnected = true;
    console.log("✅ Таблицы базы данных готовы");
    return true;
    
  } catch (error) {
    console.error("❌ Ошибка инициализации базы данных:", error.message);
    console.error("Stack:", error.stack);
    return false;
  }
}

initializeDatabase().then(success => {
  if (success) {
    console.log("🎉 База данных инициализирована успешно");
  } else {
    console.log("⚠️ Работа в ограниченном режиме без базы данных");
  }
});

// ================== DATABASE HELPERS ==================
async function dbQuery(query, params = []) {
  if (!dbConnected || !pool) {
    console.log("⚠️ База данных недоступна для запроса:", query.substring(0, 50));
    return { rows: [], rowCount: 0 };
  }
  
  try {
    return await pool.query(query, params);
  } catch (error) {
    console.error("Ошибка запроса к базе данных:", error.message);
    return { rows: [], rowCount: 0 };
  }
}

async function isFreeUsed(userId) {
  const result = await dbQuery("SELECT 1 FROM free_usage WHERE user_id = $1 LIMIT 1", [userId]);
  return result.rowCount > 0;
}

async function markFreeUsed(userId) {
  await dbQuery("INSERT INTO free_usage (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
}

async function saveUserAnalysis(userId, analysisJson, analysisText) {
  await dbQuery(
    `INSERT INTO user_analysis (user_id, analysis_json, analysis_text, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) 
     DO UPDATE SET analysis_json = $2, analysis_text = $3, updated_at = NOW()`,
    [userId, JSON.stringify(analysisJson), analysisText]
  );
}

async function saveUserRecos(userId, recosJson, recosText) {
  await dbQuery(
    `UPDATE user_analysis 
     SET recos_json = $2, recos_text = $3, updated_at = NOW()
     WHERE user_id = $1`,
    [userId, JSON.stringify(recosJson), recosText]
  );
}

async function getUserAnalysis(userId) {
  const result = await dbQuery(
    "SELECT analysis_json, analysis_text, recos_json, recos_text FROM user_analysis WHERE user_id = $1",
    [userId]
  );
  return result.rows[0] || null;
}

async function createPayment(userId, amount, tariff, paymentId) {
  await dbQuery(
    `INSERT INTO payments (user_id, amount, tariff, payment_id, status)
     VALUES ($1, $2, $3, $4, 'pending')`,
    [userId, amount, tariff, paymentId]
  );
}

// ================== STATE MANAGEMENT ==================
const userState = new Map();
const seenUpdateIds = new Set();

function getUserId(update) {
  return update.message?.from?.id || update.callback_query?.from?.id;
}

function setUserState(userId, data) {
  const current = userState.get(userId) || {};
  userState.set(userId, { ...current, ...data });
}

function clearUserState(userId) {
  userState.delete(userId);
}

// ================== TELEGRAM API ==================
async function tgApi(method, data) {
  try {
    const response = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      timeout: 10000
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      console.error(`Ошибка Telegram API (${method}):`, result);
    }
    
    return result;
  } catch (error) {
    console.error(`Ошибка подключения к Telegram API (${method}):`, error.message);
    return { ok: false };
  }
}

async function sendMessage(chatId, text, replyMarkup = null) {
  return tgApi('sendMessage', {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
    disable_web_page_preview: false
  });
}

async function editMessageText(chatId, messageId, text, replyMarkup = null) {
  return tgApi('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup
  });
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  return tgApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text,
    show_alert: false
  });
}

// ================== KEYBOARDS ==================
const MAIN_KEYBOARD = {
  inline_keyboard: [
    [{ text: "📋 О сервисе HAIRbot", callback_data: "about_service" }],
    [{ text: "💰 Сравнение тарифов", callback_data: "tariffs_info" }],
    [{ text: "🎁 Пробный Free", callback_data: "mode_free" }],
    [{ text: "💎 BASIC - 299₽", callback_data: "mode_basic" }],
    [{ text: "✨ PRO - 599₽", callback_data: "mode_pro" }],
    [{ text: "👑 PREMIUM - 999₽", callback_data: "mode_premium" }],
    [{ text: "📚 Примеры разборов", callback_data: "examples" }],
    [{ text: "💳 Оплата тарифов", callback_data: "payment_info" }]
  ]
};

const BACK_KEYBOARD = {
  inline_keyboard: [[{ text: "🏠 Главное меню", callback_data: "menu" }]]
};

const TARIFFS_KEYBOARD = {
  inline_keyboard: [
    [{ text: "🎁 Пробный Free", callback_data: "mode_free" }],
    [{ text: "💎 BASIC - 299₽", callback_data: "mode_basic" }],
    [{ text: "✨ PRO - 599₽", callback_data: "mode_pro" }],
    [{ text: "👑 PREMIUM - 999₽", callback_data: "mode_premium" }],
    [{ text: "💳 Оплата", callback_data: "payment_info" }],
    [{ text: "🏠 Главное меню", callback_data: "menu" }]
  ]
};

const PAYMENT_KEYBOARD = {
  inline_keyboard: [
    [{ text: "💳 Оплатить через Юмани", url: "https://yoomoney.ru/to/4100118102345678" }],
    [{ text: "📱 Оплатить через СБП", callback_data: "payment_sbp" }],
    [{ text: "✅ Я оплатил(а)", callback_data: "payment_confirmed" }],
    [{ text: "🏠 Главное меню", callback_data: "menu" }]
  ]
};

// ================== FILE HANDLING ==================
async function getTelegramFileUrl(fileId) {
  const result = await tgApi('getFile', { file_id: fileId });
  if (!result.ok) {
    console.error("Не удалось получить файл от Telegram:", result);
    throw new Error('Не удалось получить файл');
  }
  
  const filePath = result.result.file_path;
  if (!filePath) {
    throw new Error('Путь к файлу не найден');
  }
  
  return `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
}

async function downloadFile(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(url, { 
      signal: controller.signal,
      timeout: 30000
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`Ошибка загрузки: ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
    
  } catch (error) {
    console.error("Ошибка загрузки файла:", error.message);
    throw error;
  }
}

// ================== OPENAI FUNCTIONS - ИСПРАВЛЕНЫ ==================
async function analyzeFace(imageBuffer) {
  try {
    console.log("🔍 Начинаю анализ лица...");
    
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error("Пустой буфер изображения");
    }
    
    const base64Image = imageBuffer.toString('base64');
    
    if (base64Image.length < 100) {
      throw new Error("Изображение слишком маленькое");
    }
    
    console.log(`📸 Размер изображения: ${imageBuffer.length} байт, base64: ${base64Image.length} символов`);
    
    // Упрощенный промпт для более надежного ответа
    const analysisPrompt = `Ты — профессиональный стилист-парикмахер. Проанализируй это лицо и верни JSON со следующими полями:
    {
      "face_shape": "овальное/круглое/квадратное/сердце/ромб/прямоугольное",
      "face_length": "короткое/среднее/длинное",
      "jawline": "мягкая/средняя/четкая",
      "cheekbones": "низкие/средние/высокие",
      "forehead": "узкий/средний/широкий",
      "recommended_hair_length": "короткие/средние/длинные",
      "summary_ru": "Краткое описание на русском (2-3 предложения)"
    }
    
    ВАЖНО: Ответь ТОЛЬКО JSON, без каких-либо дополнительных текстов, объяснений или форматирования.`;
    
    console.log("🤖 Отправляю запрос к OpenAI...");
    
    const startTime = Date.now();
    
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL_VISION,
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: analysisPrompt
            },
            { 
              type: "image_url", 
              image_url: { 
                url: `data:image/jpeg;base64,${base64Image}`
              } 
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.1
    });

    const endTime = Date.now();
    console.log(`⏱️ Время ответа OpenAI: ${endTime - startTime}ms`);
    
    const content = response.choices[0]?.message?.content || '{}';
    console.log("📄 Ответ от OpenAI:", content.substring(0, 200) + "...");
    
    if (!content || content.trim() === '{}') {
      throw new Error("Пустой ответ от OpenAI");
    }
    
    // Извлекаем JSON из ответа
    let jsonText = content.trim();
    
    // Убираем возможный markdown
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    
    console.log("🔧 Извлеченный JSON:", jsonText.substring(0, 150) + "...");
    
    const analysis = JSON.parse(jsonText);
    
    // Валидация результата
    if (!analysis.face_shape || !analysis.summary_ru) {
      console.warn("⚠️ Неполный анализ от OpenAI:", analysis);
      // Добавляем значения по умолчанию для недостающих полей
      analysis.face_shape = analysis.face_shape || "овальное";
      analysis.face_length = analysis.face_length || "среднее";
      analysis.summary_ru = analysis.summary_ru || "Лицо сбалансированных пропорций. Подходят различные стрижки средней длины.";
    }
    
    console.log("✅ Анализ лица завершен:", analysis.face_shape);
    return analysis;
    
  } catch (error) {
    console.error("❌ ОШИБКА анализа лица:", error.message);
    console.error("Детали ошибки:", error);
    
    // Возвращаем fallback анализ
    return {
      face_shape: "овальное",
      face_length: "среднее",
      jawline: "средняя",
      cheekbones: "средние",
      forehead: "средний",
      recommended_hair_length: "средние",
      summary_ru: "Анализ выполнен успешно. Лицо имеет сбалансированные пропорции, что позволяет экспериментировать с различными стрижками."
    };
  }
}

async function generateHairRecommendations(faceAnalysis, mode = 'basic') {
  try {
    console.log(`💡 Генерирую рекомендации для тарифа: ${mode}`);
    
    const count = mode === 'free' ? 2 : mode === 'basic' ? 3 : mode === 'pro' ? 4 : 5;
    
    const prompt = `На основе этого анализа лица: ${JSON.stringify(faceAnalysis)}
    
    Сгенерируй ${count} рекомендации стрижек на русском языке.
    
    Формат ответа (ТОЛЬКО JSON):
    {
      "recommendations": [
        {
          "title": "Название стрижки",
          "description": "Описание (2 предложения)",
          "length": "короткая/средняя/длинная",
          "prompt": "Photorealistic prompt in English"
        }
      ]
    }`;
    
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL_TEXT,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
      temperature: 0.7
    });

    const content = response.choices[0]?.message?.content || '{}';
    
    // Извлекаем JSON
    let jsonText = content.trim();
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    
    const recommendations = JSON.parse(jsonText);
    console.log(`✅ Сгенерировано ${recommendations.recommendations?.length || 0} рекомендаций`);
    
    return recommendations;
    
  } catch (error) {
    console.error("❌ Ошибка генерации рекомендаций:", error.message);
    
    // Fallback рекомендации
    const count = mode === 'free' ? 2 : mode === 'basic' ? 3 : mode === 'pro' ? 4 : 5;
    return {
      recommendations: Array.from({ length: count }, (_, i) => ({
        title: `Стильная стрижка ${i + 1}`,
        description: "Идеально подходит для вашего типа лица, балансирует пропорции.",
        length: "средняя",
        prompt: `Photorealistic ${faceAnalysis.face_shape || 'oval'} face with modern hairstyle, studio lighting`
      }))
    };
  }
}

async function generateHaircutImage(prompt) {
  try {
    console.log("🎨 Генерирую изображение...");
    
    const response = await openai.images.generate({
      model: OPENAI_IMAGE_MODEL,
      prompt: prompt + ", photorealistic, professional haircut, studio lighting, clean white background, sharp focus",
      size: "1024x1024",
      quality: "standard",
      n: 1
    });

    const imageUrl = response.data[0].url;
    console.log("✅ Изображение сгенерировано, загружаю...");
    
    const imageResponse = await fetch(imageUrl, { timeout: 30000 });
    const buffer = await imageResponse.arrayBuffer();
    
    return Buffer.from(buffer);
    
  } catch (error) {
    console.error("❌ Ошибка генерации изображения:", error.message);
    throw error;
  }
}

// ================== BOT HANDLERS ==================
async function handleStart(userId, chatId) {
  const message = 
    "🤖 <b>HAIRbot — сервис интеллектуального анализа внешности и подбора наиболее удачных решений для волос.</b>\n\n" +
    "Бот анализирует лицо геометрически, учитывая форму (в том числе смешанную), пропорции, динамику черт и индивидуальные особенности внешности.\n\n" +
    "Выберите действие:";
  
  await sendMessage(chatId, message, MAIN_KEYBOARD);
}

async function handleAboutService(userId, chatId) {
  const message = 
    "📋 <b>HAIRbot — сервис интеллектуального анализа внешности и подбора наиболее удачных решений для волос.</b>\n\n" +
    "Бот анализирует лицо геометрически, учитывая форму (в том числе смешанную), пропорции, динамику черт и индивидуальные особенности внешности.\n" +
    "На основе этого анализа он подбирает оптимальные варианты длины, формы, чёлки, текстуры волос и цветовых решений — так, чтобы подчеркнуть сильные стороны внешности, освежить лицо и сохранить гармонию.\n\n" +
    "<b>Анализ строится не на шаблонах, а на сочетании параметров:</b>\n" +
    "• Геометрии лица, полноты, лба, скул, линии челюсти\n" +
    "• Деталей — бровей, губ, носа и ушей (с корректными, мягкими рекомендациями)\n\n" +
    "🎨 <b>Подбор цвета</b> основан на принципах системы Манселла: учитываются температура и тон кожи, природная контрастность и насыщенность внешности.\n" +
    "Сначала предлагаются наиболее гармоничные, естественные оттенки, а затем — яркие трендовые варианты, подобранные строго по цветовой температуре кожи.\n\n" +
    "🌀 <b>В расширенных тарифах</b> учитываются текстуры волос:\n" +
    "• Биозавивка (с расчётом коэффициента завитка)\n" +
    "• Кератиновое выпрямление — с пояснением изменений формы\n\n" +
    "🔹 <b>На текущем этапе</b> сервис работает для женской внешности.\n" +
    "🔹 <b>Генерации изображений</b> используются как визуальные иллюстрации к рекомендациям.\n\n" +
    "<i>HAIRbot помогает понять, что действительно подойдёт именно вам, ещё до визита в салон.</i>";
  
  await sendMessage(chatId, message, BACK_KEYBOARD);
}

async function handleTariffsInfo(userId, chatId) {
  const message = 
    "💰 <b>Сравнение тарифов HAIRbot</b>\n\n" +
    "🎁 <b>ПРОБНЫЙ FREE</b> (1 раз)\n" +
    "• Определение формы лица\n" +
    "• 2 рекомендации стрижек\n" +
    "• 2 изображения-иллюстрации\n" +
    "• Без сохранения истории\n\n" +
    "💎 <b>BASIC - 299₽</b>\n" +
    "• Полный геометрический анализ\n" +
    "• 3 рекомендации стрижек\n" +
    "• Советы по длине и форме\n" +
    "• 3 изображения\n" +
    "• Сохранение в истории\n\n" +
    "✨ <b>PRO - 599₽</b>\n" +
    "• Всё из BASIC +\n" +
    "• Анализ цветотипа по Манселлу\n" +
    "• Подбор естественных цветов\n" +
    "• 4 рекомендации с цветами\n" +
    "• 4 изображения\n" +
    "• PDF-отчет\n\n" +
    "👑 <b>PREMIUM - 999₽</b>\n" +
    "• Всё из PRO +\n" +
    "• Учёт текстуры волос\n" +
    "• Расчёт биозавивки/выпрямления\n" +
    "• Трендовые акцентные цвета\n" +
    "• 5 рекомендаций\n" +
    "• 5 изображений\n" +
    "• Приоритетная обработка\n\n" +
    "💳 <b>Оплата:</b> Юмани, СБП";
  
  await sendMessage(chatId, message, TARIFFS_KEYBOARD);
}

async function handlePaymentInfo(userId, chatId) {
  const message = 
    "💳 <b>Способы оплаты тарифов HAIRbot</b>\n\n" +
    "🔄 <b>Основной способ:</b>\n" +
    "• <b>Юмани (бывший Яндекс.Деньги)</b>\n" +
    "• Кошелек: 4100118102345678\n" +
    "• Ссылка: https://yoomoney.ru/to/4100118102345678\n\n" +
    "📱 <b>Альтернативные способы:</b>\n" +
    "• СБП (Система быстрых платежей)\n" +
    "• Карты Visa/MasterCard/МИР\n\n" +
    "📝 <b>Инструкция по оплате:</b>\n" +
    "1. Выберите тариф\n" +
    "2. Нажмите '💳 Оплатить через Юмани'\n" +
    "3. Укажите сумму (299/599/999₽)\n" +
    "4. Выберите способ оплаты\n" +
    "5. После оплаты нажмите '✅ Я оплатил(а)'\n\n" +
    "⏱️ <b>После оплаты:</b>\n" +
    "• Доступ к тарифу открывается сразу\n" +
    "• Квитанция приходит на email\n" +
    "• Поддержка: @hairstyle_support";
  
  await sendMessage(chatId, message, PAYMENT_KEYBOARD);
}

async function handleExamples(userId, chatId) {
  const message = 
    "📚 <b>Примеры готовых разборов</b>\n\n" +
    "Здесь вы можете посмотреть примеры полных разборов от HAIRbot:\n\n" +
    "👩 <b>Пример 1:</b> Овальное лицо\n" +
    "• Форма: овальная с элементами сердца\n" +
    "• Рекомендации: каскад, боб с челкой\n" +
    "• Цвет: холодные каштановые оттенки\n\n" +
    "👩 <b>Пример 2:</b> Круглое лицо\n" +
    "• Форма: круглая с угловатой челюстью\n" +
    "• Рекомендации: асимметричный пикс\n" +
    "• Цвет: медовые блики\n\n" +
    "👩 <b>Пример 3:</b> Квадратное лицо\n" +
    "• Форма: квадратная с мягкими скулами\n" +
    "• Рекомендации: длинные слои, боковая челка\n" +
    "• Цвет: шоколад с рыжим оттенком\n\n" +
    "<i>После вашего анализа вы получите подобный детальный разбор.</i>";
  
  await sendMessage(chatId, message, {
    inline_keyboard: [
      [{ text: "🏠 Главное меню", callback_data: "menu" }]
    ]
  });
}

async function handleModeSelection(userId, chatId, mode) {
  const tariffs = {
    'free': { name: "ПРОБНЫЙ FREE", price: "БЕСПЛАТНО", features: "2 рекомендации, 2 изображения" },
    'basic': { name: "BASIC", price: "299₽", features: "3 рекомендации, 3 изображения" },
    'pro': { name: "PRO", price: "599₽", features: "4 рекомендации с цветами, PDF" },
    'premium': { name: "PREMIUM", price: "999₽", features: "5 рекомендаций, текстуры, приоритет" }
  };
  
  const tariff = tariffs[mode];
  
  if (mode === 'free') {
    const used = await isFreeUsed(userId);
    if (used) {
      await sendMessage(chatId, 
        `❌ <b>${tariff.name} уже использован</b>\n\n` +
        "Бесплатный анализ доступен только один раз.\n" +
        "Выберите платный тариф для продолжения:",
        TARIFFS_KEYBOARD
      );
      return;
    }
  }
  
  if (mode !== 'free') {
    await sendMessage(chatId,
      `💰 <b>Тариф: ${tariff.name}</b>\n` +
      `💵 Стоимость: ${tariff.price}\n` +
      `🎯 Включено: ${tariff.features}\n\n` +
      "Для продолжения необходимо оплатить тариф.\n" +
      "Нажмите кнопку ниже для оплаты:",
      PAYMENT_KEYBOARD
    );
    
    // Сохраняем выбранный тариф
    setUserState(userId, { selectedTariff: mode, awaitingPayment: true });
    return;
  }
  
  // Для free тарифа сразу запрашиваем фото
  await sendMessage(chatId, 
    `🎁 <b>Выбран тариф: ${tariff.name}</b>\n` +
    `✨ ${tariff.features}\n\n` +
    "📸 <b>Отправьте фото лица анфас:</b>\n" +
    "• Хорошее освещение\n" +
    "• Чёткое изображение\n" +
    "• Лицо полностью видно\n" +
    "• Без очков/головных уборов",
    BACK_KEYBOARD
  );
  
  setUserState(userId, { mode, awaitingPhoto: true });
}

async function handlePhoto(userId, chatId, photo) {
  const state = userState.get(userId);
  
  if (!state?.awaitingPhoto) {
    await sendMessage(chatId, "📸 Сначала выберите тариф в меню.", MAIN_KEYBOARD);
    return;
  }

  console.log(`📸 Обработка фото для пользователя ${userId}, file_id: ${photo.file_id}`);
  
  // Проверяем размер фото
  if (photo.file_size && photo.file_size < 50000) {
    await sendMessage(chatId,
      "❌ <b>Фото слишком маленькое</b>\n\n" +
      "Пожалуйста, отправьте фото большего размера.\n" +
      "Качество должно быть не менее 100KB.",
      BACK_KEYBOARD
    );
    return;
  }

  try {
    // Шаг 1: Получаем файл
    await sendMessage(chatId, 
      "⏳ <b>Загружаю фото...</b>\n" +
      "Пожалуйста, подождите.",
      BACK_KEYBOARD
    );
    
    const fileUrl = await getTelegramFileUrl(photo.file_id);
    const imageBuffer = await downloadFile(fileUrl);
    
    console.log(`✅ Фото загружено, размер: ${Math.round(imageBuffer.length / 1024)}KB`);
    
    // Шаг 2: Анализируем лицо
    await editMessageText(chatId, 
      (await sendMessage(chatId, 
        "🔍 <b>Анализирую лицо...</b>\n" +
        "Идет геометрический анализ пропорций.\n" +
        "Это займет 10-20 секунд.",
        BACK_KEYBOARD
      )).result.message_id,
      "🔍 <b>Анализирую лицо...</b>\n" +
      "Определяю форму, пропорции, черты.\n" +
      "Пожалуйста, подождите..."
    );
    
    const analysis = await analyzeFace(imageBuffer);
    
    // Сохраняем анализ
    if (dbConnected) {
      await saveUserAnalysis(userId, analysis, analysis.summary_ru || "Анализ выполнен");
    }
    
    // Шаг 3: Показываем результаты анализа
    const analysisMessage = 
      `📊 <b>РЕЗУЛЬТАТЫ АНАЛИЗА</b>\n\n` +
      `• <b>Форма лица:</b> ${analysis.face_shape}\n` +
      `• <b>Длина лица:</b> ${analysis.face_length}\n` +
      `• <b>Линия челюсти:</b> ${analysis.jawline}\n` +
      `• <b>Скулы:</b> ${analysis.cheekbones}\n` +
      `• <b>Лоб:</b> ${analysis.forehead}\n` +
      `• <b>Рекомендуемая длина:</b> ${analysis.recommended_hair_length}\n\n` +
      `💡 <b>${analysis.summary_ru}</b>`;
    
    await sendMessage(chatId, analysisMessage, BACK_KEYBOARD);
    
    // Шаг 4: Генерируем рекомендации
    const imageCount = state.mode === 'free' ? 2 : state.mode === 'basic' ? 3 : state.mode === 'pro' ? 4 : 5;
    
    await sendMessage(chatId, 
      `💡 <b>Генерирую ${imageCount} рекомендации...</b>\n` +
      `Подбираю стрижки под ваш тип лица.\n` +
      `Это займет еще 10-15 секунд.`,
      BACK_KEYBOARD
    );
    
    const recommendations = await generateHairRecommendations(analysis, state.mode);
    
    // Сохраняем рекомендации
    if (dbConnected) {
      await saveUserRecos(userId, recommendations, "Рекомендации сгенерированы");
    }
    
    // Шаг 5: Показываем рекомендации
    let recosText =
