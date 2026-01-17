import express from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Telegraf, Markup } from "telegraf";
import OpenAI from "openai";
import crypto from "crypto";

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

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "cherkshina720@gmail.com";

// ===================== DOCS (versions + texts) =====================
const DOC_VERSIONS = {
  consent_pd: "pd_v1_2026-01-17",
  consent_third: "third_v1_2026-01-17",
  privacy: "privacy_v1_2026-01-17",
  payments: "pay_v1_2026-01-17",
};

const CONSENT_PD_TEXT = `Согласие на обработку персональных данных

Нажимая кнопку «Принять», я свободно, своей волей и в своём интересе даю согласие самозанятой Черкашиной Елене Игоревне, ИНН 250808906795 (далее — Оператор), на обработку моих персональных данных в соответствии с Федеральным законом № 152-ФЗ «О персональных данных».

Перечень персональных данных:
- имя или псевдоним в мессенджере;
- идентификатор пользователя (user_id);
- сообщения и материалы (включая изображения), передаваемые в чат-бот;
- дата и время обращения;
- технические данные, необходимые для работы сервиса.

Цели обработки:
- обработка обращений пользователя;
- предоставление функционала чат-бота;
- улучшение качества сервиса;
- выполнение требований законодательства Российской Федерации.

Действия с персональными данными:
сбор, запись, систематизация, хранение, уточнение, использование, обезличивание, блокирование и удаление.

Обработка персональных данных осуществляется с использованием средств автоматизации.
Первичный сбор и хранение персональных данных осуществляется на серверах, расположенных на территории Российской Федерации.

Согласие действует с момента его предоставления и может быть отозвано пользователем путём направления обращения Оператору.

Версия: ${DOC_VERSIONS.consent_pd}
`;

const PRIVACY_TEXT = `Политика конфиденциальности

Оператор — самозанятая Черкашина Елене Игоревне, ИНН 250808906795, обеспечивает защиту персональных данных пользователей в соответствии с законодательством Российской Федерации.

Какие данные обрабатываются:
- имя или псевдоним пользователя;
- user_id;
- сообщения и переданные файлы (включая изображения);
- техническая информация, необходимая для функционирования чат-бота.

Цели обработки данных:
- обработка запросов пользователей;
- обеспечение работы чат-бота;
- соблюдение требований законодательства РФ.

Хранение данных:
- первичный сбор и хранение данных осуществляется на территории РФ;
- данные хранятся не дольше, чем это требуется для целей обработки.

Передача данных:
персональные данные могут передаваться третьим лицам только при наличии согласия пользователя либо в случаях, предусмотренных законодательством РФ.

По вопросам, связанным с обработкой персональных данных:
📧 ${SUPPORT_EMAIL}

Версия: ${DOC_VERSIONS.privacy}
`;

const CONSENT_THIRD_TEXT = `Согласие на передачу персональных данных третьим лицам

Я даю согласие самозанятой Черкашиной Елене Игоревне, ИНН 250808906795, на передачу моих персональных данных третьим лицам в целях обработки запросов и обеспечения работы чат-бота.

Передаваемые данные:
- сообщения пользователя;
- изображения и иные материалы, переданные в чат-бот;
- технические идентификаторы, необходимые для обработки запроса.

Получатели данных:
- сервисы обработки и анализа данных;
- API-провайдеры и иные подрядчики, привлекаемые Оператором.

Передача персональных данных осуществляется после первичного сбора на территории Российской Федерации и в минимально необходимом объёме.

Я уведомлён(а), что передача персональных данных может осуществляться за пределы Российской Федерации при соблюдении требований законодательства РФ.

Согласие действует до момента его отзыва.

Версия: ${DOC_VERSIONS.consent_third}
`;

const PAYMENTS_AND_REFUNDS_TEXT = `Правила оплаты и возврата

Оплата услуг чат-бота осуществляется за предоставление доступа к цифровому сервису и его функционалу.

Возврат денежных средств возможен только в случае технической неисправности сервиса, при которой услуга не была оказана полностью по вине Оператора и пользователь не получил оплаченный функционал.

Возврат не производится, если:
- услуга была оказана в полном объёме;
- пользователь недоволен результатом (субъективная оценка);
- ошибка вызвана действиями пользователя (неподходящее фото, отказ от согласий и т.п.).

Порядок обращения:
1) Нажмите «⚠️ Сообщить об ошибке» в главном меню и опишите проблему.
2) Мы рассмотрим обращение и при подтверждении технической неисправности примем решение о возврате.

Сроки:
- рассмотрение обращения — до 10 календарных дней;
- возврат — в сроки платёжной системы.

Ограничение ответственности (корректно):
Результаты формируются автоматически и носят рекомендательный/информационный характер. Оператор несёт ответственность за доступность и техническую работоспособность сервиса, но не гарантирует соответствие результата индивидуальным ожиданиям.

Версия: ${DOC_VERSIONS.payments}
`;

