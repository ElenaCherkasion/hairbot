// src/keyboards/main.js
export default {
  reply_markup: {
    keyboard: [
      [{ text: '📸 Анализ фото' }],
      [{ text: '💳 Тарифы' }, { text: '🆘 Поддержка' }],
      [{ text: 'ℹ️ О боте' }, { text: '📊 Статистика' }]
    ],
    resize_keyboard: true
  }
};
