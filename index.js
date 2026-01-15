import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fetch from "node-fetch";
import pg from "pg";

const { Pool } = pg;

// ================== APP ==================
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) throw new Error("TELEGRAM_TOKEN is missing");

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ================== DB ==================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// таблица:
// CREATE TABLE IF NOT EXISTS free_usage (
//   user_id BIGINT PRIMARY KEY,
//   used_at TIMESTAMP DEFAULT NOW()
// );

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

// ================== STATE (MVP) ==================
const userState = new Map();
// userId -> { mode, step, userPhotoFileId?, refPhotoFileId?, credits?, pendingPhoto? }

// антидубли (важно на webhook)
const seenUpdateIds = new Set();     // update_id -> TTL
const seenCallbackIds = new Set();   // callback_query.id -> TTL

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
  if (photo.width < 640 || photo.height < 640) return { ok: false, reason: "Фото слишком маленькое (нужно хотя бы 640x640)." };
  if (photo.file_size && photo.file_size < 50_000) return { ok: false, reason: "Фото слишком сжато/малый размер файла." };
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

  // Не роняем бота на telegram 400, но логируем
  if (!json?.ok) {
    console.error("Telegram API error:", method, json);
  }
  return json;
}

async function sendMessage(chatId, text, reply_markup) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup,
  });
}

async function editMessageText(chatId, messageId, text, reply_markup) {
  const r = await tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup,
  });

  // Игнорируем типичную ошибку "не изменено"
  if (r?.ok === false && (r?.description || "").includes("message is not modified")) {
    return r;
  }
  return r;
}

async function answerCallbackQuery(id, text) {
  // Важно: callback может "протухнуть" — это норм, просто игнорим
  try {
    return await tg("answerCallbackQuery", {
      callback_query_id: id,
      text,
      show_alert: false,
    });
  } catch {
    return null;
  }
}

// ================== UI ==================
const MAIN_MENU_KB = {
  inline_keyboard: [
    [{ text: "Пробный Free", callback_data: "flow_free" }],
    [{ text: "BASIC", callback_data: "flow_basic" }],
    [{ text: "PRO", callback_data: "flow_pro" }],
    [{ text: "PREMIUM", callback_data: "flow_premium" }],
    [{ text: "COLOR REF 5", callback_data: "flow_colorref5" }],
    [{ text: "COLOR REF 10", callback_data: "flow_colorref10" }],
  ],
};

const BACK_KB = {
  inline_keyboard: [[{ text: "🏠 В меню", callback_data: "nav_menu" }]],
};

// ================== PHOTO PROCESS ==================
async function processUserPhoto({ userId, chatId, photo }) {
  const st = userState.get(userId);

  // Если тариф ещё не выбран — сохраняем pending и просим выбрать тариф
  if (!st || !st.step) {
    setState(userId, { pendingPhoto: photo });
    await sendMessage(
      chatId,
      "Фото получено. Сначала выбери тариф — я использую это фото автоматически.",
      MAIN_MENU_KB
    );
    return;
  }

  // Проверяем качество фото
  const q = isPhotoGoodEnough(photo);
  if (!q.ok) {
    await sendMessage(chatId, q.reason, BACK_KB);
    return;
  }

  // Шаг 1: фото пользователя для анализа
  if (st.step === "await_user_photo") {
    setState(userId, {
      userPhotoFileId: photo.file_id,
      pendingPhoto: null,
      step: "analysis_done",
    });

    await sendMessage(chatId, "Делаю анализ…");

    if (st.mode === "free") {
      await markFreeUsed(userId);
    }

    const n = st.mode === "free" ? 2 : 4;

    await sendMessage(chatId, "Анализ готов. Показать варианты?", {
      inline_keyboard: [
        [{ text: `Показать ${n}`, callback_data: `gen_hair_${st.mode}` }],
        [{ text: "🏠 В меню", callback_data: "nav_menu" }],
      ],
    });

    return;
  }

  // Шаг 2: референс для цвета
  if (st.step === "await_ref_photo") {
    setState(userId, { refPhotoFileId: photo.file_id, step: "ref_ready" });

    await sendMessage(chatId, "Референс принят.", {
      inline_keyboard: [
        [{ text: "Применить цвет", callback_data: "apply_ref_color" }],
        [{ text: "🏠 В меню", callback_data: "nav_menu" }],
      ],
    });

    return;
  }

  // Если фото прислали "не вовремя"
  await sendMessage(chatId, "Фото получено, но сейчас я его не ждал. Нажми «В меню».", BACK_KB);
}

