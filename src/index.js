// src/index.js
import { Telegraf } from "telegraf";
import pg from "pg";
import express from "express";

import startHandler from "./handlers/start.js";
import callbackHandler from "./handlers/callback.js";

export async function startBot() {
  console.log("🔧 startBot() called");

  // --- TOKEN ---
  const TELEGRAM_TOKEN =
    process.env.TELEGRAM_TOKEN ||
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.TG_TOKEN;

  if (!TELEGRAM_TOKEN) {
    throw new Error("TELEGRAM_TOKEN / TELEGRAM_BOT_TOKEN is missing");
  }

  // --- BOT ---
  const bot = new Telegraf(TELEGRAM_TOKEN);

  // --- DB (optional) ---
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

  // --- HANDLERS ---
  startHandler(bot);
  callbackHandler(bot, pool);

  bot.catch((err) => console.error("❌ BOT ERROR", err));

  // --- HTTP server for Render health / keep-alive ---
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.get("/", (req, res) => res.status(200).send("OK"));
  app.get("/health", (req, res) =>
    res.status(200).json({
      ok: true,
      service: "hairbot",
      time: new Date().toISOString(),
    })
  );

  app.listen(PORT, () => {
    console.log(`🌐 HTTP server listening on :${PORT}`);
  });

  // --- LAUNCH BOT (long polling) ---
  await bot.launch();
  console.log("🚀 HairBot started (polling)");

  // --- GRACEFUL SHUTDOWN ---
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
