import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) throw new Error("TELEGRAM_TOKEN is missing");

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ---------- Simple in-memory state (MVP) ----------
const userState = new Map(); // userId -> { mode, step, userPhotoFileId?, refPhotoFileId?, credits? }
const freeUsed = new Set(); // userId -> used free once

function getUserId(update) {
  return update.message?.from?.id || update.callback_query?.from?.id;
}

function setState(userId, next) {
  userState.set(userId, { ...(userState.get(userId) || {}), ...next });
}

function isPhotoGoodEnough(photoObj) {
  const w = photoObj.width || 0;
  const h = photoObj.height || 0;
  const size = photoObj.file_size || 0;

  // Conservative thresholds (tweak later)
  if (w < 640 || h < 640) {
    return {
      ok: false,
      reason:
        "Фото слишком маленькое по размеру. Нужна более чёткая фотография (желательно от 640×640 и выше).",
    };
  }
  if (size > 0 && size < 50_000) {
    return {
      ok: false,
      reason:
        "Фото слишком сжато/низкого качества. Попробуй отправить оригинал без сильного сжатия.",
    };
  }
  return { ok: true };
}

// ---------- Telegram helpers ----------
async function tg(method, payload) {
  const r = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!data.ok) {
    console.error("Telegram API error:", method, data);
  }
  return data;
}

async function sendMessage(chatId, text, replyMarkup) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
  });
}

async function editMessageText(chatId, messageId, text, replyMarkup) {
  return tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: replyMarkup,
  });
}

async function answerCallbackQuery(callbackQueryId) {
  return tg("answerCallbackQuery", { callback_query_id: callbackQueryId });
}

// ---------- UI (Main Menu) ----------
const MAIN_MENU_TEXT =
  "🏠 Главное меню HAIRbot\n\n" +
  "HAIRbot — сервис интеллектуального анализа внешности и подбора наиболее удачных решений для волос.\n\n" +
  "Бот анализирует лицо геометрически, учитывая форму (в том числе смешанную), пропорции, динамику черт и индивидуальные особенности внешности.\n" +
  "На основе этого анализа он подбирает оптимальные варианты длины, формы, чёлки, текстуры волос и цветовых решений — так, чтобы подчеркнуть сильные стороны внешности, освежить лицо и сохранить гармонию.\n\n" +
  "🔹 Сервис работает для женской внешности\n" +
  "🔹 Генерации — визуальные иллюстрации к рекомендациям";

const MAIN_MENU_KB = {
  inline_keyboard: [
    [{ text: "Пробный Free", callback_data: "flow_free" }],
    [{ text: "Стрижка + анализ цвета", callback_data: "flow_basic" }],
    [
      {
        text: "Стрижка + анализ цвета + яркие оттенки",
        callback_data: "flow_pro",
      },
    ],
    [{ text: "Полный образ", callback_data: "flow_premium" }],
    [{ text: "5 генераций цвета по референсу", callback_data: "flow_colorref5" }],
    [{ text: "10 генераций цвета по референсу", callback_data: "flow_colorref10" }],
    [
      { text: "💳 Тарифы", callback_data: "info_pricing" },
      { text: "📸 Как сфотографироваться", callback_data: "info_photo" },
    ],
    [{ text: "ℹ️ О сервисе", callback_data: "info_about" }],
  ],
};

const BACK_TO_MENU_KB = {
  inline_keyboard: [[{ text: "🏠 В меню", callback_data: "nav_menu" }]],
};

