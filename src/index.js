// src/index.js
import dotenv from "dotenv";
dotenv.config();

import { Telegraf } from "telegraf";
import pg from "pg";

import startHandler from "./handlers/start.js";
import callbackHandler from "./handlers/callback.js";
import logger from "./utils/logger.js";

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
    logger.info("DATABASE_URL not set — DB disabled");
    return null;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  });

  logger.info("DB pool created");
  return pool;
}

function getWebhookConfig() {
  const base = (process.env.WEBHOOK_BASE_URL || "").trim().replace(/\/+$/, "");
  const path = (process.env.WEBHOOK_PATH || "/telegraf").trim();
  if (!base) return null;
  return { base, path, url: `${base}${path}` };
}

export async function startBot() {
  const token = getToken();
  if (!token) {
    logger.error("TELEGRAM_TOKEN/TELEGRAM_BOT_TOKEN/BOT_TOKEN is missing");
    process.exit(1);
  }

  const { default: express } = await import("express");

  const isTestEnv = process.env.NODE_ENV === "test" || token === "test_token_123";

  logger.info("Starting bot", {
    nodeEnv: process.env.NODE_ENV || "development",
    webhookBase: process.env.WEBHOOK_BASE_URL || null,
    port: Number(process.env.PORT || 3000),
    isTestEnv,
  });

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // healthcheck
  app.get("/health", (_req, res) => res.status(200).send("ok"));

  const pool = createPoolIfConfigured();

  const bot = new Telegraf(token);

  // handlers
  startHandler(bot);
  bot.on("callback_query", (ctx) => callbackHandler(ctx, { pool }));

  const wh = getWebhookConfig();
  const port = Number(process.env.PORT || 3000);

  if (wh) {
    logger.info("Using WEBHOOK mode", { url: wh.url });

    // ✅ без double-path
    app.use(wh.path, bot.webhookCallback());

    if (!isTestEnv) {
      await bot.telegram.setWebhook(wh.url);
      logger.info("Telegram webhook set", { url: wh.url });
    } else {
      logger.warn("NODE_ENV=test — skipping Telegram webhook setup");
    }
  } else {
    logger.info("WEBHOOK_BASE_URL not set — using POLLING mode");
    if (!isTestEnv) {
      await bot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
      await bot.launch();
    } else {
      logger.warn("NODE_ENV=test — skipping bot.launch()");
    }
  }

  const server = app.listen(port, "0.0.0.0", () => {
    logger.info("Healthcheck+Webhook server listening", { port });
  });

  const shutdown = async () => {
    try {
      await bot.stop();
    } catch {}
    try {
      server.close();
    } catch {}
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
