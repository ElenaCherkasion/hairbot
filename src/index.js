// src/index.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { Telegraf } from "telegraf";
import pg from "pg";

import startHandler from "./handlers/start.js";
import callbackHandler from "./handlers/callback.js";

const { Pool } = pg;

function getToken() {
  return (
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.TELEGRAM_TOKEN ||
    process.env.BOT_TOKEN ||
    ""
  ).trim();
}

export async function startBot() {
  console.log("🚀 =================================");
  console.log("🚀 ЗАПУСК HAIRBOT");
  console.log("🚀 =================================");
  console.log("📊 Информация о системе:");
  console.log("   Время запуска:", new Date().toLocaleString());
  console.log("   Node.js:", process.version);
  console.log("   Платформа:", process.platform, process.arch);
  console.log("   NODE_ENV:", process.env.NODE_ENV);
  console.log("   PORT:", process.env.PORT);
  console.log("   Рабочая директория:", process.cwd());
  console.log("========================================");

  // --- healthcheck for Render ---
  const app = express();
  app.get("/", (_req, res) => res.status(200).send("ok"));
  app.get("/health", (_req, res) => res.status(200).send("ok"));
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`✅ Healthcheck server on :${port}`));

  // --- token ---
  const token = getToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing");

  // --- DB pool (optional) ---
  let pool = null;
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    });
    console.log("✅ DB pool created");
  } else {
    console.log("ℹ️ DATABASE_URL not set — DB disabled");
  }

  // --- bot ---
  const bot = new Telegraf(token);

  startHandler(bot);
  callbackHandler(bot, pool);

  await bot.launch();
  console.log("✅ Bot launched");

  // graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
