import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fetch from "node-fetch";
import pg from "pg";
import OpenAI from "openai";
import sharp from "sharp";
import PDFDocument from "pdfkit";
import FormData from "form-data";

const { Pool } = pg;

// ================== APP ==================
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) throw new Error("TELEGRAM_TOKEN is missing");

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ================== OPENAI ==================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing");

const OPENAI_MODEL_VISION = process.env.OPENAI_MODEL_VISION || "gpt-4.1-mini";
const OPENAI_MODEL_TEXT = process.env.OPENAI_MODEL_TEXT || "gpt-4.1-mini";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ================== DB ==================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function isFreeUsed(userId) {
  const r = await pool.query("SELECT 1 FROM free_usage WHERE user_id=$1 LIMIT 1", [userId]);
  return r.rowCount > 0;
}

async function markFreeUsed(userId) {
  await pool.query(
    "INSERT INTO free_usage (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [userId]
  );
}

async function saveUserAnalysis(userId, analysisJson, analysisText) {
  await pool.query(
    `
    INSERT INTO user_analysis (user_id, analysis_json, analysis_text, updated_at)
    VALUES ($1, $2::jsonb, $3, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET analysis_json=EXCLUDED.analysis_json, analysis_text=EXCLUDED.analysis_text, updated_at=NOW()
    `,
    [userId, JSON.stringify(analysisJson), analysisText]
  );
}

async function saveUserRecos(userId, recosJson, recosText) {
  await pool.query(
    `
    UPDATE user_analysis
    SET recos_json=$2::jsonb, recos_text=$3, updated_at=NOW()
    WHERE user_id=$1
    `,
    [userId, JSON.stringify(recosJson), recosText]
  );
}

async function getUserAnalysis(userId) {
  const r = await pool.query(
    "SELECT analysis_json, analysis_text, recos_json, recos_text FROM user_analysis WHERE user_id=$1",
    [userId]
  );
  return r.rows[0] || null;
}

async function addAsset(userId, kind, telegram_file_id, meta = {}) {
  await pool.query(
    "INSERT INTO user_assets (user_id, kind, telegram_file_id, meta) VALUES ($1,$2,$3,$4::jsonb)",
    [userId, kind, telegram_file_id || null, JSON.stringify(meta)]
  );
}

async function getPdfCredits(userId) {
  const r = await pool.query(
    "SELECT pdf_credits FROM user_entitlements WHERE user_id=$1",
    [userId]
  );
  return r.rows[0]?.pdf_credits ?? 0;
}

