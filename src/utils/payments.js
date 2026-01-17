// src/utils/payments.js
import logger from './logger.js';

class PaymentService {
  constructor() {
    this.providerToken = process.env.PAYMENT_PROVIDER_TOKEN;
    this.currency = process.env.PAYMENT_CURRENCY || 'RUB';
    this.prices = {
      basic: parseInt(process.env.PRICE_BASIC) || 100,
      premium: parseInt(process.env.PRICE_PREMIUM) || 300,
      vip: parseInt(process.env.PRICE_VIP) || 500
    };
  }

  async createInvoice(userId, tariff, description = 'Оплата тарифа') {
    try {
      const amount = this.prices[tariff];
      
      if (!amount) {
        throw new Error(`Неизвестный тариф: ${tariff}`);
      }

      if (!this.providerToken) {
        logger.warn('PAYMENT_PROVIDER_TOKEN не установлен');
        return null;
      }

      const invoice = {
        chat_id: userId,
        title: `Тариф "${tariff}"`,
        description: description,
        payload: `payment_${tariff}_${Date.now()}`,
        provider_token: this.providerToken,
        currency: this.currency,
        prices: [{
          label: `Тариф "${tariff}"`,
          amount: amount * 100
        }]
      };

      logger.info(`Создан счет: пользователь ${userId}, тариф ${tariff}, ${amount} ${this.currency}`);
      return invoice;

    } catch (error) {
      logger.error(`Ошибка создания счета: ${error.message}`);
      throw error;
    }
  }

  getPrice(tariff) {
    return this.prices[tariff] || 0;
  }

  formatAmount(amount) {
    return `${amount} ${this.currency}`;
  }
}

export default new PaymentService();
