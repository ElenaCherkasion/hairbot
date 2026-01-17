// src/utils/text-templates.js
const textTemplates = {
  welcome: (name = 'друг') => `Привет, ${name}! Я HairBot. Отправь фото для анализа лица.`,
  help: 'Помощь: /start - начать, /photo - анализ фото'
};

export default textTemplates;
