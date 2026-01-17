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

  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  if (!TELEGRAM_TOKEN) throw new Error("TELEGRAM_TOKEN is missing");

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

  app.use(express.json({ limit: "10mb" }));

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
        "Пришли фото лица в хорошем свете (анфас, без фильтров), и я подберу форму лица + варианты стрижек."
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
    // Заглушка под твою будущую логику анализа
    await ctx.re
