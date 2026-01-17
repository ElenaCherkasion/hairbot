import express from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Telegraf } from "telegraf";

export async function startBot() {
  console.log("✅ startBot() entered");
  console.log("ENV PORT =", process.env.PORT);

  const PORT = Number(process.env.PORT || 3000);
  const NODE_ENV = process.env.NODE_ENV || "development";
  console.log("🔎 DEBUG ENV CHECK");
console.log("PUBLIC_URL in env:", "PUBLIC_URL" in process.env);
console.log("PUBLIC_URL value:", process.env.PUBLIC_URL);

  // Поддержим оба варианта имени токена
  const TELEGRAM_TOKEN =
    process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;

  if (!TELEGRAM_TOKEN) {
    throw new Error(
      "Telegram token missing. Set TELEGRAM_BOT_TOKEN (or TELEGRAM_TOKEN)."
    );
  }

  const PUBLIC_URL = process.env.PUBLIC_URL || ""; // например: https://hairstyle-bot.onrender.com
  const WEBHOOK_PATH = process.env.WEBHOOK_PATH || "/telegram/webhook";
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ""; // опционально

  // ===================== Express (сначала) =====================
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

  // Telegram шлет JSON. Оставим запас по размеру.
  app.use(express.json({ limit: "10mb" }));

  // Небольшой rate limit
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // Health endpoints
  app.get("/", (req, res) => res.status(200).send("HairBot is running ✅"));
  app.get("/health", (req, res) =>
    res.status(200).json({
      ok: true,
      service: "hairbot",
      env: NODE_ENV,
      time: new Date().toISOString(),
    })
  );

  // ====== ВАЖНО: открыть порт как можно раньше ======
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("✅ LISTENING", server.address());
    console.log("✅ Webhook path:", WEBHOOK_PATH);
  });

  server.on("error", (e) => {
    console.error("❌ SERVER ERROR", e);
    process.exit(1);
  });

  // ===================== Telegraf =====================
  const bot = new Telegraf(TELEGRAM_TOKEN);

  bot.start(async (ctx) => {
    await ctx.reply(
      "Привет! Я HairBot ✂️\n\n" +
        "Пришли фото лица в хорошем свете (анфас, без фильтров), и я подберу форму лица и варианты стрижек."
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

  bot.on("photo", async (ctx) => {
    await ctx.reply(
      "Фото получено ✅\n" +
        "Дальше будет: анализ формы лица + подбор стрижек + (опционально) цветотип."
    );
  });

  bot.on("text", async (ctx) => {
    await ctx.reply("Я лучше работаю с фото 🙂 Пришли фото лица в хорошем свете.");
  });

  // ===================== Webhook endpoint =====================
  app.post(WEBHOOK_PATH, async (req, res) => {
    try {
      // Опциональная защита (если задан WEBHOOK_SECRET и webhook поставлен с secret_token)
      if (WEBHOOK_SECRET) {
        const secretHeader = req.get("X-Telegram-Bot-Api-Secret-Token");
        if (secretHeader !== WEBHOOK_SECRET) {
          return res.status(403).send("Forbidden");
        }
      }

      await bot.handleUpdate(req.body, res);
    } catch (err) {
      console.error("❌ Webhook handler error:", err);
      res.sendStatus(500);
    }
  });

  // ===================== Auto setWebhook (опционально) =====================
  if (PUBLIC_URL) {
    const webhookUrl = `${PUBLIC_URL}${WEBHOOK_PATH}`;
    try {
      await bot.telegram.setWebhook(webhookUrl, {
        secret_token: WEBHOOK_SECRET || undefined,
        drop_pending_updates: true,
      });
      console.log("✅ Telegram webhook set:", webhookUrl);
      if (WEBHOOK_SECRET) console.log("✅ Webhook secret enabled");
    } catch (err) {
      console.error("⚠️ Failed to set webhook automatically:", err?.message || err);
      console.log("   Если Shell недоступен — поставь webhook вручную через браузер/API.");
    }
  } else {
    console.log("ℹ️ PUBLIC_URL не задан — webhook автоматически не ставлю.");
    console.log("   Добавь PUBLIC_URL в Render и redeploy.");
  }

  console.log("🚀 HairBot fully started");
}
