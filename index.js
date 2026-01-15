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
  const r = await pool.query(
    "SELECT 1 FROM free_usage WHERE user_id=$1 LIMIT 1",
    [userId]
  );
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
  if (photo.width < 640 || photo.height < 640) return { ok: false, reason: "Фото слишком маленькое." };
  if (photo.file_size && photo.file_size < 50_000) return { ok: false, reason: "Фото слишком сжато." };
  return { ok: true };
}

// ================== TG HELPERS ==================
async function tg(method, payload) {
  return fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(r => r.json());
}

const sendMessage = (chatId, text, reply_markup) =>
  tg("sendMessage", { chat_id: chatId, text, reply_markup });

const editMessageText = (chatId, messageId, text, reply_markup) =>
  tg("editMessageText", { chat_id: chatId, message_id: messageId, text, reply_markup });

const answerCallbackQuery = (id) =>
  tg("answerCallbackQuery", { callback_query_id: id });

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

const BACK_KB = { inline_keyboard: [[{ text: "🏠 В меню", callback_data: "nav_menu" }]] };

// ================== PHOTO PROCESS ==================
async function processUserPhoto({ userId, chatId, photo }) {
  const st = userState.get(userId);

  if (!st || !st.step) {
    setState(userId, { pendingPhoto: photo });
    sendMessage(
      chatId,
      "Фото получено. Сначала выбери тариф — я использую это фото автоматически.",
      MAIN_MENU_KB
    );
    return;
  }

  const q = isPhotoGoodEnough(photo);
  if (!q.ok) {
    sendMessage(chatId, q.reason, BACK_KB);
    return;
  }

  if (st.step === "await_user_photo") {
    setState(userId, {
      userPhotoFileId: photo.file_id,
      pendingPhoto: null,
      step: "analysis_done",
    });

    sendMessage(chatId, "Делаю анализ…");

    if (st.mode === "free") await markFreeUsed(userId);

    const n = st.mode === "free" ? 2 : 4;
    sendMessage(chatId, "Анализ готов. Показать варианты?", {
      inline_keyboard: [
        [{ text: `Показать ${n}`, callback_data: `gen_hair_${st.mode}` }],
        [{ text: "🏠 В меню", callback_data: "nav_menu" }],
      ],
    });
  }

  if (st.step === "await_ref_photo") {
    setState(userId, { refPhotoFileId: photo.file_id, step: "ref_ready" });
    sendMessage(chatId, "Референс принят.", {
      inline_keyboard: [
        [{ text: "Применить цвет", callback_data: "apply_ref_color" }],
        [{ text: "🏠 В меню", callback_data: "nav_menu" }],
      ],
    });
  }
}

// ================== WEBHOOK ==================
app.post("/webhook", (req, res) => {
  const update = req.body;
  res.sendStatus(200); // ⚡️ мгновенный ответ Telegram

  // /start
  if (update.message?.text === "/start") {
    const userId = update.message.from.id;
    clearState(userId);
    sendMessage(update.message.chat.id, "Выбери тариф:", MAIN_MENU_KB);
    return;
  }

  // photo
  if (update.message?.photo?.length) {
    const userId = getUserId(update);
    const chatId = update.message.chat.id;
    const photo = update.message.photo.at(-1);
    setImmediate(() =>
      processUserPhoto({ userId, chatId, photo }).catch(console.error)
    );
    return;
  }

  // callbacks
  if (update.callback_query) {
    const cq = update.callback_query;
    const userId = cq.from.id;
    const chatId = cq.message.chat.id;
    const msgId = cq.message.message_id;
    const data = cq.data;

    answerCallbackQuery(cq.id);

    if (data === "nav_menu") {
      editMessageText(chatId, msgId, "Выбери тариф:", MAIN_MENU_KB);
      return;
    }

    if (data.startsWith("flow_")) {
      const mode = data.replace("flow_", "");

      if (mode === "free") {
        isFreeUsed(userId).then((used) => {
          if (used) {
            editMessageText(chatId, msgId, "Free уже использован.", MAIN_MENU_KB);
            return;
          }
        });
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
        editMessageText(chatId, msgId, "Использую уже загруженное фото.", BACK_KB);
        setImmediate(() =>
          processUserPhoto({ userId, chatId, photo: pending }).catch(console.error)
        );
        return;
      }

      editMessageText(chatId, msgId, "Пришли фото лица анфас.", BACK_KB);
      return;
    }

    if (data.startsWith("gen_hair_")) {
      const n = data.endsWith("free") ? 2 : 4;
      sendMessage(chatId, `Генерация (${n}) — заглушка`, BACK_KB);
      return;
    }

    if (data === "apply_ref_color") {
      sendMessage(chatId, "Примерка цвета — заглушка", BACK_KB);
    }
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("HAIRbot running");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Bot running on port", PORT);
});