// ---------- Texts ----------
const ABOUT_TEXT =
  "ℹ️ О сервисе\n\n" +
  "HAIRbot — сервис интеллектуального анализа внешности и подбора наиболее удачных решений для волос.\n\n" +
  "Бот анализирует лицо геометрически, учитывая форму (в том числе смешанную), пропорции, динамику черт и индивидуальные особенности внешности.\n" +
  "На основе этого анализа он подбирает оптимальные варианты длины, формы, чёлки, текстуры волос и цветовых решений — так, чтобы подчеркнуть сильные стороны внешности, освежить лицо и сохранить гармонию.\n\n" +
  "Анализ строится не на шаблонах, а на сочетании параметров:\n" +
  "геометрии лица, полноты, лба, скул, линии челюсти, а также деталей — бровей, губ, носа и ушей (с корректными, мягкими рекомендациями).\n\n" +
  "🎨 Подбор цвета основан на принципах системы Манселла: учитываются температура и тон кожи, природная контрастность и насыщенность внешности.\n" +
  "Сначала предлагаются наиболее гармоничные, естественные оттенки, а затем — яркие трендовые варианты, подобранные строго по цветовой температуре кожи (например, рыжие, cherry и другие акцентные оттенки).\n\n" +
  "🌀 В расширенных тарифах учитываются текстуры волос:\n" +
  "биозавивка (с расчётом коэффициента завитка и визуального укорочения длины) и кератиновое выпрямление — с пояснением, как изменится форма и силуэт у лица.\n\n" +
  "🔹 На текущем этапе сервис работает для женской внешности.\n" +
  "🔹 Генерации изображений используются как визуальные иллюстрации к рекомендациям, чтобы наглядно показать возможные варианты.\n" +
  "Это не сервис случайной генерации картинок, а инструмент визуального сопровождения осознанного подбора.\n\n" +
  "HAIRbot помогает понять, что действительно подойдёт именно вам, ещё до визита в салон — и сделать выбор более уверенно и спокойно.";

const PHOTO_TIPS_TEXT =
  "📸 Как сфотографироваться правильно\n\n" +
  "Чтобы анализ был точным:\n" +
  "• дневной свет у окна\n" +
  "• без фильтров\n" +
  "• анфас, камера на уровне глаз\n" +
  "• волосы убраны от лица (лоб/скулы/челюсть видны)\n" +
  "• лицо целиком в кадре, без обрезаний\n" +
  "• фон простой, фото резкое\n\n" +
  "После этого можно начинать выбранный сценарий из меню.";

const PRICING_TEXT =
  "💳 Тарифы (кратко)\n\n" +
  "✅ FREE — 0 ₽ (1 раз)\n" +
  "• анализ формы/длины/текстуры\n" +
  "• генерация стрижки: 1× (2 варианта) — по кнопке\n\n" +
  "✨ BASIC — 399 ₽\n" +
  "• стрижка: 1× (4 варианта)\n" +
  "• цвет по Манселлу: 1× (4 варианта)\n\n" +
  "🌈 PRO — 899 ₽\n" +
  "• + цвет по Манселлу (4 варианта)\n" +
  "• + яркие оттенки (4 варианта)\n\n" +
  "💎 PREMIUM — 1 590 ₽\n" +
  "• + биозавивка/кератин (по запросу)\n" +
  "• + аксессуары (рекомендации + 4 варианта)\n\n" +
  "🎨 COLOR REF 5 — 499 ₽\n" +
  "• пакет 5 генераций цвета по референсам\n\n" +
  "🎨 COLOR REF 10 — 899 ₽\n" +
  "• пакет 10 генераций цвета по референсам";

