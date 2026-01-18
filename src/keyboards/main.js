// src/keyboards/main.js
import { Markup } from "telegraf";

/**
 * Главное меню (основное)
 */
export const mainMenuKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("▶️ Начать / Выбрать тариф", "MENU_START")],

    [
      Markup.button.callback("📌 Тарифы", "MENU_TARIFFS"),
      Markup.button.callback("📊 Сравнение тарифов", "MENU_WHATSIN"),
    ],

    [
      Markup.button.callback("ℹ️ О сервисе", "MENU_ABOUT"),
      Markup.button.callback("🆘 Поддержка", "MENU_SUPPORT"),
    ],

    [
      Markup.button.callback("💳 Оплата/возврат", "MENU_PAYMENTS"),
      Markup.button.callback("🔒 Конфиденциальность", "MENU_PRIVACY"),
    ],

    [
      Markup.button.callback("🗑 Удалить данные", "MENU_DELETE"),
      Markup.button.callback("⚠️ Сообщить об ошибке", "MENU_ERROR"),
    ],
  ]);

/**
 * Клавиатура "назад"
 * (нужна для совместимости со start.js и другими handlers)
 */
export const backToMenuKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("⬅️ В главное меню", "MENU_HOME")],
  ]);
