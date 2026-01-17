import { getDisplayPrice } from '../utils/payments.js';
import { КОНФИГ } from '../../config.js';

export function getMainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📚 О сервисе HAIRbot", callback_data: "about" }],
      [{ text: "📖 Примеры разборов", callback_data: "examples" }],
      [{ text: "🎁 БЕСПЛАТНЫЙ АНАЛИЗ", callback_data: "free" }],
      [{ text: `💎 BASIC - ${getDisplayPrice('basic')} (тест)`, callback_data: "basic" }],
      [{ text: `✨ PRO - ${getDisplayPrice('pro')} (тест)`, callback_data: "pro" }],
      [{ text: `👑 PREMIUM - ${getDisplayPrice('premium')} (тест)`, callback_data: "premium" }],
      [
        { text: "💰 Сравнить тарифы", callback_data: "tariffs" },
        { text: "🔒 Политика", url: КОНФИГ.ССЫЛКА_ПОЛИТИКА }
      ],
      [
        { text: "📧 Поддержка", url: `mailto:${КОНФИГ.ПОЧТА_ПОДДЕРЖКИ}` },
        { text: "🏠 Главное меню", callback_data: "menu" }
      ]
    ]
  };
}

export function getBackKeyboard() {
  return {
    inline_keyboard: [[{ text: "🏠 Главное меню", callback_data: "menu" }]]
  };
}

export function getTariffKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🎁 БЕСПЛАТНЫЙ", callback_data: "free" }],
      [{ text: `💎 BASIC - ${getDisplayPrice('basic')}`, callback_data: "basic" }],
      [{ text: `✨ PRO - ${getDisplayPrice('pro')}`, callback_data: "pro" }],
      [{ text: `👑 PREMIUM - ${getDisplayPrice('premium')}`, callback_data: "premium" }],
      [{ text: "🔙 Назад", callback_data: "menu" }]
    ]
  };
}