async function consumePdfCredit(userId) {
  // создаём строку если нет, и уменьшаем если > 0
  await pool.query(
    `
    INSERT INTO user_entitlements (user_id, pdf_credits, updated_at)
    VALUES ($1, 0, NOW())
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );

  const r = await pool.query(
    `
    UPDATE user_entitlements
    SET pdf_credits = pdf_credits - 1, updated_at=NOW()
    WHERE user_id=$1 AND pdf_credits > 0
    RETURNING pdf_credits
    `,
    [userId]
  );
  return r.rowCount > 0;
}

// ================== STATE (MVP) ==================
const userState = new Map();
// userId -> { mode, step, userPhotoFileId?, pendingPhoto?, analysisJson?, recosJson?, collageFileId? }

// антидубли
const seenUpdateIds = new Set();
const seenCallbackIds = new Set();

function rememberSet(set, key, ttlMs = 60_000) {
  set.add(key);
  setTimeout(() => set.delete(key), ttlMs).unref?.();
}

function getUserId(update) {
  return update.message?.from?.id || update.callback_query?.from?.id;
}

function setState(userId, next) {
  userState.set(userId, { ...(userState.get(userId) || {}), ...next });
}

function clearState(userId) {
  userState.delete(userId);
}

function isPhotoGoodEnough(photo) {
  if (!photo) return { ok: false, reason: "Фото не найдено." };
  if (photo.width < 640 || photo.height < 640) {
    return { ok: false, reason: "Фото слишком маленькое (нужно хотя бы 640×640)." };
  }
  if (photo.file_size && photo.file_size < 50_000) {
    return { ok: false, reason: "Фото слишком сжато/малый размер файла." };
  }
  return { ok: true };
}

// ================== TG HELPERS ==================
async function tg(method, payload) {
  const resp = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await resp.json().catch(() => ({}));
  if (!json?.ok) console.error("Telegram API error:", method, json);
  return json;
}

async function sendMessage(chatId, text, reply_markup) {
  return tg("sendMessage", { chat_id: chatId, text, reply_markup });
}

async function editMessageText(chatId, messageId, text, reply_markup) {
  const r = await tg("editMessageText", { chat_id: chatId, message_id: messageId, text, reply_markup });
  if (r?.ok === false && (r?.description || "").includes("message is not modified")) return r;
  return r;
}

async function answerCallbackQuery(id, text) {
  try {
    return await tg("answerCallbackQuery", { callback_query_id: id, text, show_alert: false });
  } catch {
    return null;
  }
}

async function sendPhoto(chatId, photo, caption, reply_markup) {
  // photo = telegram file_id OR URL
  return tg("sendPhoto", {
    chat_id: chatId,
    photo,
    caption,
    reply_markup,
  });
}

async function sendDocumentBuffer(chatId, buffer, filename, caption, reply_markup) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  if (reply_markup) form.append("reply_markup", JSON.stringify(reply_markup));
  form.append("document", buffer, { filename });

  const resp = await fetch(`${TELEGRAM_API}/sendDocument`, {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });

  const json = await resp.json().catch(() => ({}));
  if (!json?.ok) console.error("Telegram API error:", "sendDocument", json);
  return json;
}

// ================== UI ==================
const MAIN_MENU_KB = {
  inline_keyboard: [
    [{ text: "Пробный Free", callback_data: "flow_free" }],
    [{ text: "BASIC", callback_data: "flow_basic" }],
    [{ text: "PRO", callback_data: "flow_pro" }],
    [{ text: "PREMIUM", callback_data: "flow_premium" }],
  ],
};

const BACK_KB = {
  inline_keyboard: [[{ text: "🏠 В меню", callback_data: "nav_menu" }]],
};

function kbAfterCollage(mode) {
  // PDF — платно, через кредит
  return {
    inline_keyboard: [
      [{ text: "📄 Собрать PDF (платно)", callback_data: "export_pdf" }],
      [{ text: "🏠 В меню", callback_data: "nav_menu" }],
    ],
  };
}

// сколько образов генерим по тарифу
function imagesCountForMode(mode) {
  // ты можешь поменять правила тут
  if (mode === "free") return 2;
  if (mode === "basic") return 4;
  // PRO / PREMIUM — 6 (по твоему ТЗ 6 в одном изображении)
  return 6;
}

// ================== TELEGRAM FILE DOWNLOAD ==================
async function getTelegramFileUrl(fileId) {
  const r = await tg("getFile", { file_id: fileId });
  const filePath = r?.result?.file_path;
  if (!filePath) throw new Error("getFile failed: no file_path");
  return `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
}

async function downloadAsBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

function bufferToDataUrl(buffer, mime = "image/jpeg") {
  const b64 = buffer.toString("base64");
  return `data:${mime};base64,${b64}`;
}

// ================== OPENAI: ANALYSIS + RECOS ==================
function buildAnalysisPrompt() {
  return `
Ты — эксперт по подбору стрижек по форме лица и визуальному балансу.
Проанализируй лицо на фото (анфас) и верни ТОЛЬКО валидный JSON без пояснений.

Схема JSON:
{
  "face_shape_primary": "oval|round|square|rectangle(oblong)|heart|diamond|triangle(pear)",
  "face_shape_secondary": "oval|round|square|rectangle(oblong)|heart|diamond|triangle(pear)|none",
  "face_length_ratio": "short|balanced|long",
  "forehead_width_vs_jaw": "wider|equal|narrower",
  "cheekbones_prominence": "low|medium|high",
  "jawline_angle": "soft|medium|sharp",
  "chin_shape": "rounded|pointed|square",
  "face_contour_softness": "soft|balanced|angular",
  "feature_scale": "delicate|medium|bold",
  "dominant_zone": "forehead|eyes|midface|jaw|balanced",
  "neck_length": "short|medium|long",
  "confidence": 0.0,
  "plain_language_summary_ru": "2-4 предложения простым языком: что заметно и что важно балансировать стрижкой."
}

Правила:
- Если не уверен(а), ставь confidence ниже и выбирай наиболее вероятное.
- Не выдумывай детали, которых не видно.
`.trim();
}

async function analyzeFaceWithOpenAIFromTelegramFileId(fileId) {
  const fileUrl = await getTelegramFileUrl(fileId);
  const buf = await downloadAsBuffer(fileUrl);
  const dataUrl = bufferToDataUrl(buf, "image/jpeg");

  const resp = await openai.responses.create({
    model: OPENAI_MODEL_VISION,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: buildAnalysisPrompt() },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
    max_output_tokens: 900,
  });

  const text = resp.output_text || "";
  if (!text) throw new Error("OpenAI returned empty output_text");

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}$/);
    if (!m) throw new Error("Failed to parse JSON from OpenAI response");
    json = JSON.parse(m[0]);
  }
  return { json };
}

