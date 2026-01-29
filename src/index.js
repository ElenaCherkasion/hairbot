// src/index.js
import dotenv from "dotenv"; // TODO: enforce webhook-only when WEBHOOK_BASE_URL is set (fix 409)
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
  const baseUrl = (process.env.WEBHOOK_BASE_URL || "").trim().replace(/\/+$/, "");
  const path = (process.env.WEBHOOK_PATH || "/telegraf").trim();

  if (!baseUrl) return null;
  return { baseUrl, path, url: `${baseUrl}${path}` };
}

export async function startBot() {
  const token = getToken();
  if (!token) {
    console.error("❌ TELEGRAM_TOKEN/TELEGRAM_BOT_TOKEN/BOT_TOKEN is missing");
    process.exit(1);
  }

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // healthcheck
  app.get("/health", (_req, res) => res.status(200).send("ok"));

  const pool = createPoolIfConfigured();

  const bot = new Telegraf(token);

  const appServer = express();
  const runKeepAlive =
    typeof startKeepAlive === "function" ? startKeepAlive : () => {};

  // healthcheck (чтобы Render не убивал сервис)
  appServer.get("/", (_req, res) => res.status(200).send("ok"));
  appServer.get("/health", (_req, res) => res.status(200).send("ok"));

  const wh = getWebhookConfig();
  const port = Number(process.env.PORT || 3000);
let server;

  if (wh) {
    console.log("✅ Using WEBHOOK mode:", wh.url);

    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    } catch (e) {
      console.warn("⚠️ deleteWebhook failed (can ignore):", e?.message || e);
    }

    // endpoint для телеграма
    appServer.use(wh.path, bot.webhookCallback(wh.path));

    // запускаем HTTP сервер
    appServer.listen(port, async () => {
      console.log(`✅ Healthcheck+Webhook server on :${port}`);

      try {
        await bot.launch({ webhook: { domain: wh.baseUrl, hookPath: wh.path } });
        await bot.telegram.setWebhook(wh.url);
        console.log("✅ Telegram webhook set:", wh.url);
      } catch (e) {
        console.error("❌ Failed to set webhook:", e?.message || e);
      }
    });
    server.on("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        console.error(`❌ Port ${port} is already in use. Check for another running process.`);
      } else {
        console.error("❌ Server listen error:", error?.message || error);
      }
      process.exit(1);
    });
    runKeepAlive();
  } else {
    console.log("ℹ️ WEBHOOK_BASE_URL not set — using POLLING mode");
    const server = appServer.listen(port, () => console.log(`✅ Healthcheck server on :${port}`));
    server.on("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        console.error(`❌ Port ${port} is already in use. Check for another running process.`);
      } else {
        console.error("❌ Server listen error:", error?.message || error);
      }
      process.exit(1);
    });
    runKeepAlive();

    try {
      // на всякий случай очищаем webhook, чтобы polling работал
      await bot.telegram.deleteWebhook({ drop_pending_updates: false });
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

  app.listen(port, "0.0.0.0", () => {
    console.log(`✅ Healthcheck+Webhook server on :${port}`);
  });

  const shutdown = async () => {
    try {
      await bot.stop();
    } catch {}
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
