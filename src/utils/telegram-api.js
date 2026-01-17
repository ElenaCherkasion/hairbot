// src/utils/telegram-api.js
import axios from 'axios';
import logger from './logger.js';

class TelegramAPI {
  constructor() {
    this.token = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    this.baseURL = `https://api.telegram.org/bot${this.token}`;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  // Отправка сообщения
  async sendMessage(chatId, text, options = {}) {
    try {
      const params = {
        chat_id: chatId,
        text: text,
        parse_mode: options.parse_mode || 'HTML',
        reply_markup: options.reply_markup,
        disable_web_page_preview: options.disable_web_page_preview || true
      };

      const response = await this.client.post('/sendMessage', params);
      logger.debug(`Сообщение отправлено в чат ${chatId}`);
      return response.data.result;

    } catch (error) {
      logger.error(`Ошибка отправки сообщения: ${error.message}`);
      throw error;
    }
  }

  // Отправка фото
  async sendPhoto(chatId, photo, caption = '', options = {}) {
    try {
      let photoData;
      
      if (typeof photo === 'string' && photo.startsWith('http')) {
        // URL фото
        photoData = photo;
      } else {
        // Файл или buffer
        photoData = photo;
      }

      const params = {
        chat_id: chatId,
        photo: photoData,
        caption: caption,
        parse_mode: options.parse_mode || 'HTML'
      };

      const response = await this.client.post('/sendPhoto', params);
      logger.debug(`Фото отправлено в чат ${chatId}`);
      return response.data.result;

    } catch (error) {
      logger.error(`Ошибка отправки фото: ${error.message}`);
      throw error;
    }
  }

  // Получение информации о пользователе
  async getUserProfilePhotos(userId) {
    try {
      const response = await this.client.post('/getUserProfilePhotos', {
        user_id: userId,
        limit: 1
      });
      return response.data.result;
    } catch (error) {
      logger.error(`Ошибка получения фото профиля: ${error.message}`);
      return null;
    }
  }

  // Установка webhook
  async setWebhook(url, secretToken = null) {
    try {
      const params = { url };
      if (secretToken) {
        params.secret_token = secretToken;
      }

      const response = await this.client.post('/setWebhook', params);
      logger.info(`Webhook установлен: ${url}`);
      return response.data;
    } catch (error) {
      logger.error(`Ошибка установки webhook: ${error.message}`);
      throw error;
    }
  }

  // Получение информации о боте
  async getMe() {
    try {
      const response = await this.client.get('/getMe');
      return response.data.result;
    } catch (error) {
      logger.error(`Ошибка получения информации о боте: ${error.message}`);
      throw error;
    }
  }

  // Удаление webhook
  async deleteWebhook() {
    try {
      const response = await this.client.post('/deleteWebhook');
      logger.info('Webhook удален');
      return response.data;
    } catch (error) {
      logger.error(`Ошибка удаления webhook: ${error.message}`);
      throw error;
    }
  }
}

export default new TelegramAPI();
