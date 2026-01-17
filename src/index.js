import express from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Telegraf, Markup } from "telegraf";
import OpenAI from "openai";

// ===================== CONFIG =====================
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || "development";

const TELEGRAM_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
  throw new Error(
    "Telegram token missing. Set TELEGRAM_BOT_TOKEN (or TELEGRAM_TOKEN)."
  );
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const TELEGRAM_FILE_BASE = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}`;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

const WEBHOOK_PATH = process.env.WEBHOOK_PATH || "/telegram/webhook";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

// ===================== STATE (MVP in-memory) =====================
// Для продакшена лучше перенести в БД.
const userState = new Map(); // userId -> { consent, consentAt, plan, step, lastPhotoMeta }

function getState(userId) {
  return userState.get(userId) || {
    consent: false,
    consentAt: null,
    plan: "free", // free | premium
    step: "idle",
    lastPhotoMeta: null,
  };
}
function setState(userId, patch) {
  userState.set(userId, { ...getState(userId), ...patch });
}
function clearState(userId) {
  userState.delete(userId);
}

// ===================== CONSENT TEXT =====================
// ⚠️ Это шаблон. Для юридической корректности лучше согласовать текст с юристом под твою юрисдикцию.
function consentText() {
  return (
    "Перед тем как вы отправите фото, нужно ваше согласие на обработку персональных данных.\n\n" +
    "Нажимая «Согласен(а)», вы подтверждаете, что:\n" +
    "• добровольно предоставляете фото и персональные данные для получения рекомендаций по стрижке/цвету;\n" +
    "• понимаете, что фото будет обработано автоматически (в т.ч. с использованием сторонних сервисов ИИ) исключительно для формирования результата;\n" +
    "• согласие можно отозвать командой /withdraw, после чего обработка новых фото будет заблокирована.\n\n" +
    "Если вы НЕ согласны — нажмите «Не согласен(а)», и бот не будет принимать фото."
  );
}

function requirementsText() {
  return (
    "Требования к фото для точного анализа:\n" +
    "• лицо анфас (прямо в камеру)\n" +
    "• хороший ровный свет, без сильных теней\n" +
    "• без фильтров/масок\n" +
    "• видны линия роста волос и контуры лица\n\n" +
    "После фото я сделаю анализ и предложу варианты стрижек."
  );
}

// ===================== PHOTO HELPERS =====================
function pickBestTelegramPhoto(photos) {
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
  const w = photo?.width || 0;
  const h = photo?.height || 0;
  const bytes = photo?.file_size || 0;

  const problems = [];
  const tips = [];

  if (!w || !h) {
    problems.push("не удалось определить размеры фото");
    tips.push("Отправь фото как изображение (не документом).");
    return { ok: false, problems, tips, score: 0 };
  }

  const minSide = Math.min(w, h);
  const maxSide = Math.max(w, h);
  const megapixels = (w * h) / 1_000_000;
  const aspect = maxSide / (minSide || 1);

  if (minSide < 700) {
    problems.push(`низкое разрешение (${w}×${h})`);
    tips.push("Сделай фото ближе/четче или отправь оригинал без сильного сжатия.");
  }

  if (bytes > 0 && bytes < 120_000) {
    problems.push("слишком сильное сжатие (маленький размер файла)");
    tips.push("Отправь оригинал/без пересжатия (например, «как файл» не надо; лучше обычным фото, но из галереи оригинал).");
  }

  if (aspect > 2.1) {
    problems.push("неудачные пропорции кадра (слишком вытянуто)");
    tips.push("Нужен портрет/селфи, где лицо по центру, без панорамы.");
  }

  if (megapixels < 0.6) {
    problems.push("слишком маленькое фото");
    tips.push("Сделай фото на основную камеру при хорошем свете.");
  }

  let score = 100;
  if (minSide < 700) score -= 35;
  if (bytes > 0 && bytes < 120_000) score -= 25;
  if (aspect > 2.1) score -= 20;
  if (megapixels < 0.6) score -= 20;

  return { ok: problems.length === 0, problems, tips, score: Math.max(0, score) };
}

// ===================== TELEGRAM FILE -> BASE64 =====================
async function tgGetFilePath(fileId) {
  const r = await fetch(`${TELEGRAM_API}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram getFile failed: ${JSON.stringify(data)}`);
  return data.result.file_path;
}

async function downloadTelegramFileAsBase64(filePath) {
  const url = `${TELEGRAM_FILE_BASE}/${filePath}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`File download failed: ${r.status}`);
  const arrBuf = await r.arrayBuffer();
  const buf = Buffer.from(arrBuf);
  const b64 = buf.toString("base64");

  // Telegram фото обычно jpeg, но иногда webp. Для простоты — jpeg.
  // Если хочешь точнее: можно определить по сигнатуре/headers.
  return `data:image/jpeg;base64,${b64}`;
}

