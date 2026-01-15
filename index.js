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
console.log("🔍 Environment Variables Check:");
console.log("TELEGRAM_TOKEN:", process.env.TELEGRAM_TOKEN ? "✅ Set" : "❌ MISSING");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✅ Set" : "❌ MISSING");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "✅ Set" : "❌ MISSING");

if (!process.env.TELEGRAM_TOKEN) {
  console.error("❌ FATAL: TELEGRAM_TOKEN is required");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ FATAL: OPENAI_API_KEY is required");
  process.exit(1);
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL_VISION = process.env.OPENAI_MODEL_VISION || "gpt-4o-mini";
const OPENAI_MODEL_TEXT = process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "dall-e-3";

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

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
    console.log("⚠️ DATABASE_URL not set, running without database");
    return false;
  }

  try {
    console.log("🔗 Connecting to PostgreSQL...");
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    // Test connection
    const client = await pool.connect();
    console.log("✅ PostgreSQL connected successfully");
    
    // Create tables if not exist
    console.log("🔧 Creating/verifying tables...");
    
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
      )`
    ];

    for (const sql of tablesSQL) {
      await client.query(sql);
    }

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_analysis_user_id ON user_analysis(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON user_assets(user_id);
    `);

    client.release();
    dbConnected = true;
    global.dbConnected = true;
    console.log("✅ Database tables ready");
    return true;
    
  } catch (error) {
    console.error("❌ Database initialization error:", error.message);
    console.error("Full error:", error);
    return false;
  }
}

// Initialize DB on startup
initializeDatabase().then(success => {
  if (success) {
    console.log("🎉 Database initialized successfully");
  } else {
    console.log("⚠️ Running in limited mode without database");
  }
});

// ================== DATABASE HELPERS ==================
async function dbQuery(query, params = []) {
  if (!dbConnected || !pool) {
    console.log("⚠️ Database not available for query:", query.substring(0, 50));
    return { rows: [], rowCount: 0 };
  }
  
  try {
    return await pool.query(query, params);
  } catch (error) {
    console.error("Database query error:", error.message);
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
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      console.error(`Telegram API error (${method}):`, result);
    }
    
    return result;
  } catch (error) {
    console.error(`Telegram API fetch error (${method}):`, error.message);
    return { ok: false };
  }
}

