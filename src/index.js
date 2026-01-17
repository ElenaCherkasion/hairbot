import express from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Telegraf } from "telegraf";

const WEBHOOK_PATH_DEFAULT = "/telegram/webhook";

// -------------------- Simple in-memory state --------------------
// (Для MVP ок. Позже перенесем в БД.)
const userState = new Map(); // userId -> { step, lastPhotoMeta, createdAt }

function getState(userId) {
  return userState.get(userId) || { step: "idle", createdAt: Date.now() };
}

function setState(userId, patch) {
  const prev = getState(userId);
  userState.set(userId, { ...prev, ...patch });
}

function clearState(userId) {
  userState.delete(userId);
}

// -------------------- Photo heuristics --------------------
function pickBestTelegramPhoto(photos) {
  // Telegram присылает массив размеров одной и той же фотки
  // Выберем наибольшую по площади, а при равенстве — по file_size.
  if (!Array.isArray(photos) || photos.length === 0) return null;

  return photos
    .slice()
    .sort((a, b) => {
      const areaA = (a.width || 0) * (a.height || 0);
      const areaB = (b.width || 0) * (b.height || 0);
      if (areaA !== areaB) return areaB - areaA;
      return (b.file_size || 0) - (a.file_size || 0);
    })[0];
}

function evaluatePhotoQuality(photo) {
  // Это НЕ компьютерное зрение. Только эвристики по метаданным Telegram.
  // Задача: отсечь совсем плохие фото и дать понятные советы.
  const w = photo?.width || 0;
  const h = photo?.height || 0;
  const bytes = photo?.file_size || 0;

  const problems = [];
  const tips = [];

  if (!w || !h) {
    problems.push("не удалось прочитать размеры фото");
    tips.push("Попробуй отправить фото как обычное изображение (не как файл/документ).");
    return { ok: false, problems, tips, score: 0 };
  }

  const minSide = Math.min(w, h);
  const maxSide = Math.max(w, h);
  const megapixels = (w * h) / 1_000_000;
  const aspect = maxSide / (minSide || 1);

  // База
  // (Можешь подстроить под свой стиль.)
  if (minSide < 700) {
    problems.push(`низкое разрешение (${w}×${h})`);
    tips.push("Сделай фото ближе/четче или отправь оригинал без сжатия.");
  }

  if (bytes > 0 && bytes < 120_000) {
    problems.push("слишком сильное сжатие (маленький размер файла)");
    tips.push("Отправь фото без пересылки через мессенджеры/соцсети или выбери «оригинал».");
  }

  // Слишком “панорама” / странное соотношение сторон
  if (aspect > 2.1) {
    problems.push("неудачные пропорции кадра (слишком вытянуто)");
    tips.push("Нужен портрет/селфи, где лицо занимает центральную часть кадра.");
  }

  // Очень маленький общий размер
  if (megapixels < 0.6) {
    problems.push("слишком маленькое фото");
    tips.push("Сделай фото на основную камеру при хорошем свете.");
  }

  // Скоринг (условный)
  let score = 100;
  if (minSide < 700) score -= 35;
  if (bytes > 0 && bytes < 120_000) score -= 25;
  if (aspect > 2.1) score -= 20;
  if (megapixels < 0.6) score -= 20;

  const ok = problems.length === 0;
  return { ok, problems, tips, score: Math.max(0, score) };
}

function photoRequirementsText() {
  return (
    "Чтобы анализ был точным, пришли фото по этим правилам:\n" +
    "• лицо анфас (прямо в камеру)\n" +
    "• хороший дневной/ровный свет, без сильных теней\n" +
    "• без фильтров и сильной обработки\n" +
    "• волосы и линия роста волос видны\n" +
    "• без очков с бликами (если можно)\n\n" +
    "Можно селфи или фото с телефона — главное, чтобы было четко 🙂"
  );
}