function formatAnalysisForUser(json) {
  const lines = [];
  if (json?.plain_language_summary_ru) lines.push(json.plain_language_summary_ru);

  lines.push("");
  lines.push("📌 Ключевые параметры:");
  lines.push(`• Основная форма: ${json.face_shape_primary}`);
  lines.push(`• Пропорции (длина/ширина): ${json.face_length_ratio}`);
  lines.push(`• Лоб vs челюсть: ${json.forehead_width_vs_jaw}`);
  lines.push(`• Скулы: ${json.cheekbones_prominence}`);
  lines.push(`• Челюсть: ${json.jawline_angle}`);
  lines.push(`• Подбородок: ${json.chin_shape}`);
  lines.push(`• Контур: ${json.face_contour_softness}`);
  lines.push(`• Черты: ${json.feature_scale}`);
  lines.push(`• Доминанта: ${json.dominant_zone}`);
  lines.push(`• Шея: ${json.neck_length}`);

  return lines.join("\n");
}

function buildRecosPrompt(analysisJson, n) {
  return `
Ты — стилист по волосам. На входе JSON-анализ лица.
Сгенерируй ${n} вариантов стрижек/укладок, которые визуально балансируют пропорции и выглядят современно (ориентация на тренды 2026, но без конкретных брендов).

Верни ТОЛЬКО JSON:
{
  "recos_plain_ru": "короткий абзац (3-6 предложений), что лучше избегать и что выбирать",
  "items": [
    {
      "title_ru": "Название варианта (коротко)",
      "why_ru": "1-2 предложения почему подходит именно под эти пропорции",
      "prompt_en": "A clean, photorealistic headshot of a woman with ... (haircut description). Neutral background. Studio lighting. No text.",
      "length": "short|medium|long"
    }
  ]
}

Важное:
- prompt_en должен быть достаточно подробным для генерации изображения (форма, длина, челка, слои, пробор, текстура).
- Никаких номеров файлов, никаких markdown — только JSON.
- Не упоминай политика/знаменитостей.
`.trim() + "\n\nANALYSIS_JSON:\n" + JSON.stringify(analysisJson);
}

async function generateHairRecos(analysisJson, n) {
  const resp = await openai.responses.create({
    model: OPENAI_MODEL_TEXT,
    input: buildRecosPrompt(analysisJson, n),
    max_output_tokens: 900,
  });

  const text = resp.output_text || "";
  if (!text) throw new Error("OpenAI returned empty recos");

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}$/);
    if (!m) throw new Error("Failed to parse recos JSON");
    json = JSON.parse(m[0]);
  }
  return { json };
}