// ===================== UI TEXTS =====================
function requirementsText() {
  return (
    "Требования к фото для точного анализа:\n" +
    "• лицо анфас (прямо в камеру)\n" +
    "• хороший ровный свет, без сильных теней\n" +
    "• без фильтров/масок\n" +
    "• видны линия роста волос и контуры лица\n\n" +
    "После фото я сделаю анализ и предложу варианты."
  );
}

const TARIFFS_TEXT = `📌 *Тарифы и что входит*

*FREE*  
• Базовый разбор (демо)  
• Без обработки фото после оплаты/согласий

*PRO*  
• Расширенный разбор  
• Доступ к анализу по фото

*PREMIUM*  
• Максимально подробный разбор  
• Доступ к анализу по фото

Нажмите кнопку ниже, чтобы выбрать тариф.`;

const CONSENT_SCREEN_TEXT = `Для продолжения мне нужно ваше согласие:
1) на обработку персональных данных
2) на передачу данных подрядчикам (сервисы обработки/анализа) для работы чат-бота

Нажимая «Принять и продолжить», вы принимаете оба согласия.`;

// ===================== STATE (MVP in-memory) =====================
// Для продакшена лучше перенести в БД.
const userState = new Map(); // userId -> state

function defaultState() {
  return {
    step: "idle",
    plan: null, // free|pro|premium
    paid: false,
    deleted: false,

    consentPd: false,
    consentThird: false,
    consentPdAt: null,
    consentThirdAt: null,
    consentPdVersion: null,
    consentThirdVersion: null,
    consentPdHash: null,
    consentThirdHash: null,

    lastPhotoMeta: null,
  };
}
function getState(userId) {
  return userState.get(userId) || defaultState();
}
function setState(userId, patch) {
  userState.set(userId, { ...getState(userId), ...patch });
}
function resetUserData(userId) {
  // логически "удаление данных"
  userState.set(userId, defaultState());
  setState(userId, { deleted: true });
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// ===================== BOT UI (keyboards) =====================
function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("▶️ Начать / Выбрать тариф", "MENU_START")],
    [Markup.button.callback("📌 Тарифы и что входит", "MENU_TARIFFS")],
    [Markup.button.callback("💳 Правила оплаты и возврата", "MENU_PAYMENTS")],
    [Markup.button.callback("⚠️ Сообщить об ошибке", "MENU_ERROR")],
    [Markup.button.callback("🔒 Политика конфиденциальности", "MENU_PRIVACY")],
    [Markup.button.callback("🗑 Удалить персональные данные", "MENU_DELETE")],
    [Markup.button.callback("🆘 Поддержка", "MENU_SUPPORT")],
  ]);
}

function backToMenuKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback("⬅️ В главное меню", "MENU_HOME")]]);
}

function tariffsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("FREE", "TARIFF_free")],
    [Markup.button.callback("PRO", "TARIFF_pro")],
    [Markup.button.callback("PREMIUM", "TARIFF_premium")],
    [Markup.button.callback("⬅️ В главное меню", "MENU_HOME")],
  ]);
}

function consentsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Принять и продолжить", "CONSENT_ACCEPT_ALL")],
    [Markup.button.callback("📄 Политика конфиденциальности", "MENU_PRIVACY")],
    [Markup.button.callback("📄 Согласие на обработку ПДн", "DOC_CONSENT_PD")],
    [Markup.button.callback("📄 Согласие на передачу третьим лицам", "DOC_CONSENT_THIRD")],
    [Markup.button.callback("❌ Отказаться", "CONSENT_DECLINE")],
    [Markup.button.callback("⬅️ В главное меню", "MENU_HOME")],
  ]);
}

function deleteStep1Keyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🗑 Удалить мои данные", "DELETE_STEP1")],
    [Markup.button.callback("❌ Отмена", "MENU_HOME")],
  ]);
}

function deleteStep2Keyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🔥 Подтвердить удаление", "DELETE_CONFIRM")],
    [Markup.button.callback("❌ Отмена", "MENU_HOME")],
  ]);
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
    tips.push("Отправь фото из галереи оригиналом (без пересжатия).");
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
  return `data:image/jpeg;base64,${b64}`;
}