// ===================== OPENAI VISION ANALYSIS =====================
async function analyzeWithOpenAI({ imageDataUrl, plan }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing (Render Environment).");
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const variantsCount = plan === "premium" ? 4 : 2;

  const prompt =
    "Ты — профессиональный стилист. Проанализируй лицо на фото и дай результат простым языком.\n" +
    "1) Определи форму лица (если смешанная — укажи 2 ближайшие).\n" +
    "2) Опиши ключевые особенности: линия челюсти, лоб, скулы, пропорции.\n" +
    `3) Дай ${variantsCount} вариантов стрижек/длины (с нумерацией 1..${variantsCount}).\n` +
    "   Для каждого: кому подходит, что визуально корректирует, какая длина/чёлка.\n" +
    "4) Добавь короткий блок «чего избегать» (1–3 пункта).\n" +
    "Пиши компактно, структурировано, без воды.";

  const resp = await openai.chat.completions.create({
    model: OPENAI_VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    temperature: 0.6,
  });

  const text = resp?.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("Empty OpenAI response");
  return text;
}

// ===================== BOT UI (buttons) =====================
function consentKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Согласен(а)", "consent_yes")],
    [Markup.button.callback("❌ Не согласен(а)", "consent_no")],
  ]);
}

function planKeyboard(currentPlan) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        currentPlan === "free" ? "✅ Free (2 варианта)" : "Free (2 варианта)",
        "plan_free"
      ),
    ],
    [
      Markup.button.callback(
        currentPlan === "premium" ? "✅ Premium (4 варианта)" : "Premium (4 варианта)",
        "plan_premium"
      ),
    ],
  ]);
}

