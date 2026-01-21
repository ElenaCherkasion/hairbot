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

function createPoolIfConfigured() {
  if (!process.env.DATABASE_URL) {
    console.log("ℹ️ DATABASE_URL not set — DB disabled");
    return null;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  });

  console.log("✅ DB pool created");
  return pool;
}

function getWebhookConfig() {
  // ОБЯЗАТЕЛЬНО задай WEBHOOK_BASE_URL в Render:
  // например: https://hairstyle-bot.onrender.com
  const base = (process.env.WEBHOOK_BASE_URL || "").trim().replace(/\/+$/, "");
  const path = (process.env.WEBHOOK_PATH || "/telegraf").trim();

  if (!base) return null;
  return { base, path, url: `${base}${path}` };
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

  const token = getToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing");

  const pool = createPoolIfConfigured();

  const bot = new Telegraf(token);
  startHandler(bot);
  callbackHandler(bot, pool);

  const app = express();

  // healthcheck (чтобы Render не убивал сервис)
  app.get("/", (_req, res) => res.status(200).send("ok"));
  app.get("/health", (_req, res) => res.status(200).send("ok"));

  const port = Number(process.env.PORT || 3000);
  const wh = getWebhookConfig();

  if (wh) {
    // WEBHOOK MODE (рекомендуется для Render)
    console.log("✅ Using WEBHOOK mode:", wh.url);

    // endpoint для телеграма
    app.use(wh.path, bot.webhookCallback(wh.path));

    // запускаем HTTP сервер
    app.listen(port, async () => {
      console.log(`✅ Healthcheck+Webhook server on :${port}`);

      try {
        await bot.telegram.setWebhook(wh.url);
        console.log("✅ Telegram webhook set:", wh.url);
      } catch (e) {
        console.error("❌ Failed to set webhook:", e?.message || e);
      }
    });
  } else {
    // POLLING MODE (fallback, если не задан WEBHOOK_BASE_URL)
    console.log("ℹ️ WEBHOOK_BASE_URL not set — using POLLING mode");
    app.listen(port, () => console.log(`✅ Healthcheck server on :${port}`));

    try {
      // на всякий случай очищаем webhook, чтобы polling работал
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    } catch (e) {
      console.warn("⚠️ deleteWebhook failed (can ignore):", e?.message || e);
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isConflictError = (err) => err?.response?.error_code === 409;
    const isTimeoutError = (err) =>
      err?.name === "TimeoutError" || String(err?.message || "").includes("Promise timed out");

    while (true) {
      try {
        await bot.launch();
        console.log("✅ Bot launched (polling)");
        break;
      } catch (e) {
        if (isConflictError(e)) {
          console.warn(
            "⚠️ Polling conflict detected (another instance is running). Retrying in 10s..."
          );
          await sleep(10000);
          continue;
        }
        if (isTimeoutError(e)) {
          console.warn("⚠️ Polling timed out. Retrying in 10s...");
          await sleep(10000);
          continue;
        }
        throw e;
      }
    }
  }

  process.once("SIGINT", async () => {
    try {
      if (wh) await bot.telegram.deleteWebhook();
    } catch {}
    bot.stop("SIGINT");
  });
  process.once("SIGTERM", async () => {
    try {
      if (wh) await bot.telegram.deleteWebhook();
    } catch {}
    bot.stop("SIGTERM");
  });
}