function formatRecosForUser(recosJson) {
  const lines = [];
  if (recosJson?.recos_plain_ru) lines.push("✂️ Рекомендации:", recosJson.recos_plain_ru, "");

  const items = Array.isArray(recosJson?.items) ? recosJson.items : [];
  items.forEach((it, idx) => {
    lines.push(`${idx + 1}) ${it.title_ru}`);
    lines.push(`— ${it.why_ru}`);
    lines.push("");
  });

  return lines.join("\n").trim();
}

// ================== OPENAI: IMAGES ==================
async function generateImageBufferFromPrompt(prompt) {
  // Images API: генерим, получаем base64 (часто приходит b64_json)
  const r = await openai.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt,
    size: "1024x1024",
  });

  const b64 = r?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No b64_json in image response");
  return Buffer.from(b64, "base64");
}

async function makeCollage2x3(buffers) {
  // ожидаем 6 картинок 1024x1024
  const cell = 512; // уменьшаем для итогового размера 1536x1024
  const cols = 3;
  const rows = 2;

  const resized = await Promise.all(
    buffers.slice(0, 6).map((b) => sharp(b).resize(cell, cell).toBuffer())
  );

  const width = cols * cell;   // 1536
  const height = rows * cell;  // 1024

  const composites = resized.map((b, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    return { input: b, left: x, top: y };
  });

  const out = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();

  return out;
}

// ================== PDF EXPORT ==================
async function makePdfFromImages({ collageBuffer, title = "HAIRbot Report" }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.addPage({ size: "A4", margin: 36 });
    doc.fontSize(18).text(title, { align: "center" });
    doc.moveDown(1);

    // вставляем коллаж по ширине
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.image(collageBuffer, doc.page.margins.left, doc.y, { fit: [pageWidth, 520], align: "center" });

    doc.end();
  });
}

// ================== FLOWS ==================
async function runFullAnalysisAndRecos(userId, chatId, fileId, mode) {
  // 1) Анализ
  const { json: analysisJson } = await analyzeFaceWithOpenAIFromTelegramFileId(fileId);
  const analysisText = formatAnalysisForUser(analysisJson);

  setState(userId, { analysisJson });
  await saveUserAnalysis(userId, analysisJson, analysisText);
  await sendMessage(chatId, analysisText, BACK_KB);

  // 2) Рекомендации текстом
  const n = imagesCountForMode(mode);
  const { json: recosJson } = await generateHairRecos(analysisJson, n);
  const recosText = formatRecosForUser(recosJson);

  setState(userId, { recosJson });
  await saveUserRecos(userId, recosJson, recosText);
  await sendMessage(chatId, recosText, BACK_KB);

  // 3) Предложение сгенерировать изображения
  await sendMessage(chatId, `Готово. Сгенерировать ${n} визуальных вариантов и собрать в 1 картинку?`, {
    inline_keyboard: [
      [{ text: `🎨 Сгенерировать ${n} и собрать 1/1`, callback_data: "gen_collage" }],
      [{ text: "🏠 В меню", callback_data: "nav_menu" }],
    ],
  });
}