// ===================== OPENAI VISION ANALYSIS =====================
async function analyzeWithOpenAI({ imageDataUrl, plan }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing (Render Environment).");
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  // PRO/PREMIUM тут одинаково по логике, но ты можешь расширить промпт/кол-во вариантов
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

// ===================== GUARDS =====================
function canAcceptPhoto(st) {
  return st.paid === true && st.consentPd === true && st.consentThird === true && st.deleted !== true;
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

  // -------- /start -> главное меню --------
  bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // создаём стейт если пустой
    getState(userId); // ensures defaults
    await ctx.reply(
      "Привет! Я HairBot ✂️\n\nВыберите действие в меню ниже:",
      mainMenuKeyboard()
    );
  });

  bot.command("menu", async (ctx) => {
    await ctx.reply("Главное меню:", mainMenuKeyboard());
  });

  // -------- ТЕСТ: отметить оплату (потом заменишь на реальную оплату) --------
  bot.command("pay_ok", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);
    if (!st.plan || st.plan === "free") {
      await ctx.reply("Сначала выберите тариф PRO или PREMIUM в меню.", backToMenuKeyboard());
      return;
    }

    setState(userId, { paid: true, step: "awaiting_consents" });

    await ctx.reply("✅ Оплата подтверждена (тестовый режим). Теперь нужно принять согласия.", {
      parse_mode: "Markdown",
    });
    await ctx.reply(CONSENT_SCREEN_TEXT, { parse_mode: "Markdown", ...consentsKeyboard() });
  });

  // -------- Callback router --------
  bot.on("callback_query", async (ctx) => {
    const userId = ctx.from?.id;
    const data = ctx.callbackQuery?.data;
    if (!userId || !data) return;

    await ctx.answerCbQuery().catch(() => {});

    const st = getState(userId);

    // ===== MENU =====
    if (data === "MENU_HOME") {
      await ctx.reply("Главное меню:", mainMenuKeyboard());
      return;
    }
    if (data === "MENU_START") {
      await ctx.reply(TARIFFS_TEXT, { parse_mode: "Markdown", ...tariffsKeyboard() });
      return;
    }
    if (data === "MENU_TARIFFS") {
      await ctx.reply(TARIFFS_TEXT, { parse_mode: "Markdown", ...backToMenuKeyboard() });
      return;
    }
    if (data === "MENU_PAYMENTS") {
      await ctx.reply(PAYMENTS_AND_REFUNDS_TEXT, { parse_mode: "Markdown", ...backToMenuKeyboard() });
      return;
    }
    if (data === "MENU_PRIVACY") {
      await ctx.reply(PRIVACY_TEXT, { parse_mode: "Markdown", ...backToMenuKeyboard() });
      return;
    }
    if (data === "MENU_SUPPORT") {
      await ctx.reply(
        `🆘 Поддержка\n📧 ${SUPPORT_EMAIL}`,
        { parse_mode: "Markdown", ...backToMenuKeyboard() }
      );
      return;
    }

    // ===== ERROR REPORT =====
    if (data === "MENU_ERROR") {
      setState(userId, { step: "wait_error_text" });
      await ctx.reply(
        "⚠️ *Сообщить об ошибке*\nОпишите, пожалуйста, что произошло. Мы рассмотрим обращение (при тех. неисправности возможно решение по возврату).",
        {
          parse_mode: "Markdown",
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback("⬅️ Отмена", "MENU_HOME")],
          ]).reply_markup,
        }
      );
      return;
    }

    // ===== DELETE DATA =====
    if (data === "MENU_DELETE") {
      await ctx.reply(
        "🗑 *Удаление персональных данных*\n\nЭто действие необратимо.\n\nПосле удаления:\n• история/результаты будут удалены\n• согласия будут отозваны\n• для повторного использования потребуется новое согласие",
        { parse_mode: "Markdown", ...deleteStep1Keyboard() }
      );
      return;
    }
    if (data === "DELETE_STEP1") {
      await ctx.reply(
        "Подтвердите удаление персональных данных. Это действие нельзя отменить.",
        { parse_mode: "Markdown", ...deleteStep2Keyboard() }
      );
      return;
    }
    if (data === "DELETE_CONFIRM") {
      resetUserData(userId);
      await ctx.reply(
        "✅ Ваши персональные данные удалены. Если вы решите воспользоваться сервисом снова — потребуется новое согласие.",
        mainMenuKeyboard()
      );
      return;
    }

    // ===== DOCS =====
    if (data === "DOC_CONSENT_PD") {
      await ctx.reply(CONSENT_PD_TEXT, { parse_mode: "Markdown", ...backToMenuKeyboard() });
      return;
    }
    if (data === "DOC_CONSENT_THIRD") {
      await ctx.reply(CONSENT_THIRD_TEXT, { parse_mode: "Markdown", ...backToMenuKeyboard() });
      return;
    }

    // ===== TARIFF SELECT =====
    if (data.startsWith("TARIFF_")) {
      const plan = data.replace("TARIFF_", "");
      if (!["free", "pro", "premium"].includes(plan)) return;

      // при смене тарифа сбрасываем "оплату" и согласия (чтобы было строго после оплаты)
      setState(userId, {
        plan,
        paid: false,
        consentPd: false,
        consentThird: false,
        consentPdAt: null,
        consentThirdAt: null,
        consentPdVersion: null,
        consentThirdVersion: null,
        consentPdHash: null,
        consentThirdHash: null,
        step: "awaiting_payment",
      });

      if (plan === "free") {
        await ctx.reply(
          "Вы выбрали тариф *FREE*.\n\nДля доступа к анализу по фото нужен PRO или PREMIUM.\nВыберите тариф в меню.",
          { parse_mode: "Markdown", ...backToMenuKeyboard() }
        );
        return;
      }

      await ctx.reply(
        `Вы выбрали тариф *${plan.toUpperCase()}*.\n\nДля продолжения оплатите тариф.\n(Тест: отправьте команду /pay_ok)\n\nПосле оплаты появится окно согласий.`,
        { parse_mode: "Markdown", ...backToMenuKeyboard() }
      );
      return;
    }

    // ===== CONSENTS =====
    if (data === "CONSENT_DECLINE") {
      setState(userId, { step: "awaiting_consents" });
      await ctx.reply(
        "Без согласия я не могу обрабатывать фото и сообщения.\n\nВы можете вернуться в меню или обратиться в поддержку.",
        {
          parse_mode: "Markdown",
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback("🆘 Поддержка", "MENU_SUPPORT")],
            [Markup.button.callback("⬅️ В главное меню", "MENU_HOME")],
          ]).reply_markup,
        }
      );
      return;
    }

    if (data === "CONSENT_ACCEPT_ALL") {
      const st2 = getState(userId);
      if (!st2.paid) {
        await ctx.reply("⚠️ Согласие запрашивается после оплаты. Сначала оплатите тариф.", {
          parse_mode: "Markdown",
          ...backToMenuKeyboard(),
        });
        return;
      }

      const pdHash = sha256(CONSENT_PD_TEXT);
      const thirdHash = sha256(CONSENT_THIRD_TEXT);

      setState(userId, {
        consentPd: true,
        consentThird: true,
        consentPdAt: new Date().toISOString(),
        consentThirdAt: new Date().toISOString(),
        consentPdVersion: DOC_VERSIONS.consent_pd,
        consentThirdVersion: DOC_VERSIONS.consent_third,
        consentPdHash: pdHash,
        consentThirdHash: thirdHash,
        step: "awaiting_photo",
        deleted: false, // если был deleted, теперь начинаем заново
      });

      await ctx.reply(
        "✅ Согласия приняты. Теперь пришлите фото лица.\n\n" + requirementsText(),
        { parse_mode: "Markdown", ...backToMenuKeyboard() }
      );
      return;
    }
  });

  // -------- Text handler: error report capture + help --------
  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);

    if (st.step === "wait_error_text") {
      // TODO: записать в БД error_reports (user_id, text, created_at, plan, paid, lastPhotoMeta)
      setState(userId, { step: "idle" });

      await ctx.reply(
        "✅ Спасибо! Сообщение об ошибке принято. Мы рассмотрим обращение.",
        backToMenuKeyboard()
      );
      return;
    }

    await ctx.reply(
      "Выберите действие в меню 👇",
      mainMenuKeyboard()
    );
  });

  // -------- Photo handler (blocked until paid + consents) --------
  bot.on("photo", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);

    if (!canAcceptPhoto(st)) {
      if (st.deleted) {
        await ctx.reply("Ваши данные были удалены. Начните заново через меню и дайте согласия.", mainMenuKeyboard());
        return;
      }
      if (!st.plan || st.plan === "free") {
        await ctx.reply("Чтобы отправить фото, выберите тариф PRO или PREMIUM.", {
          parse_mode: "Markdown",
          ...tariffsKeyboard(),
        });
        return;
      }
      if (!st.paid) {
        await ctx.reply("Чтобы отправить фото, сначала оплатите тариф. (Тест: /pay_ok)", {
          parse_mode: "Markdown",
          ...backToMenuKeyboard(),
        });
        return;
      }
      await ctx.reply(CONSENT_SCREEN_TEXT, { parse_mode: "Markdown", ...consentsKeyboard() });
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
      step: "analyzing",
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

    await ctx.reply(`Фото отличное ✅ (качество: ${verdict.score}/100)\nНачинаю анализ…`);
    setState(userId, { step: "analyzing" });

    try {
      const filePath = await tgGetFilePath(best.file_id);
      const imageDataUrl = await downloadTelegramFileAsBase64(filePath);

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
        "Не получилось выполнить анализ 😕\nПопробуй ещё раз чуть позже или пришли другое фото.\n\nЕсли ошибка повторяется — нажмите «⚠️ Сообщить об ошибке» в меню.",
        mainMenuKeyboard()
      );
    }
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
