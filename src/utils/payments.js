// src/utils/payments.js
import logger from './logger.js';

class PaymentService {
  constructor() {
    this.providerToken = process.env.PAYMENT_PROVIDER_TOKEN;
    this.currency = process.env.PAYMENT_CURRENCY || 'RUB';
  }

  // Цены тарифов
  getPrices() {
    return {
      basic: parseInt(process.env.PRICE_BASIC) || 100,
      premium: parseInt(process.env.PRICE_PREMIUM) || 300,
      vip: parseInt(process.env.PRICE_VIP) || 500
    };
  }

  // Создание счета
  async createInvoice(userId, tariff, description = 'Оплата тарифа') {
    try {
      const prices = this.getPrices();
      const amount = prices[tariff];
      
      if (!amount) {
        throw new Error(`Неизвестный тариф: ${tariff}`);
      }

      if (!this.providerToken) {
        logger.warn('PAYMENT_PROVIDER_TOKEN не установлен, платежи не работают');
        return null;
      }

      // Здесь будет логика создания счета через Telegram Payments
      const invoice = {
        chat_id: userId,
        title: `Тариф "${tariff}"`,
        description: description,
        payload: `payment_${tariff}_${Date.now()}`,
        provider_token: this.providerToken,
        currency: this.currency,
        prices: [{
          label: `Тариф "${tariff}"`,
          amount: amount * 100 // В копейках
        }],
        start_parameter: tariff,
        need_name: false,
        need_phone_number: false,
        need_email: false,
        need_shipping_address: false,
        is_flexible: false
      };

      logger.info(`Создан счет для пользователя ${userId}, тариф: ${tariff}, сумма: ${amount} ${this.currency}`);
      return invoice;

    } catch (error) {
      logger.error(`Ошибка создания счета: ${error.message}`);
      throw error;
    }
  }

  // Проверка платежа
  async verifyPayment(paymentId) {
    try {
      // Здесь будет логика проверки платежа
      logger.info(`Проверка платежа: ${paymentId}`);
      return { success: true, paymentId };
    } catch (error) {
      logger.error(`Ошибка проверки платежа: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Генерация QR-кода (опционально)
  async generateQRCode(paymentData) {
    try {
      // Здесь будет генерация QR-кода
      return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(JSON.stringify(paymentData))}`;
    } catch (error) {
      logger.error(`Ошибка генерации QR-кода: ${error.message}`);
      return null;
    }
  }
}

export default new PaymentService();
