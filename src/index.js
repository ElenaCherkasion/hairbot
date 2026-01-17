// src/index.js
import express from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Telegraf } from "telegraf";

// handlers
import startHandler from "./handlers/start.js";
import callbackHandler from "./handlers/callback.js";
import photoHandler from "./handlers/photo.js";
import tariffsHandler from "./handlers/tariffs.js"; // опционально

// ===================== CONFIG =====================
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || "development";

const TELEGRAM_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) throw new Error("Telegram token missing.");

const WEBHOOK_PATH = process.env.WEBHOOK_PATH || "/telegram/webhook";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

// ===================== START =====================
export async function startBot() {
  // 1) Express app
  const app = express();
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(compression());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "10mb" }));

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // 2) Health endpoints (Render любит /health)
  app.get("/", (req, res) => res.status(200).send("HairBot is ru
