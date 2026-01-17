// src/utils/validation.js
import logger from './logger.js';

class Validator {
  // Валидация Telegram ID
  isValidTelegramId(id) {
    if (!id || typeof id !== 'number') return false;
    return id > 0 && Number.isInteger(id);
  }

  // Валидация email
  isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  // Валидация имени
  isValidName(name) {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    return trimmed.length >= 2 && trimmed.length <= 50;
  }

  // Валидация номера телефона
  isValidPhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const phoneRegex = /^[\+]?[78]?[0-9]{10,11}$/;
    const cleaned = phone.replace(/[^0-9+]/g, '');
    return phoneRegex.test(cleaned);
  }

  // Валидация суммы платежа
  isValidAmount(amount) {
    if (typeof amount !== 'number') return false;
    return amount > 0 && amount <= 100000; // Макс 1000 рублей
  }

  // Валидация фото (базовая проверка)
  isValidPhoto(photo) {
    if (!photo) return false;
    
    // Проверка размера (макс 20MB)
    if (photo.file_size && photo.file_size > 20 * 1024 * 1024) {
      logger.warn(`Фото слишком большое: ${photo.file_size} bytes`);
      return false;
    }

    return true;
  }

  // Валидация тарифа
  isValidTariff(tariff) {
    const validTariffs = ['basic', 'premium', 'vip'];
    return validTariffs.includes(tariff?.toLowerCase());
  }

  // Валидация текста (для сообщений)
  isValidText(text, min = 1, max = 4096) {
    if (typeof text !== 'string') return false;
    const trimmed = text.trim();
    return trimmed.length >= min && trimmed.length <= max;
  }

  // Валидация даты
  isValidDate(date) {
    if (!date) return false;
    const d = new Date(date);
    return d instanceof Date && !isNaN(d);
  }

  // Очистка текста от опасных символов
  sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/[<>]/g, '') // Удаляем HTML теги
      .trim()
      .substring(0, 4096); // Ограничение длины
  }

  // Проверка администратора
  isAdmin(userId) {
    const adminIds = process.env.ADMIN_USER_IDS 
      ? process.env.ADMIN_USER_IDS.split(',').map(Number) 
      : [];
    return adminIds.includes(Number(userId));
  }

  // Валидация запроса
  validateRequest(data, schema) {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];
      
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} обязательно для заполнения`);
        continue;
      }

      if (value !== undefined && value !== null) {
        if (rules.type && typeof value !== rules.type) {
          errors.push(`${field} должен быть типа ${rules.type}`);
        }

        if (rules.min && value.length < rules.min) {
          errors.push(`${field} должен содержать минимум ${rules.min} символов`);
        }

        if (rules.max && value.length > rules.max) {
          errors.push(`${field} должен содержать максимум ${rules.max} символов`);
        }

        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push(`${field} имеет неверный формат`);
        }

        if (rules.validate && !rules.validate(value)) {
          errors.push(`${field} не проходит валидацию`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default new Validator();
