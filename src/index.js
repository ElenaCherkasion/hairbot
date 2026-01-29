import dotenv from "dotenv";
dotenv.config();

import { Telegraf } from "telegraf";

function getToken() {
  return (
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.TELEGRAM_TOKEN ||
    process.env.BOT_TOKEN ||
    ""
  ).trim();
}

export async function startBot() {
  const token = getToken();
  if (!token) {
    console.error("TELEGRAM_TOKEN/TELEGRAM_BOT_TOKEN/BOT_TOKEN is missing");
    process.exit(1);
  }

  const bot = new Telegraf(token);
  console.log("✅ Bot initialized successfully");
  
  // Минимальная конфигурация
  bot.launch().then(() => {
    console.log("✅ Bot started");
  }).catch(e => {
    console.error("❌ Bot failed to start:", e);
  });
  
  return bot;
}
