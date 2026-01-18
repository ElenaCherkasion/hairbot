// src/index.js
import { Telegraf } from "telegraf";
import pg from "pg";

import startHandler from "./handlers/start.js";
import callbackHandler from "./handlers/callback.js";

export async function startBot() {
  console.log("🔧 startBot() called");

  const TELEGRAM_TOKEN =
    process.env.TELEGRAM_TOKEN ||
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.TG_TOKEN;

  if (!TELEGRAM_TOKEN) {
    throw new Error("TELEGRAM_TOKEN / TELEGRAM_BOT_TOKEN is missing");
  }

  const bot = new Telegraf(TELEGRAM_TOKEN);
  // ...
}
