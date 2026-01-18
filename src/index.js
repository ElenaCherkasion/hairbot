// src/index.js
import { Telegraf } from "telegraf";
import pg from "pg";

import startHandler from "./handlers/start.js";
import callbackHandler from "./handlers/callback.js";

// ===============================
// START BOT (exported)
// ===============================
export async function startBot() {
  console.log("🔧 startBot() called");

  // ===============================
  // ENV
  // ===============================
  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  if (!TELEGRAM_TOKEN) {
    throw new Error("TELEGRAM_TOKEN is missing");
  }

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.warn("⚠️ DATABASE_URL is missing. Удаление данных из БД работать не будет.");
  }

  // ===============================
  // BOT
  // ===============================
  const bot = new Telegraf(TELEGRAM_TOKEN);

  // ===============================
  // DATABASE
  // ===============================
  let pool = null;

  if (DATABASE_URL) {
    const { Pool } = pg;

    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : false,
    });

    try {
      await pool.query("SELECT 1");
      console.log("✅ PostgreSQL connected");
    } catch (err) {
      console.error("❌ PostgreSQL connection error:", err.message);
    }
  }

  // ===============================
  // HANDLERS
  // ===============================
  startHandler(bot);
  callbackHandler(bot, pool);

  // ===============================
  // ERROR HANDLER
  // ===============================
  bot.catch((err, ctx) => {
    console.error("❌ BOT ERROR", err);
  });

  // ===============================
  // LAUNCH
  // ===============================
  await bot.launch();
  console.log("🚀 HairBot started");

  // ===============================
  // GRACEFUL SHUTDOWN
  // ===============================
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
