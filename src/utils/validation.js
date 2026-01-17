/**
 * Проверка валидности Telegram ID
 * @param {string|number} id - Telegram ID
 * @returns {boolean} Валидность
 */
export function isValidTelegramId(id) {
  const numId = Number(id);
  return !isNaN(numId) && numId > 0 && Number.isInteger(numId);
}

/**
 * Проверка валидности текстового сообщения
 * @param {string} text - Текст сообщения
 * @returns {boolean} Валидность
 */
export function isValidMessageText(text) {
  if (typeof text !== 'string') return false;
  if (text.trim().length === 0) return false;
  if (text.length > 4096) return false; // Ограничение Telegram
  return true;
}

/**
 * Проверка валидности callback данных
 * @param {string} data - Callback data
 * @returns {boolean} Валидность
 */
export function isValidCallbackData(data) {
  if (typeof data !== 'string') return false;
  if (data.length > 64) return false; // Ограничение Telegram
  if (!/^[a-zA-Z0-9_]+$/.test(data)) return false;
  return true;
}

/**
 * Проверка валидности email
 * @param {string} email - Email адрес
 * @returns {boolean} Валидность
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Проверка валидности URL
 * @param {string} url - URL адрес
 * @returns {boolean} Валидность
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Санитизация текста (удаление опасных символов)
 * @param {string} text - Исходный текст
 * @returns {string} Очищенный текст
 */
export function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  
  return text
    .replace(/[<>]/g, '') // Удаляем HTML теги
    .trim()
    .substring(0, 4000); // Обрезаем до безопасной длины
}

/**
 * Проверка формата платежного ID
 * @param {string} paymentId - ID платежа
 * @returns {boolean} Валидность
 */
export function isValidPaymentId(paymentId) {
  if (typeof paymentId !== 'string') return false;
  if (paymentId.length > 255) return false;
  return /^[a-zA-Z0-9_-]+$/.test(paymentId);
}

/**
 * Валидация данных пользователя
 * @param {Object} userData - Данные пользователя
 * @returns {Object} Результат валидации
 */
export function validateUserData(userData) {
  const errors = [];
  
  if (!userData || typeof userData !== 'object') {
    errors.push('Неверный формат данных пользователя');
    return { isValid: false, errors };
  }
  
  if (!isValidTelegramId(userData.id)) {
    errors.push('Неверный Telegram ID');
  }
  
  if (userData.username && userData.username.length > 255) {
    errors.push('Имя пользователя слишком длинное');
  }
  
  if (userData.first_name && userData.first_name.length > 255) {
    errors.push('Имя слишком длинное');
  }
  
  if (userData.language_code && userData.language_code.length > 10) {
    errors.push('Неверный код языка');
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors.length > 0 ? errors : null
  };
}
