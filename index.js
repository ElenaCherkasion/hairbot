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

// Проверка критических переменных
console.log("🔍 Проверяю Environment Variables...");
console.log("TELEGRAM_TOKEN:", process.env.TELEGRAM_TOKEN ? "✅ Есть" : "❌ НЕТ");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✅ Есть" : "❌ НЕТ");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "✅ Есть" : "❌ НЕТ");
console.log("DATABASE_SSL:", process.env.DATABASE_SSL);

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

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ================== APP ==================
const app = express();
app.use(express.json({ limit: "2mb" }));

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    db_connected: dbConnected
  });
});

// ================== DB ==================
let pool = null;
let dbConnected = false;

// Функция инициализации базы данных
async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL не установлен в Environment Variables");
    console.log("⚠️ Бот будет работать без сохранения данных");
    return false;
  }

  try {
    console.log("🔗 Подключаюсь к базе данных...");
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    });

    // Тестируем подключение
    const client = await pool.connect();
    console.log("✅ Успешное подключение к PostgreSQL");
    
    // Создаем таблицы если их нет
    console.log("🔧 Создаю таблицы...");
    
    const tables = [
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
        kind TEXT CHECK (kind IN ('collage', 'pdf', 'photo')),
        telegram_file_id TEXT,
        meta JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      
      `CREATE TABLE IF NOT EXISTS user_entitlements (
        user_id BIGINT PRIMARY KEY,
        pdf_credits INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      )`
    ];

    for (const tableSql of tables) {
      await client.query(tableSql);
    }

    console.log("✅ Таблицы созданы/проверены");
    client.release();
    dbConnected = true;
    return true;
    
  } catch (error) {
    console.error("❌ Ошибка базы данных:", error.message);
    console.error("Подробности ошибки:", error);
    
    if (error.code === '28P01') {
      console.error("⚠️ Неверный пароль или имя пользователя");
    } else if (error.code === '3D000') {
      console.error("⚠️ База данных не существует");
    } else if (error.code === 'ECONNREFUSED') {
      console.error("⚠️ Не удается подключиться к серверу БД");
    }
    
    console.log("⚠️ Бот будет работать без сохранения данных");
    return false;
  }
}

// Инициализируем БД при старте
initializeDatabase().then(connected => {
  if (connected) {
    console.log("🎉 База данных готова к работе");
  } else {
    console.log("⚠️ Режим без базы данных - данные не будут сохраняться");
  }
});

// Заглушки для функций БД если нет подключения
async function isFreeUsed(userId) {
  if (!dbConnected || !pool) return false;
  try {
    const r = await pool.query("SELECT 1 FROM free_usage WHERE user_id=$1 LIMIT 1", [userId]);
    return r.rowCount > 0;
  } catch (error) {
    console.error("Ошибка БД в isFreeUsed:", error.message);
    return false;
  }
}

async function markFreeUsed(userId) {
  if (!dbConnected || !pool) return;
  try {
    await pool.query("INSERT INTO free_usage (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [userId]);
  } catch (error) {
    console.error("Ошибка БД в markFreeUsed:", error.message);
  }
}

async function saveUserAnalysis(userId, analysisJson, analysisText) {
  if (!dbConnected || !pool) return;
  try {
    await pool.query(
      `INSERT INTO user_analysis (user_id, analysis_json, analysis_text, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET analysis_json=EXCLUDED.analysis_json, analysis_text=EXCLUDED.analysis_text, updated_at=NOW()`,
      [userId, JSON.stringify(analysisJson), analysisText]
    );
  } catch (error) {
    console.error("Ошибка БД в saveUserAnalysis:", error.message);
  }
}

// ... (остальные функции БД аналогично - добавляйте try-catch)

// ================== STATE ==================
const userState = new Map();
const seenUpdateIds = new Set();
const seenCallbackIds = new Set();

function rememberSet(set, key, ttlMs = 60_000) {
  set.add(key);
  setTimeout(() => set.delete(key), ttlMs).unref?.();
}

// ================== HELPERS ==================
function getUserId(update) {
  return update.message?.from?.id || update.callback_query?.from?.id;
}

// ... (остальной код без изменений до конца файла)
// ВАЖНО: Сохраните остальной код из предыдущего index.js начиная с функции setState и до конца

// В самом конце файла добавьте:
app.listen(PORT, () => {
  console.log(`HAIRbot running on port ${PORT}`);
  console.log(`🌐 Health check: https://hairstyle-bot.onrender.com/health`);
  console.log(`🤖 Бот готов к работе!`);
});
