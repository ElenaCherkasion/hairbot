// src/index.js
import { Telegraf } from "telegraf";
import pg from "pg";

import startHandler from "./handlers/start.js";
import callbackHandler from "./handlers/callback.js";

export async function startBot() {
  console.log("🔧 startBot() called");

  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  if (!TELEGRAM_TOKEN) throw new Error("TELEGRAM_TOKEN is missing");

  const bot = new Telegraf(TELEGRAM_TOKEN);

  // DB (Postgres, Render)
  let pool = null;
  const DATABASE_URL = process.env.DATABASE_URL;

  if (DATABASE_URL) {
    const { Pool } = pg;
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    });

    try {
      await pool.query("SELECT 1");
      console.log("✅ PostgreSQL connected");
    } catch (e) {
      console.error("❌ PostgreSQL connection error:", e?.message || e);
    }
  } else {
    console.warn("⚠️ DATABASE_URL is missing. Удаление данных из БД работать не будет.");
  }

  // Handlers
  startHandler(bot);
  callbackHandler(bot, pool);

  bot.catch((err) => console.error("❌ BOT ERROR", err));

  await bot.launch();
  console.log("🚀 HairBot started");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
