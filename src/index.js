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

function startKeepAlive() {
  const url = (process.env.KEEPALIVE_URL || process.env.WEBHOOK_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!url) {
    console.log("ℹ️ KEEPALIVE_URL not set — keepalive disabled");
    return;
  }
  const intervalMs = Number(process.env.KEEPALIVE_INTERVAL_MS || 10 * 60 * 1000);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    console.log("ℹ️ KEEPALIVE_INTERVAL_MS invalid — keepalive disabled");
    return;
  }
  const healthUrl = `${url}/health`;
  console.log(`🔁 Keepalive enabled: ${healthUrl} every ${intervalMs}ms`);
  setInterval(async () => {
    try {
      const res = await fetch(healthUrl, { method: "GET" });
      if (!res.ok) {
        console.warn(`⚠️ Keepalive non-200: ${res.status} ${healthUrl}`);
      }
    } catch (error) {
      console.warn(`⚠️ Keepalive failed: ${healthUrl}`, error?.message || error);
    }
  }, intervalMs).unref();
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

  const restartState = { id: 0, reason: "" };
  const bot = new Telegraf(token);
  startHandler(bot, restartState);
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
    startKeepAlive();
  } else {
    // POLLING MODE (fallback, если не задан WEBHOOK_BASE_URL)
    console.log("ℹ️ WEBHOOK_BASE_URL not set — using POLLING mode");
    app.listen(port, () => console.log(`✅ Healthcheck server on :${port}`));
    startKeepAlive();

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
    const restartAfterWait = async (reason) => {
      restartState.id += 1;
      restartState.reason = reason;
      try {
        await bot.stop("RESTART");
      } catch {}
      console.log(`🔄 Restarting bot after wait (${reason})...`);
      await bot.launch();
      console.log("✅ Bot relaunched (polling)");
    };

    while (true) {
      try {
        await bot.launch();
        console.log("✅ Bot launched (polling)");
        break;
      } catch (e) {
        if (isConflictError(e)) {
          const reason = "обнаружен конфликт polling — бот уже запущен в другом месте";
          restartState.id += 1;
          restartState.reason = reason;
          console.error(
            "❌ Polling conflict: another bot instance is running. Stop the other instance or use webhook mode."
          );
          try {
            await bot.stop("CONFLICT");
          } catch {}
          break;
        }
        if (isTimeoutError(e)) {
          const reason = "истекло время ожидания ответа Telegram";
          console.warn("⚠️ Polling timed out. Retrying in 10s...");
          await sleep(10000);
          try {
            await restartAfterWait(reason);
            break;
          } catch (restartError) {
            console.warn("⚠️ Restart after timeout failed. Retrying in 10s...", restartError?.message);
            await sleep(10000);
            continue;
          }
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
