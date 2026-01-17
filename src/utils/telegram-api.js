// src/utils/telegram-api.js
import axios from 'axios';
import logger from './logger.js';

class TelegramAPI {
  constructor() {
    this.token = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    this.baseURL = `https://api.telegram.org/bot${this.token}`;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000
    });
  }

  async sendMessage(chatId, text, options = {}) {
    try {
      const params = {
        chat_id: chatId,
        text: text,
        parse_mode: options.parse_mode || 'HTML'
      };

      if (options.reply_markup) {
        params.reply_markup = options.reply_markup;
      }

      const response = await this.client.post('/sendMessage', params);
      return response.data.result;

    } catch (error) {
      logger.error(`Ошибка отправки сообщения: ${error.message}`);
      throw error;
    }
  }

  async getMe() {
    try {
      const response = await this.client.get('/getMe');
      return response.data.result;
    } catch (error) {
      logger.error(`Ошибка получения информации о боте: ${error.message}`);
      throw error;
    }
  }

  async setWebhook(url) {
    try {
      const response = await this.client.post('/setWebhook', { url });
      logger.info(`Webhook установлен: ${url}`);
      return response.data;
    } catch (error) {
      logger.error(`Ошибка установки webhook: ${error.message}`);
      throw error;
    }
  }
}

export default new TelegramAPI();