// -------------------- Main entry --------------------
export async function startBot() {
  const PORT = Number(process.env.PORT || 3000);
  const NODE_ENV = process.env.NODE_ENV || "development";

  const TELEGRAM_TOKEN =
    process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;

  if (!TELEGRAM_TOKEN) {
    throw new Error("Telegram token missing. Set TELEGRAM_BOT_TOKEN (or TELEGRAM_TOKEN).");
  }

  const WEBHOOK_PATH = process.env.WEBHOOK_PATH || WEBHOOK_PATH_DEFAULT;
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

  // ===================== Express =====================
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

  app.get("/", (req, res) => res.status(200).send("HairBot is running ✅"));
  app.get("/health", (req, res) =>
    res.status(200).json({
      ok: true,
      service: "hairbot",
      env: NODE_ENV,
      time: new Date().toISOString(),
    })
  );

  // ВАЖНО: порт открываем сразу
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

  // /start → начинаем сценарий
  bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) setState(userId, { step: "awaiting_photo" });

    await ctx.reply(
      "Привет! Я HairBot ✂️\n\n" +
        "Сейчас я подберу форму лица и варианты стрижек. Для начала пришли фото лица."
    );
    await ctx.reply(photoRequirementsText());
  });

  // /cancel → сброс
  bot.command("cancel", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) clearState(userId);

    await ctx.reply("Ок, сбросила шаги ✅\nЕсли хочешь начать заново — отправь /start");
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Команды:\n" +
        "/start — начать\n" +
        "/cancel — сбросить шаги\n\n" +
        "Отправь фото — я проверю качество и перейду к анализу."
    );
  });

  // Фото → проверка + переход к “анализу”
  bot.on("photo", async (ctx) => {
    const userId = ctx.from?.id;
    const state = userId ? getState(userId) : { step: "idle" };

    const best = pickBestTelegramPhoto(ctx.message.photo);
    if (!best) {
      await ctx.reply("Не вижу фото 😕 Попробуй отправить ещё раз как изображение.");
      return;
    }

    const verdict = evaluatePhotoQuality(best);

    // сохраним мету (на будущее)
    if (userId) {
      setState(userId, {
        step: verdict.ok ? "photo_ok" : "awaiting_photo",
        lastPhotoMeta: {
          file_id: best.file_id,
          width: best.width,
          height: best.height,
          file_size: best.file_size || null,
          checkedAt: new Date().toISOString(),
          score: verdict.score,
        },
      });
    }

    if (!verdict.ok) {
      const problemsText = verdict.problems.map((p) => `• ${p}`).join("\n");
      const tipsText = verdict.tips.map((t) => `• ${t}`).join("\n");

      await ctx.reply(
        "Фото пока не подходит для точного анализа 😕\n\n" +
          "Что не так:\n" +
          problemsText +
          "\n\nКак улучшить:\n" +
          tipsText +
          "\n\nПришли другое фото — и продолжим."
      );
      return;
    }

    // Фото годное — идём дальше
    if (userId) setState(userId, { step: "analyzing" });

    // Можно показать короткое подтверждение
    await ctx.reply(
      `Фото отличное ✅ (качество: ${verdict.score}/100)\n` +
        "Начинаю анализ…"
    );

    // Тут позже подключим OpenAI Vision / свою модель.
    // Пока заглушка:
    await ctx.reply(
      "Готово! Следующий шаг — подключить анализ формы лица и собрать рекомендации.\n" +
        "Скажи: «включаем анализ», и я добавлю готовый код для OpenAI Vision + промпт."
    );

    if (userId) setState(userId, { step: "awaiting_next" });
  });

  // Текст → подсказки по сценарию
  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id;
    const state = userId ? getState(userId) : { step: "idle" };

    const msg = (ctx.message.text || "").trim().toLowerCase();

    if (msg === "включаем анализ" || msg === "включай анализ") {
      await ctx.reply(
        "Ок! Следующим сообщением пришлю блок кода: загрузка фото из Telegram + запрос в OpenAI Vision + разбор ответа простым языком."
      );
      return;
    }

    if (state.step === "awaiting_photo") {
      await ctx.reply("Жду фото 🙂 Пришли фото лица в хорошем свете (анфас).");
      return;
    }

    await ctx.reply("Лучше пришли фото 🙂 Если хочешь начать заново — /start");
  });

  // ===================== Webhook endpoint =====================
  app.post(WEBHOOK_PATH, async (req, res) => {
    try {
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

  console.log("🚀 HairBot fully started");
}
