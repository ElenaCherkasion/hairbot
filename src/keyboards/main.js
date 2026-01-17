// src/keyboards/main.js
export function mainMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "▶️ Начать / Выбрать тариф", callback_data: "MENU_START" }],
        [{ text: "📌 Тарифы и что входит", callback_data: "MENU_TARIFFS" }],
        [{ text: "💳 Правила оплаты и возврата", callback_data: "MENU_PAYMENTS" }],
        [{ text: "⚠️ Сообщить об ошибке", callback_data: "MENU_ERROR" }],
        [{ text: "🔒 Политика конфиденциальности", callback_data: "MENU_PRIVACY" }],
        [{ text: "🗑 Удалить персональные данные", callback_data: "MENU_DELETE" }],
        [{ text: "🆘 Поддержка", callback_data: "MENU_SUPPORT" }],
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