async function generateAndSendCollage(userId, chatId) {
  const st = userState.get(userId);
  const mode = st?.mode || "pro";

  // Берём рекомендации из state, если нет — из БД
  let recosJson = st?.recosJson;
  let analysis = st?.analysisJson;

  if (!recosJson || !analysis) {
    const db = await getUserAnalysis(userId);
    if (!db) throw new Error("No analysis in DB");
    analysis = db.analysis_json;
    recosJson = db.recos_json;
  }

  const n = imagesCountForMode(mode);
  const items = Array.isArray(recosJson?.items) ? recosJson.items : [];
  const prompts = items.slice(0, n).map((it) => it.prompt_en).filter(Boolean);

  if (prompts.length < n) throw new Error("Not enough prompts to generate images");

  await sendMessage(chatId, "🎨 Генерирую изображения…", BACK_KB);

  const buffers = [];
  for (let i = 0; i < prompts.length; i++) {
    const buf = await generateImageBufferFromPrompt(prompts[i]);
    buffers.push(buf);
    await sendMessage(chatId, `Готово: ${i + 1}/${prompts.length}`, BACK_KB);
  }

  // Если n < 6 — коллаж делаем из n (2 -> 1x2? 4 -> 2x2?), но ты просила именно 6 в одном.
  // Поэтому: для PRO/PREMIUM (n=6) собираем 2x3; для остальных — отправим просто первые n как фото-альбомом (проще).
  if (n === 6) {
    const collage = await makeCollage2x3(buffers);

    // Отправляем как фото: Telegram вернёт file_id, сохраним
    const r = await sendPhoto(chatId, "attach://collage", "Твои 6 вариантов (1 изображение):", kbAfterCollage(mode));
    // sendPhoto не поддерживает attach в JSON-режиме, поэтому сделаем через sendDocumentBuffer? — нет, это фото.
    // Чтобы не усложнять multipart для фото: отправим как документ (картинка) — Telegram всё равно покажет и даст file_id.
    // Поэтому отправим collage как документ с .jpg:
    const docResp = await sendDocumentBuffer(chatId, collage, "hair_variants_collage.jpg", "Твои 6 вариантов (1 изображение):", kbAfterCollage(mode));
    const fileId =
      docResp?.result?.document?.file_id ||
      docResp?.result?.photo?.[docResp?.result?.photo?.length - 1]?.file_id ||
      null;

    setState(userId, { collageFileId: fileId });
    await addAsset(userId, "collage", fileId, { count: 6 });

    return;
  }

  // Для free/basic: отправим по одному как документ (чтобы не делать сложную раскладку сейчас)
  for (let i = 0; i < buffers.length; i++) {
    await sendDocumentBuffer(chatId, buffers[i], `hair_variant_${i + 1}.jpg`, `Вариант #${i + 1}`, BACK_KB);
  }

  await sendMessage(chatId, "Если хочешь 6 в одном изображении — это в PRO/PREMIUM.", BACK_KB);
}

async function exportPdfIfEntitled(userId, chatId) {
  const credits = await getPdfCredits(userId);
  if (credits <= 0) {
    await sendMessage(
      chatId,
      "📄 Экспорт в PDF — платная опция. Сейчас у тебя 0 PDF-кредитов.\n\nПодключи оплату: после покупки мы увеличим pdf_credits в таблице user_entitlements.",
      BACK_KB
    );
    return;
  }

  const consumed = await consumePdfCredit(userId);
  if (!consumed) {
    await sendMessage(chatId, "Не удалось списать PDF-кредит. Попробуй ещё раз.", BACK_KB);
    return;
  }

  // Берём последний коллаж из state (или из БД через assets)
  const st = userState.get(userId);
  const collageFileId = st?.collageFileId;

  if (!collageFileId) {
    await sendMessage(chatId, "Сначала сгенерируй коллаж (6 в 1), затем я соберу PDF.", BACK_KB);
    return;
  }

  await sendMessage(chatId, "📄 Собираю PDF…", BACK_KB);

  const url = await getTelegramFileUrl(collageFileId);
  const collageBuffer = await downloadAsBuffer(url);

  const pdfBuffer = await makePdfFromImages({
    collageBuffer,
    title: "HAIRbot — подбор стрижек",
  });

  const resp = await sendDocumentBuffer(chatId, pdfBuffer, "hairbot_report.pdf", "Готово ✅", BACK_KB);
  const pdfFileId = resp?.result?.document?.file_id || null;
  await addAsset(userId, "pdf", pdfFileId, { from: "collage" });
}

