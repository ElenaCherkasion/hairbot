// src/handlers/index.js
import logger from '../utils/logger.js';

export function setupWebhook(bot, url) {
  return bot.telegram.setWebhook(url)
    .then(() => {
      logger.info(`✅ Webhook установлен на ${url}`);
      return true;
    })
    .catch(error => {
      logger.error(`❌ Ошибка установки webhook: ${error.message}`);
      throw error;
    });
}

// Экспортируем все обработчики
export { default as startHandler } from './start.js';
export { default as photoHandler } from './photo.js';
export { default as tariffsHandler } from './tariffs.js';
export { default as callbackHandler } from './callback.js';
