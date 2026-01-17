import express from "express";
import fetch from "node-fetch";

// ================== CONFIG ==================
const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ================== START BOT ==================
export async function startBot() {
  console.log("🤖 startBot() вызван");

  if (!TELEGRAM_TOKEN) {
    throw new Error("TELEGRAM_TOKEN не установлен");
  }

  const app = express();
  app.use(express.json());

  // ====== Healthcheck для Render ======
  app.get("/", (req, res) => {
    res.send("HairBot is running ✅");
  });

  // ====== Telegram webhook endpoint ======
  app.post("/webhook", async (req, res) => {
    try {
      const update = req.body;
      console.log("📩 Update получен");

      if (update.message?.text) {
        await sendMessage(
          update.message.chat.id,
          "Привет! HairBot запущен ✂️"
        );
      }

      res.sendStatus(200);
    } catch (err) {
      console.error("Ошибка обработки webhook:", err);
      res.sendStatus(500);
    }
  });

  app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
  });

  console.log("🚀 HairBot успешно запущен");
}

// ================== HELPERS ==================
async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
}