async function sendMessage(chatId, text, replyMarkup = null) {
  return tgApi('sendMessage', {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup
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
    [{ text: "🎁 Пробный Free", callback_data: "mode_free" }],
    [{ text: "💎 BASIC", callback_data: "mode_basic" }],
    [{ text: "✨ PRO", callback_data: "mode_pro" }],
    [{ text: "👑 PREMIUM", callback_data: "mode_premium" }]
  ]
};

const BACK_KEYBOARD = {
  inline_keyboard: [[{ text: "🏠 Главное меню", callback_data: "menu" }]]
};

// ================== FILE HANDLING ==================
async function getTelegramFileUrl(fileId) {
  const result = await tgApi('getFile', { file_id: fileId });
  if (!result.ok) throw new Error('Failed to get file');
  
  const filePath = result.result.file_path;
  return `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
}

async function downloadFile(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// ================== OPENAI FUNCTIONS ==================
async function analyzeFace(imageBuffer) {
  const base64Image = imageBuffer.toString('base64');
  
  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL_VISION,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `Analyze this face and return JSON with:
          {
            "face_shape": "oval|round|square|heart|diamond",
            "face_length": "short|medium|long",
            "jawline": "soft|medium|sharp",
            "cheekbones": "low|medium|high",
            "forehead": "narrow|medium|wide",
            "summary_ru": "Краткое описание на русском"
          }` },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
        ]
      }
    ],
    max_tokens: 500
  });

  const content = response.choices[0]?.message?.content || '{}';
  return JSON.parse(content);
}

async function generateHairRecommendations(faceAnalysis, count = 2) {
  const prompt = `Based on this face analysis: ${JSON.stringify(faceAnalysis)}
  Generate ${count} haircut recommendations in Russian.
  Return JSON: {
    "recommendations": [
      {
        "title": "Название стрижки",
        "description": "Описание почему подходит",
        "prompt": "Detailed prompt for image generation in English"
      }
    ]
  }`;

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL_TEXT,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 800
  });

  const content = response.choices[0]?.message?.content || '{}';
  return JSON.parse(content);
}

async function generateHaircutImage(prompt) {
  const response = await openai.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt: prompt + ", photorealistic, professional haircut, studio lighting, clean background",
    size: "1024x1024",
    quality: "standard",
    n: 1
  });

  const imageUrl = response.data[0].url;
  const imageResponse = await fetch(imageUrl);
  return Buffer.from(await imageResponse.arrayBuffer());
}

// ================== BOT HANDLERS ==================
async function handleStart(userId, chatId) {
  await sendMessage(chatId, 
    "🤖 Добро пожаловать в HAIRbot!\n\n" +
    "Я помогу подобрать идеальную стрижку по форме лица.\n\n" +
    "Выберите тариф:",
    MAIN_KEYBOARD
  );
}

async function handleModeSelection(userId, chatId, mode) {
  setUserState(userId, { mode, awaitingPhoto: true });
  
  if (mode === 'free') {
    const used = await isFreeUsed(userId);
    if (used) {
      await sendMessage(chatId, 
        "❌ Бесплатный тариф уже использован.\nВыберите другой тариф.",
        MAIN_KEYBOARD
      );
      return;
    }
  }
  
  await sendMessage(chatId,
    "📸 Отправьте фото лица анфас (без очков, головных уборов).\n" +
    "Убедитесь, что фото хорошего качества и хорошо видно лицо.",
    BACK_KEYBOARD
  );
}

async function handlePhoto(userId, chatId, photo) {
  const state = userState.get(userId);
  if (!state?.awaitingPhoto) {
    await sendMessage(chatId, "Сначала выберите тариф в меню.", MAIN_KEYBOARD);
    return;
  }

  await sendMessage(chatId, "🔍 Анализирую фото...", BACK_KEYBOARD);

  try {
    // Download and analyze photo
    const fileUrl = await getTelegramFileUrl(photo.file_id);
    const imageBuffer = await downloadFile(fileUrl);
    
    // Analyze face
    const analysis = await analyzeFace(imageBuffer);
    await saveUserAnalysis(userId, analysis, JSON.stringify(analysis));
    
    // Send analysis
    await sendMessage(chatId,
      `📊 Анализ лица:\n\n` +
      `• Форма лица: ${analysis.face_shape || 'не определена'}\n` +
      `• Длина лица: ${analysis.face_length || 'средняя'}\n` +
      `• Линия челюсти: ${analysis.jawline || 'средняя'}\n` +
      `• Скулы: ${analysis.cheekbones || 'средние'}\n` +
      `• Лоб: ${analysis.forehead || 'средний'}\n\n` +
      `${analysis.summary_ru || ''}`,
      BACK_KEYBOARD
    );

    // Generate recommendations
    const imageCount = state.mode === 'free' ? 2 : 4;
    await sendMessage(chatId, "💡 Генерирую рекомендации...", BACK_KEYBOARD);
    
    const recommendations = await generateHairRecommendations(analysis, imageCount);
    await saveUserRecos(userId, recommendations, JSON.stringify(recommendations));
    
    let recosText = "✂️ Рекомендации стрижек:\n\n";
    recommendations.recommendations?.forEach((rec, i) => {
      recosText += `${i + 1}. ${rec.title}\n${rec.description}\n\n`;
    });
    
    await sendMessage(chatId, recosText, {
      inline_keyboard: [[
        { text: `🎨 Сгенерировать ${imageCount} изображения`, callback_data: "generate_images" }
      ]]
    });

    if (state.mode === 'free') {
      await markFreeUsed(userId);
    }

    setUserState(userId, { 
      awaitingPhoto: false, 
      analysis, 
      recommendations,
      photoFileId: photo.file_id 
    });

  } catch (error) {
    console.error("Photo processing error:", error);
    await sendMessage(chatId,
      "❌ Произошла ошибка при обработке фото.\n" +
      "Попробуйте другое фото или позже.",
      BACK_KEYBOARD
    );
  }
}

async function handleGenerateImages(userId, chatId) {
  const state = userState.get(userId);
  if (!state?.recommendations) {
    await sendMessage(chatId, "Сначала нужно получить рекомендации.", BACK_KEYBOARD);
    return;
  }

  await sendMessage(chatId, "🎨 Генерирую изображения... Это займет 1-2 минуты.", BACK_KEYBOARD);

  try {
    const buffers = [];
    const recs = state.recommendations.recommendations || [];
    
    for (let i = 0; i < recs.length; i++) {
      await sendMessage(chatId, `Изображение ${i + 1}/${recs.length}...`);
      const buffer = await generateHaircutImage(recs[i].prompt);
      buffers.push(buffer);
    }

    // Create collage
    let collageBuffer;
    if (buffers.length === 2) {
      // 1x2 collage
      const resized = await Promise.all(buffers.map(b => sharp(b).resize(512, 512).toBuffer()));
      collageBuffer = await sharp({
        create: { width: 1024, height: 512, channels: 3, background: 'white' }
      }).composite([
        { input: resized[0], left: 0, top: 0 },
        { input: resized[1], left: 512, top: 0 }
      ]).jpeg().toBuffer();
    } else {
      // 2x2 collage
      const resized = await Promise.all(buffers.map(b => sharp(b).resize(512, 512).toBuffer()));
      collageBuffer = await sharp({
        create: { width: 1024, height: 1024, channels: 3, background: 'white' }
      }).composite([
        { input: resized[0], left: 0, top: 0 },
        { input: resized[1], left: 512, top: 0 },
        { input: resized[2], left: 0, top: 512 },
        { input: resized[3], left: 512, top: 512 }
      ]).jpeg().toBuffer();
    }

    // Send via FormData
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', `Ваши ${buffers.length} варианта стрижек`);
    form.append('document', collageBuffer, { filename: 'hairstyles.jpg' });

    await fetch(`${TELEGRAM_API}/sendDocument`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    await sendMessage(chatId, 
      "✅ Готово! Ваши варианты стрижек выше.\n\n" +
      "Хотите попробовать другой тариф?",
      MAIN_KEYBOARD
    );

    clearUserState(userId);

  } catch (error) {
    console.error("Image generation error:", error);
    await sendMessage(chatId,
      "❌ Ошибка при генерации изображений.\n" +
      "Возможно, закончились кредиты OpenAI.",
      BACK_KEYBOARD
    );
  }
}

// ================== UPDATE PROCESSOR ==================
async function handleUpdate(update) {
  console.log(`📨 Processing update: ${update.update_id}`);
  
  try {
    // Handle messages
    if (update.message) {
      const userId = update.message.from.id;
      const chatId = update.message.chat.id;
      
      if (update.message.text === '/start') {
        await handleStart(userId, chatId);
        return;
      }
      
      if (update.message.photo) {
        const photo = update.message.photo[update.message.photo.length - 1];
        await handlePhoto(userId, chatId, photo);
        return;
      }
      
      await sendMessage(chatId, "Отправьте /start чтобы начать.");
    }
    
    // Handle callback queries
    if (update.callback_query) {
      const callback = update.callback_query;
      const userId = callback.from.id;
      const chatId = callback.message.chat.id;
      const data = callback.data;
      
      await answerCallbackQuery(callback.id);
      
      if (data === 'menu') {
        await handleStart(userId, chatId);
      } 
      else if (data.startsWith('mode_')) {
        const mode = data.replace('mode_', '');
        await handleModeSelection(userId, chatId, mode);
      }
      else if (data === 'generate_images') {
        await handleGenerateImages(userId, chatId);
      }
    }
    
  } catch (error) {
    console.error("Error processing update:", error);
  }
}

// ================== WEBHOOK ENDPOINT ==================
app.post("/webhook", async (req, res) => {
  console.log(`🤖 Webhook received at ${new Date().toISOString()}`);
  
  // Always respond immediately to Telegram
  res.status(200).send('OK');
  
  // Process the update asynchronously
  if (req.body && req.body.update_id) {
    const updateId = req.body.update_id;
    
    // Basic duplicate prevention
    if (seenUpdateIds.has(updateId)) {
      console.log(`⏭️ Skipping duplicate update ${updateId}`);
      return;
    }
    
    seenUpdateIds.add(updateId);
    setTimeout(() => seenUpdateIds.delete(updateId), 60000); // Cleanup after 1min
    
    try {
      await handleUpdate(req.body);
      console.log(`✅ Processed update ${updateId}`);
    } catch (error) {
      console.error(`❌ Error processing update ${updateId}:`, error);
    }
  } else {
    console.log("⚠️ Empty or invalid webhook body");
  }
});

// ================== START SERVER ==================
app.listen(PORT, () => {
  console.log(`
🎉 HAIRbot запущен!
📍 Порт: ${PORT}
🌐 URL: https://hairstyle-bot.onrender.com
🏥 Health: https://hairstyle-bot.onrender.com/health
📨 Webhook: https://hairstyle-bot.onrender.com/webhook
🤖 Бот готов к работе!
  `);
});