// ================== UPDATE HANDLER ==================
async function handleUpdate(update) {
  // антидубль по update_id
  if (typeof update.update_id === "number") {
    if (seenUpdateIds.has(update.update_id)) return;
    rememberSet(seenUpdateIds, update.update_id, 60_000);
  }

  // /start
  if (update.message?.text === "/start") {
    const userId = update.message.from.id;
    clearState(userId);
    await sendMessage(update.message.chat.id, "Выбери тариф:", MAIN_MENU_KB);
    return;
  }

  // photo
  if (update.message?.photo?.length) {
    const userId = getUserId(update);
    const chatId = update.message.chat.id;
    const photo = update.message.photo[update.message.photo.length - 1];
    await processUserPhoto({ userId, chatId, photo });
    return;
  }

  // callbacks
  if (update.callback_query) {
    const cq = update.callback_query;

    // антидубль по callback id
    if (seenCallbackIds.has(cq.id)) return;
    rememberSet(seenCallbackIds, cq.id, 60_000);

    const userId = cq.from.id;
    const chatId = cq.message.chat.id;
    const msgId = cq.message.message_id;
    const data = cq.data;

    // ⚡️ отвечаем мгновенно
    await answerCallbackQuery(cq.id).catch(() => {});

    if (data === "nav_menu") {
      await editMessageText(chatId, msgId, "Выбери тариф:", MAIN_MENU_KB);
      return;
    }

    if (data.startsWith("flow_")) {
      const mode = data.replace("flow_", "");

      // Free: проверяем лимит и прекращаем, если использован
      if (mode === "free") {
        const used = await isFreeUsed(userId);
        if (used) {
          await editMessageText(chatId, msgId, "Free уже использован.", MAIN_MENU_KB);
          return;
        }
      }

      const prev = userState.get(userId);
      const pending = prev?.pendingPhoto;

      const base = {
        mode,
        step: "await_user_photo",
        pendingPhoto: pending || null,
      };

      if (mode === "colorref5") base.credits = 5;
      if (mode === "colorref10") base.credits = 10;

      userState.set(userId, base);

      if (pending) {
        await editMessageText(chatId, msgId, "Использую уже загруженное фото.", BACK_KB);
        await processUserPhoto({ userId, chatId, photo: pending });
        return;
      }

      await editMessageText(chatId, msgId, "Пришли фото лица анфас.", BACK_KB);
      return;
    }

    if (data.startsWith("gen_hair_")) {
      const n = data.endsWith("free") ? 2 : 4;
      await sendMessage(chatId, `Генерация (${n}) — заглушка`, BACK_KB);
      return;
    }

    if (data === "apply_ref_color") {
      await sendMessage(chatId, "Примерка цвета — заглушка", BACK_KB);
      return;
    }

    // неизвестный callback
    await sendMessage(chatId, "Не понял команду. Нажми «В меню».", BACK_KB);
    return;
  }
}

// ================== WEBHOOK ==================
app.post("/webhook", (req, res) => {
  const update = req.body;

  // ⚡️ мгновенный ответ Telegram
  res.sendStatus(200);

  // обработка — асинхронно, чтобы Telegram не ретраил
  handleUpdate(update).catch((err) => {
    console.error("handleUpdate error:", err);
  });
});

// ================== START ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`HAIRbot running on port ${PORT}`);
});
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Bot running on port", PORT);
});
