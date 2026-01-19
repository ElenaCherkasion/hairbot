// src/keyboards/main.js

export function mainMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        // Тарифы — визуально выделены
        [{ text: "🆓 FREE", callback_data: "MENU_TARIFF_FREE" }],
        [{ text: "⭐ PRO", callback_data: "MENU_TARIFF_PRO" }],
        [{ text: "💎 PREMIUM", callback_data: "MENU_TARIFF_PREMIUM" }],

        // Коммерческие/доверительные блоки
        [{ text: "Сравнение тарифов", callback_data: "MENU_WHATSIN" }],
        [{ text: "Примеры анализа", callback_data: "MENU_EXAMPLES" }],

        // Документы отдельно (как ты требовала)
        [{ text: "Политика конфиденциальности", callback_data: "MENU_PRIVACY" }],
        [{ text: "Оплата и возврат", callback_data: "MENU_PAYMENTS" }],

        // Поддержка и данные
        [{ text: "Поддержка", callback_data: "MENU_SUPPORT" }],
        [{ text: "Удалить мои данные", callback_data: "MENU_DELETE" }],
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
