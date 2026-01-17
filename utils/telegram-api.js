import fetch from 'node-fetch';

// Конфигурация из переменных окружения
const ТОКЕН_ТЕЛЕГРАМ = process.env.TELEGRAM_TOKEN;
const ТАЙМАУТ = parseInt(process.env.REQUEST_TIMEOUT) || 30000;
const АДРЕС_ТЕЛЕГРАМ_АПИ = `https://api.telegram.org/bot${ТОКЕН_ТЕЛЕГРАМ}`;

/**
 * Проверить валидность токена
 */
function проверитьТокен() {
  if (!ТОКЕН_ТЕЛЕГРАМ) {
    throw new Error('❌ TELEGRAM_TOKEN не установлен в переменных окружения');
  }
  
  if (!ТОКЕН_ТЕЛЕГРАМ.includes(':')) {
    throw new Error('❌ Неверный формат TELEGRAM_TOKEN');
  }
}

/**
 * Базовый запрос к Telegram API
 * @param {string} метод - API метод
 * @param {Object} данные - Данные для отправки
 * @returns {Promise<Object>} Ответ от API
 */
export async function запросТелеграм(метод, данные = {}) {
  проверитьТокен();
  
  try {
    // Создаем AbortController для таймаута
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ТАЙМАУТ);
    
    const response = await fetch(`${АДРЕС_ТЕЛЕГРАМ_АПИ}/${метод}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(данные),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ HTTP ошибка (${метод}):`, response.status, errorText);
      return {
        ok: false,
        error: `HTTP ${response.status}: ${errorText}`
      };
    }
    
    const result = await response.json();
    
    if (!result.ok) {
      console.error(`❌ Telegram API ошибка (${метод}):`, result.description);
    }
    
    return result;
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`❌ Таймаут Telegram API (${метод}):`, ТАЙМАУТ + 'мс');
      return {
        ok: false,
        error: `Таймаут запроса (${ТАЙМАУТ}мс)`
      };
    }
    
    console.error(`❌ Ошибка сети Telegram API (${метод}):`, error.message);
    return {
      ok: false,
      error: error.message
    };
  }
}

/**
 * Отправить сообщение
 * @param {number|string} IDчата - ID чата
 * @param {string} текст - Текст сообщения
 * @param {Object|null} клавиатура - Клавиатура (reply_markup)
 * @returns {Promise<Object>}
 */
