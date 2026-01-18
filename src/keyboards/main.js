// src/keyboards/main.js
import { Markup } from "telegraf";

export const mainMenuKeyboard = () =>
  Markup.inlineKeyboard([
    // Тарифы (логически выделены)
    [
      Markup.button.callback("🆓 FREE", "MENU_TARIFF_FREE"),
      Markup.button.callback("⭐ PRO", "MENU_TARIFF_PRO"),
    ],
    [
      Markup.button.callback("💎 PREMIUM", "MENU_TARIFF_PREMIUM"),
      Markup.button.callback("📊 Сравнение тарифов", "MENU_WHATSIN"),
    ],

    // Примеры
    [Markup.button.callback("🧾 Примеры анализа", "MENU_EXAMPLES")],

    // Документы
    [
      Markup.button.callback("🔒 Конфиденциальность", "MENU_PRIVACY"),
      Markup.button.callback("💳 Оплата и возврат", "MENU_PAYMENTS"),
    ],

    // Поддержка / данные
    [
      Markup.button.callback("🆘 Поддержка", "MENU_SUPPORT"),
      Markup.button.callback("🗑 Удалить мои данные", "MENU_DELETE"),
    ],
  ]);

// оставляем для совместимости с твоим start.js
export const backToMenuKeyboard = () =>
  Markup.inlineKeyboard([[Markup.button.callback("⬅️ В меню", "MENU_HOME")]]);
