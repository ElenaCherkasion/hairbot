// src/utils/validation.js
class Validator {
  isValidTelegramId(id) {
    return id && Number.isInteger(id) && id > 0;
  }

  isValidName(name) {
    return name && typeof name === 'string' && name.trim().length >= 2;
  }

  isValidAmount(amount) {
    return amount && typeof amount === 'number' && amount > 0;
  }

  isValidTariff(tariff) {
    const validTariffs = ['basic', 'premium', 'vip'];
    return validTariffs.includes(tariff);
  }

  sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.trim().substring(0, 4096);
  }
}

export default new Validator();
