// src/keyboards/tariffs.js
export default {
  inline_keyboard: [
    [
      { text: '🟢 Базовый (100 руб.)', callback_data: 'tariff_basic' },
      { text: '🟡 Премиум (300 руб.)', callback_data: 'tariff_premium' }
    ],
    [
      { text: '🔴 VIP (500 руб.)', callback_data: 'tariff_vip' }
    ]
  ]
};
