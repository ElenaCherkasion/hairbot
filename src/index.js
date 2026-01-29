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
  const base = (process.env.WEBHOOK_BASE_URL || "").trim().replace(/\/+$/, "");
  const path = (process.env.WEBHOOK_PATH || "/telegraf").trim();
  if (!base) return null;
  return { base, path, url: `${base}${path}` };
}

export async function startBot() {
  const token = getToken();
  if (!token) {
    console.error("❌ TELEGRAM_TOKEN/TELEGRAM_BOT_TOKEN/BOT_TOKEN is missing");
    process.exit(1);
  }

  const isTestEnv = process.env.NODE_ENV === "test" || token === "test_token_123";

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // healthcheck
  app.get("/health", (_req, res) => res.status(200).send("ok"));

  const pool = createPoolIfConfigured();

  const bot = new Telegraf(token);

  // handlers
  bot.start((ctx) => startHandler(ctx, { pool }));
  bot.on("callback_query", (ctx) => callbackHandler(ctx, { pool }));

  const wh = getWebhookConfig();
  const port = Number(process.env.PORT || 3000);

  if (wh) {
    console.log("✅ Using WEBHOOK mode:", wh.url);

    // ✅ без double-path
    app.use(wh.path, bot.webhookCallback());

    if (!isTestEnv) {
      await bot.telegram.setWebhook(wh.url);
      console.log("✅ Telegram webhook set:", wh.url);
    } else {
      console.log("⚠️ NODE_ENV=test — skipping Telegram webhook setup");
    }
  } else {
    console.log("ℹ️ WEBHOOK_BASE_URL not set — using POLLING mode");
    if (!isTestEnv) {
      await bot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
      await bot.launch();
    } else {
      console.log("⚠️ NODE_ENV=test — skipping bot.launch()");
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
