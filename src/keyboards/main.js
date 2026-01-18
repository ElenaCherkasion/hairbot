// src/keyboards/main.js
import { Markup } from "telegraf";

/**
 * Главное меню:
 * - тарифы выделены отдельными кнопками
 * - есть сравнение тарифов
 * - есть примеры анализа (контент позже)
 * - есть политика/удаление/поддержка/ошибка
 */
export const mainMenuKeyboard = () =>
  Markup.inlineKeyboard([
    // ТАРИФЫ (логически сгруппированы)
    [
      Markup.button.callback("🆓 FREE", "MENU_TARIFF_FREE"),
      Markup.button.callback("⭐ PRO", "MENU_TARIFF_PRO"),
    ],
    [
      Markup.button.callback("💎 PREMIUM", "MENU_TARIFF_PREMIUM"),
      Markup.button.callback("📊 Сравнение", "MENU_WHATSIN"),
    ],

    // Примеры
    [Markup.button.callback("🧾 Примеры анализа", "MENU_EXAMPLES")],

    // Юридическое/данные
    [
      Markup.button.callback("🔒 Конфиденциальность", "MENU_PRIVACY"),
      Markup.button.callback("🗑 Удалить мои данные", "MENU_DELETE"),
    ],

    // Коммуникация
    [
      Markup.button.callback("🆘 Поддержка", "MENU_SUPPORT"),
      Markup.button.callback("⚠️ Сообщить об ошибке", "MENU_ERROR"),
    ],
  ]);

/**
 * Оставляем для совместимости с другими файлами (у тебя импортируется в start.js)
 */
export const backToMenuKeyboard = () =>
  Markup.inlineKeyboard([[Markup.button.callback("⬅️ В меню", "MENU_HOME")]]);
