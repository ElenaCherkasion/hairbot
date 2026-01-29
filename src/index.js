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
    console.log("в„№пёЏ DATABASE_URL not set вЂ” DB disabled");
    return null;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  });

  console.log("вњ… DB pool created");
  return pool;
}

function getWebhookConfig() {
  // РћР‘РЇР—РђРўР•Р›Р¬РќРћ Р·Р°РґР°Р№ WEBHOOK_BASE_URL РІ Render:
  // РЅР°РїСЂРёРјРµСЂ: https://hairstyle-bot.onrender.com
  const baseUrl = (process.env.WEBHOOK_BASE_URL || "").trim().replace(/\/+$/, "");
  const rawPath = (process.env.WEBHOOK_PATH || "/telegraf").trim() || "/telegraf";
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

  if (!baseUrl) return null;
  return { baseUrl, path, url: `${baseUrl}${path}` };
}

export async function startBot() {
  const token = getToken();
  if (!token) {
    console.error("вќЊ TELEGRAM_TOKEN/TELEGRAM_BOT_TOKEN/BOT_TOKEN is missing");
    process.exit(1);
  }

  const pool = createPoolIfConfigured();

  const bot = new Telegraf(token);
  const restartState = { id: 0, reason: "" };

  startHandler(bot, restartState);
  callbackHandler(bot, pool);

  const appServer = express();
  appServer.use(express.json({ limit: "2mb" }));
  const runKeepAlive =
    typeof startKeepAlive === "function" ? startKeepAlive : () => {};

  // healthcheck (С‡С‚РѕР±С‹ Render РЅРµ СѓР±РёРІР°Р» СЃРµСЂРІРёСЃ)
  appServer.get("/", (_req, res) => res.status(200).send("ok"));
  appServer.get("/health", (_req, res) => res.status(200).send("ok"));

  const wh = getWebhookConfig();
  const port = Number(process.env.PORT || 3000);
let server;
  let server;

  if (wh) {
    console.log("вњ… Using WEBHOOK mode:", wh.url);

    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    } catch (e) {
      console.warn("вљ пёЏ deleteWebhook failed (can ignore):", e?.message || e);
    }

    // endpoint РґР»СЏ С‚РµР»РµРіСЂР°РјР°
    appServer.use(wh.path, bot.webhookCallback(wh.path));

    // запускаем HTTP сервер
    server = appServer.listen(port, async () => {
      console.log(`✅ Healthcheck+Webhook server on :${port}`);

      try {
        await bot.launch({ webhook: { domain: wh.baseUrl, hookPath: wh.path } });
        await bot.telegram.setWebhook(wh.url);
        console.log("вњ… Telegram webhook set:", wh.url);
      } catch (e) {
        console.error("вќЊ Failed to set webhook:", e?.message || e);
      }
    });
    server.on("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        console.error(`вќЊ Port ${port} is already in use. Check for another running process.`);
      } else {
        console.error("вќЊ Server listen error:", error?.message || error);
      }
      process.exit(1);
    });
    runKeepAlive();
  } else {
    console.log("ℹ️ WEBHOOK_BASE_URL not set — using POLLING mode");
    server = appServer.listen(port, () => console.log(`✅ Healthcheck server on :${port}`));
    server.on("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        console.error(`вќЊ Port ${port} is already in use. Check for another running process.`);
      } else {
        console.error("вќЊ Server listen error:", error?.message || error);
      }
      process.exit(1);
    });
    runKeepAlive();

    try {
      // РЅР° РІСЃСЏРєРёР№ СЃР»СѓС‡Р°Р№ РѕС‡РёС‰Р°РµРј webhook, С‡С‚РѕР±С‹ polling СЂР°Р±РѕС‚Р°Р»
      await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    } catch (e) {
      console.warn("вљ пёЏ deleteWebhook failed (can ignore):", e?.message || e);
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
      console.log(`рџ”„ Restarting bot after wait (${reason})...`);
      await bot.launch();
      console.log("вњ… Bot relaunched (polling)");
    };

    while (true) {
      try {
        await bot.launch();
        console.log("вњ… Bot launched (polling)");
        break;
      } catch (e) {
        if (isConflictError(e)) {
          const reason = "РѕР±РЅР°СЂСѓР¶РµРЅ РєРѕРЅС„Р»РёРєС‚ polling вЂ” Р±РѕС‚ СѓР¶Рµ Р·Р°РїСѓС‰РµРЅ РІ РґСЂСѓРіРѕРј РјРµСЃС‚Рµ";
          restartState.id += 1;
          restartState.reason = reason;
          console.error(
            "вќЊ Polling conflict: another bot instance is running. Stop the other instance or use webhook mode."
          );
          try {
            await bot.stop("CONFLICT");
          } catch {}
          break;
        }
        if (isTimeoutError(e)) {
          const reason = "РёСЃС‚РµРєР»Рѕ РІСЂРµРјСЏ РѕР¶РёРґР°РЅРёСЏ РѕС‚РІРµС‚Р° Telegram";
          console.warn("вљ пёЏ Polling timed out. Retrying in 10s...");
          await sleep(10000);
          try {
            await restartAfterWait(reason);
            break;
          } catch (restartError) {
            console.warn("вљ пёЏ Restart after timeout failed. Retrying in 10s...", restartError?.message);
            await sleep(10000);
            continue;
          }
        }
        throw e;
      }
    }
  }

  const shutdown = async () => {
    try {
      await bot.stop();
    } catch {}
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