// ===================== START BOT =====================
export async function startBot() {
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
    res.status(200).json({ ok: true, env: NODE_ENV, time: new Date().toISOString() })
  );

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
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);
    setState(userId, { step: "awaiting_consent" });

    await ctx.reply(
      "Привет! Я HairBot ✂️\n\n" +
        "Я подбираю стрижки по форме лица. Но сначала нужно согласие на обработку персональных данных."
    );

    if (st.consent) {
      await ctx.reply("Согласие уже принято ✅");
      await ctx.reply("Выбери тариф (влияет на количество вариантов):", planKeyboard(st.plan));
      await ctx.reply("Теперь пришли фото 🙂\n\n" + requirementsText());
      setState(userId, { step: "awaiting_photo" });
      return;
    }

    await ctx.reply(consentText(), consentKeyboard());
  });

  bot.command("consent", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);
    if (st.consent) {
      await ctx.reply("Согласие уже принято ✅\nОтозвать: /withdraw");
    } else {
      await ctx.reply(consentText(), consentKeyboard());
    }
  });

  bot.command("withdraw", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    setState(userId, {
      consent: false,
      consentAt: null,
      step: "awaiting_consent",
      lastPhotoMeta: null,
    });

    await ctx.reply(
      "Согласие отозвано ✅\n" +
        "Я больше не буду обрабатывать новые фото, пока вы снова не дадите согласие.\n\n" +
        "Если захотите продолжить — /start"
    );
  });

  bot.command("plan", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);
    await ctx.reply("Выбери тариф:", planKeyboard(st.plan));
  });

  bot.command("cancel", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    clearState(userId);
    await ctx.reply("Ок, сбросила шаги ✅\nНачать заново: /start");
  });

  // ====== Consent actions ======
  bot.action("consent_yes", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    setState(userId, {
      consent: true,
      consentAt: new Date().toISOString(),
      step: "choose_plan",
    });

    await ctx.answerCbQuery("Согласие принято ✅");
    await ctx.editMessageText("Согласие принято ✅");

    const st = getState(userId);
    await ctx.reply("Выбери тариф (влияет на количество вариантов):", planKeyboard(st.plan));
    await ctx.reply("Теперь пришли фото 🙂\n\n" + requirementsText());
    setState(userId, { step: "awaiting_photo" });
  });

  bot.action("consent_no", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    setState(userId, { consent: false, consentAt: null, step: "awaiting_consent" });

    await ctx.answerCbQuery("Ок");
    await ctx.editMessageText(
      "Без согласия я не могу обрабатывать фото.\n\n" +
        "Если передумаете — нажмите /start или /consent."
    );
  });

  // ====== Plan actions ======
  bot.action("plan_free", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    setState(userId, { plan: "free" });
    await ctx.answerCbQuery("Тариф: Free");
    const st = getState(userId);
    await ctx.editMessageReplyMarkup(planKeyboard(st.plan).reply_markup);
  });

  bot.action("plan_premium", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    setState(userId, { plan: "premium" });
    await ctx.answerCbQuery("Тариф: Premium");
    const st = getState(userId);
    await ctx.editMessageReplyMarkup(planKeyboard(st.plan).reply_markup);

    // Важно: здесь нет оплаты — это просто переключатель.
    // Позже добавим оплату/проверку подписки/кредитов.
  });

  // ====== Photo handler (BLOCKED until consent) ======
  bot.on("photo", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);

    if (!st.consent) {
      await ctx.reply(
        "Я не могу обработать фото без согласия на обработку персональных данных.\n\n" +
          "Нажмите /consent и подтвердите."
      );
      return;
    }

    const best = pickBestTelegramPhoto(ctx.message.photo);
    if (!best) {
      await ctx.reply("Не вижу фото 😕 Попробуй отправить ещё раз как изображение.");
      return;
    }

    const verdict = evaluatePhotoQuality(best);
    setState(userId, {
      lastPhotoMeta: {
        file_id: best.file_id,
        width: best.width,
        height: best.height,
        file_size: best.file_size || null,
        checkedAt: new Date().toISOString(),
        score: verdict.score,
      },
    });

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
      setState(userId, { step: "awaiting_photo" });
      return;
    }

    await ctx.reply(
      `Фото отличное ✅ (качество: ${verdict.score}/100)\n` + "Начинаю анализ…"
    );
    setState(userId, { step: "analyzing" });

    try {
      // 1) получить путь файла
      const filePath = await tgGetFilePath(best.file_id);

      // 2) скачать и преобразовать в data URL base64
      const imageDataUrl = await downloadTelegramFileAsBase64(filePath);

      // 3) анализ OpenAI Vision
      const resultText = await analyzeWithOpenAI({
        imageDataUrl,
        plan: st.plan,
      });

      await ctx.reply(resultText);
      setState(userId, { step: "done" });
    } catch (err) {
      console.error("❌ Analyze error:", err);
      setState(userId, { step: "awaiting_photo" });

      await ctx.reply(
        "Не получилось выполнить анализ 😕\n" +
          "Попробуй ещё раз чуть позже или пришли другое фото."
      );
    }
  });

  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);

    if (!st.consent) {
      await ctx.reply(
        "Чтобы продолжить, нужно согласие на обработку персональных данных.\n\n" +
          "Нажмите /consent."
      );
      return;
    }

    await ctx.reply(
      "Пришли фото лица 🙂\n\n" +
        "Команды:\n" +
        "/plan — выбрать тариф\n" +
        "/withdraw — отозвать согласие\n" +
        "/cancel — сброс"
    );
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
