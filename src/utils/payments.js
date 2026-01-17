// Тестовые цены (в копейках)
const TEST_PRICES = {
  basic: 500,    // 5 рублей
  pro: 1000,     // 10 рублей
  premium: 1500  // 15 рублей
};

/**
 * Получить цену для отображения
 * @param {string} tariff - Название тарифа
 * @returns {string} Форматированная цена
 */
export function getDisplayPrice(tariff) {
  const price = TEST_PRICES[tariff] || 0;
  return `${(price / 100).toFixed(2)}₽`;
}

/**
 * Получить реальную цену (в копейках)
 * @param {string} tariff - Название тарифа
 * @returns {number} Цена в копейках
 */
export function getActualPrice(tariff) {
  return TEST_PRICES[tariff] || 0;
}

/**
 * Форматировать сумму для платежной системы
 * @param {number} amount - Сумма в копейках
 * @returns {Object} Форматированные данные
 */
export function formatPaymentAmount(amount) {
  return {
    rubles: Math.floor(amount / 100),
    kopecks: amount % 100,
    total: (amount / 100).toFixed(2)
  };
}

/**
 * Генерация ID платежа
 * @returns {string} Уникальный ID платежа
 */
export function generatePaymentId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `pay_${timestamp}_${random}`;
}

/**
 * Проверка валидности тарифа
 * @param {string} tariff - Название тарифа
 * @returns {boolean} Валидность
 */
export function isValidTariff(tariff) {
  return Object.keys(TEST_PRICES).includes(tariff) || tariff === 'free';
}

// Экспорт тестовых цен для других модулей
export const TEST_PRICES_LIST = TEST_PRICES;
