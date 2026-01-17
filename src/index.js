import express from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Telegraf } from "telegraf";

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || "development";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) throw new Error("TELEGRAM_TOKEN is missing");

const PUBLIC_URL = process.env.PUBLIC_URL; 
// Пример: https://hairbot.onrender.com
// Нужен для webhooks. Если не задан — бот всё равно запустит сервер, но webhook не настроит автоматически.

const WEBHOOK_PATH = process.env.WEBHOOK_PATH || "/telegram/webhook";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ""; // необязательно, но полезно

export async function startBot() {
  console.log("✅ startBot() стартует...");
  console.log("   NODE_ENV:", NODE_ENV);
  console.log("   PORT:", PORT);
  console.log("   PUBLIC_URL:", PUBLIC_URL || "(не задан)");

  // ===================== Express =====================
  const app = express();

  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  // Telegram присылает JSON, иногда большой — оставим запас
  app.use(express.json({ limit: "10mb" }));

  // лёгкий rate-limit (чтобы не ушатали endpoint)
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // ===================== Healthcheck =====================
  app.get("/", (req, res) => {
    res.status(200).send("HairBot is running ✅");
  });

  app.get("/health", (req, res) => {
    res.status(200).json({
      ok: true,
      service: "hairbot",
      env: NODE_ENV,
      time: new Date().toISOString(),
    });
  });

  // ===================== Telegraf =====================
  const bot = new Telegraf(TELEGRAM_TOKEN);

  // Базовые команды (чтобы сразу проверить, что всё работает)
  bot.start(async (ctx) => {
    await ctx.reply(
      "Привет! Я HairBot ✂️\n\n" +
        "Отправь фото (как на паспорт: лицо прямо, хороший свет), и я подберу форму лица и варианты стрижек."
    );
  });

  bot.help(async (ctx) => {
    await ctx.reply(
      "Команды:\n" +
        "/start — начало\n" +
        "/help — помощь\n\n" +
        "Можно просто отправить фото."
    );
  });

  bot.on("text", async (ctx) => {
    await ctx.reply("Я умею работать с фото 🙂 Пришли фото лица в хорошем свете.");
  });

  bot.on("photo", async (ctx) => {
    // Заглушка под твою будущую логику
    await ctx.reply(
      "Фото получено ✅\n" +
        "Дальше будет анализ формы лица + подбор стрижек + (опционально) цветотип."
    );
  });

  // ===================== Webhook handler =====================
  // ВАЖНО: Telegraf умеет отдавать middleware для Express
  // Можно (опционально) защититься секретом через query/header.
  app.post(WEBHOOK_PATH, async (req, res) => {
    try {
      // Простая защита (по желанию):
      // 1) через header: X-Telegram-Bot-Api-Secret-Token
      // Telegram поддерживает это при setWebhook.
      if (WEBHOOK_SECRET) {
        const secretHeader = req.get("X-Telegram-Bot-Api-Secret-Token");
        if (secretHeader !== WEBHOOK_SECRET) {
          return res.status(403).send("Forbidden");
        }
      }

      await bot.handleUpdate(req.body, res);
      // Telegraf сам отправит ответ через res, если нужно
    } catch (err) {
      console.error("❌ Ошибка обработки webhook:", err);
      res.sendStatus(500);
    }
  });

  // ===================== Start web server (Render needs this) =====================
  // КЛЮЧЕВО: слушаем PORT от Render и bind на 0.0.0.0
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Web server listening on http://0.0.0.0:${PORT}`);
    console.log(`✅ Webhook endpoint: ${WEBHOOK_PATH}`);
  });

  // ===================== Auto-set webhook (optional) =====================
  // Это удобство: если PUBLIC_URL задан, можно автоматически выставить webhook
  // при старте. Если не задан — просто пропускаем.
  if (PUBLIC_URL) {
    const webhookUrl = `${PUBLIC_URL}${WEBHOOK_PATH}`;
    try {
      // Telegraf: setWebhook
      await bot.telegram.setWebhook(webhookUrl, {
        secret_token: WEBHOOK_SECRET || undefined,
      });
      console.log("✅ Telegram webhook установлен:", webhookUrl);
    } catch (err) {
      console.error("⚠️ Не удалось установить webhook автоматически:", err?.message || err);
      console.log("   Можно установить вручную скриптом webhook:setup или через BotFather/Telegram API.");
    }
  } else {
    console.log("ℹ️ PUBLIC_URL не задан — webhook автоматически не ставлю.");
    console.log("   Укажи PUBLIC_URL в Render (например https://hairbot.onrender.com), и перезапусти.");
  }

  console.log("🚀 HairBot запущен успешно.");
}
