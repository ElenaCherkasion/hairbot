// src/keyboards/main.js

export function mainMenuKeyboard() {
  const offerUrl = (process.env.PUBLIC_OFFER_URL || process.env.OFFER_URL || "").trim();
  return {
    reply_markup: {
      inline_keyboard: [
        // Тарифы — визуально выделены (2 колонки)
        [
          { text: "🆓 FREE", callback_data: "MENU_TARIFF_FREE" },
          { text: "⭐ PRO", callback_data: "MENU_TARIFF_PRO" },
        ],
        [
          { text: "💎 PREMIUM", callback_data: "MENU_TARIFF_PREMIUM" },
          { text: "📊 Сравнение тарифов", callback_data: "MENU_WHATSIN" },
        ],

        // Примеры анализа — отдельной строкой
        [{ text: "🧾 Примеры анализа", callback_data: "MENU_EXAMPLES" }],

        // Документы
        [
          { text: "🔒 Конфиденциальность", callback_data: "MENU_PRIVACY" },
          offerUrl
            ? { text: "📄 Публичная оферта", url: offerUrl }
            : { text: "📄 Публичная оферта", callback_data: "MENU_OFFER" },
        ],
        [{ text: "💳 Оплата и возврат", callback_data: "MENU_PAYMENTS" }],

        // Поддержка и данные
        [
          { text: "🆘 Поддержка", callback_data: "MENU_SUPPORT" },
          { text: "❓ FAQ", callback_data: "MENU_FAQ" },
        ],
        [{ text: "🗑 Удалить мои данные", callback_data: "MENU_DELETE" }],
      ],
    },
  };
}

export function backToMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]],
    },
  };
}
