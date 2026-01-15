import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// 🔐 TOKEN
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
console.log("Token prefix:", TELEGRAM_TOKEN?.slice(0, 10));

if (!TELEGRAM_TOKEN) {
  throw new Error("TELEGRAM_TOKEN is missing");
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// 🟢 WEBHOOK
app.post("/webhook", async (req, res) => {
  console.log("✅ WEBHOOK HIT");
  const update = req.body;

  if (update.message?.text === "/start") {
    const chatId = update.message.chat.id;

    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "👋 Привет! HAIRbot запущен и работает ✅",
      }),
    });
  }

  res.sendStatus(200);
});

// 🟢 HEALTHCHECK
app.get("/health", (req, res) => {
  res.send("OK");
});

// 🟢 START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Bot running on port", PORT);
});