// ================== PHOTO PROCESS ==================
async function processUserPhoto({ userId, chatId, photo }) {
  const st = userState.get(userId);

  if (!st || !st.step) {
    setState(userId, { pendingPhoto: photo });
    await sendMessage(
      chatId,
      "Фото получено. Сначала выбери тариф — я использую это фото автоматически.",
      MAIN_MENU_KB
    );
    return;
  }

  const q = isPhotoGoodEnough(photo);
  if (!q.ok) {
    await sendMessage(chatId, q.reason, BACK_KB);
    return;
  }

  if (st.step === "await_user_photo") {
    setState(userId, { userPhotoFileId: photo.file_id, pendingPhoto: null, step: "analyzing" });
    await sendMessage(chatId, "Понял. Анализирую лицо по фото…", BACK_KB);

    try {
      // ВАЖНО: free помечаем после успешного анализа
      await runFullAnalysisAndRecos(userId, chatId, photo.file_id, st.mode);

      if (st.mode === "free") await markFreeUsed(userId);

      setState(userId, { step: "analysis_done" });
    } catch (err) {
      console.error("analysis pipeline error:", err);
      setState(userId, { step: "await_user_photo" });
      await sendMessage(
        chatId,
        "Не получилось сделать анализ 😕 Попробуй другое фото (анфас, дневной свет, без сильных фильтров).",
        BACK_KB
      );
    }
    return;
  }

  await sendMessage(chatId, "Фото получено, но сейчас я его не ждал. Нажми «В меню».", BACK_KB);
}

// ================== UPDATE HANDLER ==================
async function handleUpdate(update) {
  if (typeof update.update_id === "number") {
    if (seenUpdateIds.has(update.update_id)) return;
    rememberSet(seenUpdateIds, update.update_id, 60_000);
  }

  if (update.message?.text === "/start") {
    const userId = update.message.from.id;
    clearState(userId);
    await sendMessage(update.message.chat.id, "Выбери тариф:", MAIN_MENU_KB);
    return;
  }

  if (update.message?.photo?.length) {
    const userId = getUserId(update);
    const chatId = update.message.chat.id;
    const photo = update.message.photo[update.message.photo.length - 1];
    await processUserPhoto({ userId, chatId, photo });
    return;
  }

  if (update.callback_query) {
    const cq = update.callback_query;
    if (seenCallbackIds.has(cq.id)) return;
    rememberSet(seenCallbackIds, cq.id, 60_000);

    const userId = cq.from.id;
    const chatId = cq.message.chat.id;
    const msgId = cq.message.message_id;
    const data = cq.data;

    await answerCallbackQuery(cq.id).catch(() => {});

    if (data === "nav_menu") {
      await editMessageText(chatId, msgId, "Выбери тариф:", MAIN_MENU_KB);
      return;
    }

    if (data.startsWith("flow_")) {
      const mode = data.replace("flow_", "");

      if (mode === "free") {
        const used = await isFreeUsed(userId);
        if (used) {
          await editMessageText(chatId, msgId, "Free уже использован.", MAIN_MENU_KB);
          return;
        }
      }

      const prev = userState.get(userId);
      const pending = prev?.pendingPhoto;

      userState.set(userId, { mode, step: "await_user_photo", pendingPhoto: pending || null });

      if (pending) {
        await editMessageText(chatId, msgId, "Использую уже загруженное фото.", BACK_KB);
        await processUserPhoto({ userId, chatId, photo: pending });
        return;
      }

      await editMessageText(chatId, msgId, "Пришли фото лица анфас.", BACK_KB);
      return;
    }

    if (data === "gen_collage") {
      try {
        await generateAndSendCollage(userId, chatId);
      } catch (err) {
        console.error("gen_collage error:", err);
        await sendMessage(chatId, "Не получилось сгенерировать. Попробуй позже.", BACK_KB);
      }
      return;
    }

    if (data === "export_pdf") {
      try {
        await exportPdfIfEntitled(userId, chatId);
      } catch (err) {
        console.error("export_pdf error:", err);
        await sendMessage(chatId, "Не удалось собрать PDF. Попробуй позже.", BACK_KB);
      }
      return;
    }

    await sendMessage(chatId, "Не понял команду. Нажми «В меню».", BACK_KB);
    return;
  }
}

// ================== WEBHOOK ==================
app.post("/webhook", (req, res) => {
  res.sendStatus(200);
  handleUpdate(req.body).catch((err) => console.error("handleUpdate error:", err));
});

// ================== START ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`HAIRbot running on port ${PORT}`);
});

