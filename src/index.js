import dotenv from "dotenv";
dotenv.config();

import { Telegraf } from "telegraf";

export async function startBot() {
  const token = process.env.TELEGRAM_TOKEN || "";
  if (!token) {
    console.error("No token");
    return null;
  }
  
  const bot = new Telegraf(token);
  console.log("Bot initialized");
  return bot;
}