export async function отправитьСообщение(IDчата, текст, клавиатура = null) {
  const данные = {
    chat_id: IDчата,
    text: текст,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  
  if (клавиатура) {
    данные.reply_markup = клавиатура;
  }
  
  return запросТелеграм('sendMessage', данные);
}

/**
 * Отправить фото
 * @param {number|string} IDчата - ID чата
 * @param {string} фото - URL или file_id фото
 * @param {string} подпись - Подпись к фото
 * @param {Object|null} клавиатура - Клавиатура
 * @returns {Promise<Object>}
 */
export async function отправитьФото(IDчата, фото, подпись = '', клавиатура = null) {
  const данные = {
    chat_id: IDчата,
    photo: фото,
    caption: подпись,
    parse_mode: 'HTML'
  };
  
  if (клавиатура) {
    данные.reply_markup = клавиатура;
  }
  
  return запросТелеграм('sendPhoto', данные);
}

/**
 * Ответить на callback запрос
 * @param {string} IDколбэка - ID callback запроса
 * @param {string} текст - Текст ответа (опционально)
 * @param {boolean} показатьОповещение - Показать как alert
 * @returns {Promise<Object>}
 */
export async function ответитьНаCallback(IDколбэка, текст = '', показатьОповещение = false) {
  return запросТелеграм('answerCallbackQuery', {
    callback_query_id: IDколбэка,
    text: текст,
    show_alert: показатьОповещение
  });
}

/**
 * Получить информацию о файле
 * @param {string} fileId - ID файла в Telegram
 * @returns {Promise<Object>}
 */
export async function получитьИнфоФайла(fileId) {
  const ответ = await запросТелеграм('getFile', { file_id: fileId });
  
  if (ответ.ok && ответ.result) {
    return ответ.result;
  }
  
  throw new Error('Не удалось получить информацию о файле: ' + (ответ.error || ответ.description || 'неизвестная ошибка'));
}

/**
 * Получить URL файла для скачивания
 * @param {string} fileId - ID файла в Telegram
 * @returns {Promise<string>} URL файла
 */
export async function получитьФайлТелеграм(fileId) {
  const файлИнфо = await получитьИнфоФайла(fileId);
  
  if (файлИнфо.file_path) {
    return `https://api.telegram.org/file/bot${ТОКЕН_ТЕЛЕГРАМ}/${файлИнфо.file_path}`;
  }
  
  throw new Error('Не удалось получить путь к файлу');
}

/**
 * Редактировать сообщение
 * @param {number|string} IDчата - ID чата
 * @param {number} IDсообщения - ID сообщения
 * @param {string} новыйТекст - Новый текст
 * @param {Object|null} новаяКлавиатура - Новая клавиатура
 * @returns {Promise<Object>}
 */
export async function редактироватьСообщение(IDчата, IDсообщения, новыйТекст, новаяКлавиатура = null) {
  const данные = {
    chat_id: IDчата,
    message_id: IDсообщения,
    text: новыйТекст,
    parse_mode: 'HTML'
  };
  
  if (новаяКлавиатура) {
    данные.reply_markup = новаяКлавиатура;
  }
  
  return запросТелеграм('editMessageText', данные);
}

/**
 * Удалить сообщение
 * @param {number|string} IDчата - ID чата
 * @param {number} IDсообщения - ID сообщения
 * @returns {Promise<Object>}
 */
export async function удалитьСообщение(IDчата, IDсообщения) {
  return запросТелеграм('deleteMessage', {
    chat_id: IDчата,
    message_id: IDсообщения
  });
}

/**
 * Отправить действие (typing, upload_photo и т.д.)
 * @param {number|string} IDчата - ID чата
 * @param {string} действие - Действие
 * @returns {Promise<Object>}
 */
export async function отправитьДействие(IDчата, действие = 'typing') {
  const допустимыеДействия = [
    'typing', 'upload_photo', 'record_video', 'upload_video',
    'record_voice', 'upload_voice', 'upload_document',
    'choose_sticker', 'find_location'
  ];
  
  if (!допустимыеДействия.includes(действие)) {
    действие = 'typing';
  }
  
  return запросТелеграм('sendChatAction', {
    chat_id: IDчата,
    action: действие
  });
}

/**
 * Получить информацию о боте
 * @returns {Promise<Object>}
 */
export async function получитьИнфоБота() {
  return запросТелеграм('getMe');
}

/**
 * Проверить токен бота
 * @returns {Promise<{valid: boolean, bot?: Object, error?: string}>}
 */
export async function проверитьТокенБота() {
  try {
    const результат = await получитьИнфоБота();
    
    if (результат.ok && результат.result) {
      console.log('✅ Токен бота валиден. Бот:', результат.result.username);
      return {
        valid: true,
        bot: результат.result
      };
    }
    
    return {
      valid: false,
      error: результат.error || результат.description || 'Неизвестная ошибка'
    };
    
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Установить webhook
 * @param {string} url - URL webhook
 * @param {Object} дополнительныеПараметры - Дополнительные параметры
 * @returns {Promise<Object>}
 */
export async function установитьWebhook(url, дополнительныеПараметры = {}) {
  return запросТелеграм('setWebhook', {
    url: url,
    ...дополнительныеПараметры
  });
}

/**
 * Удалить webhook
 * @returns {Promise<Object>}
 */
export async function удалитьWebhook() {
  return запросТелеграм('deleteWebhook');
}

/**
 * Получить информацию о webhook
 * @returns {Promise<Object>}
 */
export async function получитьИнфоВебхука() {
  return запросТелеграм('getWebhookInfo');
}

// Экспорт всех функций
export default {
  запросТелеграм,
  отправитьСообщение,
  отправитьФото,
  ответитьНаCallback,
  получитьФайлТелеграм,
  редактироватьСообщение,
  удалитьСообщение,
  отправитьДействие,
  получитьИнфоБота,
  проверитьТокенБота,
  установитьWebhook,
  удалитьWebhook,
  получитьИнфоВебхука
};