// ---------- Webhook ----------
app.post("/webhook", async (req, res) => {
  try {
    const update = req.body;
    console.log("✅ WEBHOOK HIT");

    // /start -> show main menu
    if (update.message?.text === "/start") {
      const chatId = update.message.chat.id;
      await sendMessage(chatId, MAIN_MENU_TEXT, MAIN_MENU_KB);
      return res.sendStatus(200);
    }

    // ---------- Photo handling ----------
    if (update.message?.photo?.length) {
      const userId = getUserId(update);
      const chatId = update.message.chat.id;
      const st = userState.get(userId);

      if (!st || !st.step) {
        await sendMessage(
          chatId,
          "Я получила фото 🙂\n\nЧтобы начать — нажми /start и выбери тариф в меню.",
          MAIN_MENU_KB
        );
        return res.sendStatus(200);
      }

      // pick the largest photo
      const photo = update.message.photo[update.message.photo.length - 1];

      // quality check
      const q = isPhotoGoodEnough(photo);
      if (!q.ok) {
        await sendMessage(
          chatId,
          `⚠️ Фото не подходит.\n${q.reason}\n\nПопробуй отправить другое фото по инструкции.`,
          {
            inline_keyboard: [
              [{ text: "📸 Как сфотографироваться", callback_data: "info_photo" }],
              [{ text: "🏠 В меню", callback_data: "nav_menu" }],
            ],
          }
        );
        return res.sendStatus(200);
      }

      // Step: awaiting user photo
      if (st.step === "await_user_photo") {
        setState(userId, { userPhotoFileId: photo.file_id });

        // Color-ref packages: ask for reference
        if (st.mode === "colorref5" || st.mode === "colorref10") {
          setState(userId, { step: "await_ref_photo" });
          await sendMessage(
            chatId,
            "✅ Отлично! Теперь пришли референс цвета (фото/скрин оттенка, который хочешь примерить).",
            BACK_TO_MENU_KB
          );
          return res.sendStatus(200);
        }

        // Analysis modes:
        if (st.mode === "free") freeUsed.add(userId);
        setState(userId, { step: "analysis_done" });

        await sendMessage(chatId, "✅ Фото принято. Делаю анализ…");

        // Placeholder analysis
        const analysisText =
          "🧠 Результат анализа (пока заглушка)\n\n" +
          "• Форма лица: (подключим AI)\n" +
          "• Рекомендации по длине/силуэту: (подключим AI)\n" +
          "• Рекомендации по текстуре: (подключим AI)\n\n" +
          "Хочешь, покажу визуальные варианты?";

        const genBtnText = st.mode === "free" ? "Показать 2 варианта" : "Показать 4 варианта";

        await sendMessage(chatId, analysisText, {
          inline_keyboard: [
            [{ text: genBtnText, callback_data: `gen_hair_${st.mode}` }],
            [{ text: "🏠 В меню", callback_data: "nav_menu" }],
          ],
        });

        return res.sendStatus(200);
      }

      // Step: awaiting reference photo
      if (st.step === "await_ref_photo") {
        setState(userId, { refPhotoFileId: photo.file_id, step: "ref_ready" });

        await sendMessage(
          chatId,
          "✅ Референс принят.\n\nСгенерировать примерку цвета? (1 генерация спишется из пакета)",
          {
            inline_keyboard: [
              [{ text: "Применить цвет", callback_data: "apply_ref_color" }],
              [{ text: "🏠 В меню", callback_data: "nav_menu" }],
            ],
          }
        );

        return res.sendStatus(200);
      }

      await sendMessage(chatId, "Фото получено. Если хочешь начать заново — нажми /start.");
      return res.sendStatus(200);
    }

    // ---------- Button clicks ----------
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message.chat.id;
      const messageId = cq.message.message_id;
      const data = cq.data;
      const userId = cq.from.id;

      await answerCallbackQuery(cq.id);

      // Navigation
      if (data === "nav_menu") {
        await editMessageText(chatId, messageId, MAIN_MENU_TEXT, MAIN_MENU_KB);
        return res.sendStatus(200);
      }

      // Info screens
      if (data === "info_about") {
        await editMessageText(chatId, messageId, ABOUT_TEXT, BACK_TO_MENU_KB);
        return res.sendStatus(200);
      }
      if (data === "info_photo") {
        await editMessageText(chatId, messageId, PHOTO_TIPS_TEXT, BACK_TO_MENU_KB);
        return res.sendStatus(200);
      }
      if (data === "info_pricing") {
        await editMessageText(chatId, messageId, PRICING_TEXT, BACK_TO_MENU_KB);
        return res.sendStatus(200);
      }

      // Start flows
      const startFlow = async (mode) => {
        // Free only once
        if (mode === "free" && freeUsed.has(userId)) {
          await editMessageText(
            chatId,
            messageId,
            "✅ Free уже был использован (он доступен один раз).\n\nОткрой тарифы и выбери платный вариант.",
            {
              inline_keyboard: [
                [{ text: "💳 Тарифы", callback_data: "info_pricing" }],
                [{ text: "🏠 В меню", callback_data: "nav_menu" }],
              ],
            }
          );
          return;
        }

        const base = { mode, step: "await_user_photo", userPhotoFileId: null, refPhotoFileId: null };
        if (mode === "colorref5") base.credits = 5;
        if (mode === "colorref10") base.credits = 10;

        userState.set(userId, base);

        const modeName =
          mode === "free"
            ? "Пробный Free"
            : mode === "basic"
            ? "Стрижка + анализ цвета"
            : mode === "pro"
            ? "Стрижка + анализ цвета + яркие оттенки"
            : mode === "premium"
            ? "Полный образ"
            : mode === "colorref5"
            ? "COLOR REF 5"
            : "COLOR REF 10";

        const extra =
          mode.startsWith("colorref")
            ? `\n\nПосле этого я попрошу референс цвета.\nОсталось генераций в пакете: ${base.credits}`
            : "";

        await editMessageText(
          chatId,
          messageId,
          `✅ Выбран тариф: ${modeName}\n\n` +
            "📸 Теперь пришли фото лица анфас по правилам:\n" +
            "• дневной свет у окна\n" +
            "• без фильтров\n" +
            "• волосы убраны от лица (лоб/скулы/челюсть видны)\n" +
            "• лицо целиком в кадре, фото резкое\n" +
            extra,
          {
            inline_keyboard: [
              [{ text: "📸 Как сфотографироваться", callback_data: "info_photo" }],
              [{ text: "🏠 В меню", callback_data: "nav_menu" }],
            ],
          }
        );
      };

      if (data === "flow_free") return await startFlow("free");
      if (data === "flow_basic") return await startFlow("basic");
      if (data === "flow_pro") return await startFlow("pro");
      if (data === "flow_premium") return await startFlow("premium");
      if (data === "flow_colorref5") return await startFlow("colorref5");
      if (data === "flow_colorref10") return await startFlow("colorref10");

      // Backward compat: if you still have old callback_data in UI
      if (data === "flow_colorref1") return await startFlow("colorref5");

      // Generation placeholders
      if (data.startsWith("gen_hair_")) {
        const st = userState.get(userId);
        const mode = data.replace("gen_hair_", "");
        if (!st || !st.userPhotoFileId) {
          await sendMessage(chatId, "Сначала пришли фото, пожалуйста 🙂", BACK_TO_MENU_KB);
          return res.sendStatus(200);
        }

        const n = mode === "free" ? 2 : 4;
        await sendMessage(
          chatId,
          `🖼 Генерация стрижки (заглушка)\nЯ бы сгенерировала ${n} варианта(ов) в одном изображении.\n\n(Дальше подключим реальную генерацию.)`,
          BACK_TO_MENU_KB
        );

        // Upsell after free
        if (mode === "free") {
          await sendMessage(
            chatId,
            "✨ Хочешь больше вариантов и цвет?\n\n" +
              "В платных тарифах доступно:\n" +
              "• 4 варианта стрижки\n" +
              "• цвет по Манселлу\n" +
              "• яркие оттенки (в PRO)\n" +
              "• биозавивка/кератин и аксессуары (в PREMIUM)\n\n" +
              "Открыть тарифы?",
            {
              inline_keyboard: [
                [{ text: "💳 Тарифы", callback_data: "info_pricing" }],
                [{ text: "🏠 В меню", callback_data: "nav_menu" }],
              ],
            }
          );
        }

        return res.sendStatus(200);
      }

      if (data === "apply_ref_color") {
        const st = userState.get(userId);

        if (!st || !st.userPhotoFileId || !st.refPhotoFileId) {
          await sendMessage(
            chatId,
            "Нужно 2 изображения: твоё фото + референс цвета.\nНажми /start и выбери пакет цвета.",
            BACK_TO_MENU_KB
          );
          return res.sendStatus(200);
        }

        if (!st.credits || st.credits <= 0) {
          await sendMessage(
            chatId,
            "Похоже, генерации в пакете закончились.\n\nХочешь взять пакет 10 генераций?",
            {
              inline_keyboard: [
                [{ text: "10 генераций", callback_data: "flow_colorref10" }],
                [{ text: "🏠 В меню", callback_data: "nav_menu" }],
              ],
            }
          );
          return res.sendStatus(200);
        }

        // decrement credits
        const nextCredits = st.credits - 1;
        setState(userId, { credits: nextCredits });

        await sendMessage(
          chatId,
          `🎨 Примерка цвета (заглушка)\nСписано 1 из пакета. Осталось: ${nextCredits}\n\n(Дальше подключим реальную генерацию.)`,
          {
            inline_keyboard: [
              [{ text: "Ещё цвет", callback_data: "apply_ref_color" }],
              [{ text: "🏠 В меню", callback_data: "nav_menu" }],
            ],
          }
        );

        return res.sendStatus(200);
      }

      // default fallback
      await editMessageText(chatId, messageId, "Не понял команду 🙂", BACK_TO_MENU_KB);
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.sendStatus(200);
  }
});

app.get("/health", (req, res) => {
  res.send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Bot running on port", PORT);
});
