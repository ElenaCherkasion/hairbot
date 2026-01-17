// src/utils/index.js
export { default as logger } from './logger.js';
export { default as payments } from './payments.js';
export { default as telegramApi } from './telegram-api.js';
export { default as textTemplates } from './text-templates.js';
export { default as validation } from './validation.js';

// Вспомогательные функции
export function formatDate(date) {
  return new Date(date).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function maskString(str, visibleChars = 4) {
  if (!str || str.length <= visibleChars * 2) return '••••';
  return '•'.repeat(str.length - visibleChars * 2) + str.slice(-visibleChars);
}
