import fetch from 'node-fetch';

// Конфигурация
const ТОКЕН_ТЕЛЕГРАМ = process.env.TELEGRAM_TOKEN;
const ТАЙМАУТ = parseInt(process.env.REQUEST_TIMEOUT) || 30000;
const АДРЕС_ТЕЛЕГРАМ_АПИ = `https://api.telegram.org/bot${ТОКЕН_ТЕЛЕГРАМ}`;

/**
 * Базовый запрос к Telegram API
 */
export async function запросТелеграм(метод, данные = {}) {
  if (!ТОКЕН_ТЕЛЕГРАМ) {
    console.error('❌ TELEGRAM_TOKEN не установлен');
    return { ok: false, описание: 'Токен не настроен' };
  }
  
  try {
    const контроллер = new AbortController();
    const таймаутId = setTimeout(() => контроллер.abort(), ТАЙМАУТ);
    
    const ответ = await fetch(`${АДРЕС_ТЕЛЕГРАМ_АПИ}/${метод}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(данные),
      signal: контроллер.signal
    });
    
    clearTimeout(таймаутId);
    
    if (!ответ.ok) {
      console.error(`❌ HTTP ошибка (${метод}): ${ответ.status}`);
      return { ok: false, описание: `HTTP ${ответ.status}` };
    }
    
    const результат = await ответ.json();
    
    if (!результат.ok) {
      console.error(`❌ Telegram API ошибка (${метод}):`, результат.description);
    }
    
    return результат;
    
  } catch (ошибка) {
    if (ошибка.name === 'AbortError') {
      console.error(`❌ Таймаут Telegram API (${метод}): ${ТАЙМАУТ}мс`);
      return { ok: false, описание: 'Таймаут запроса' };
    }
    
    console.error(`❌ Ошибка Telegram API (${метод}):`, ошибка.message);
    return { ok: false, описание: ошибка.message };
  }
}

/**
 * Отправить сообщение
 */
export async function отправитьСообщение(IDчата, текст, клавиатура = null) {
  return запросТелеграм('sendMessage', {
    chat_id: IDчата,
    text: текст,
    parse_mode: 'HTML',
    reply_markup: клавиатура,
    disable_web_page_preview: true
  });
}

/**
 * Ответить на callback запрос
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
 */
export async function получитьИнфоФайла(fileId) {
  const ответ = await запросТелеграм('getFile', { file_id: fileId });
  
  if (ответ.ok && ответ.result) {
    return ответ.result;
  }
  
  throw new Error('Не удалось получить файл: ' + (ответ.описание || 'неизвестная ошибка'));
}

/**
 * Получить URL файла
 */
export async function получитьФайлТелеграм(fileId) {
  const файлИнфо = await получитьИнфоФайла(fileId);
  
  if (файлИнфо.file_path) {
    return `https://api.telegram.org/file/bot${ТОКЕН_ТЕЛЕГРАМ}/${файлИнфо.file_path}`;
  }
  
  throw new Error('Не удалось получить путь к файлу');
}

/**
 * Отправить действие (печатает, загружает фото)
 */
export async function отправитьДействие(chatId, действие = 'typing') {
  return запросТелеграм('sendChatAction', {
    chat_id: chatId,
    action: действие
  });
}

/**
 * Проверить токен бота
 */
export async function проверитьТокенБота() {
  const результат = await запросТелеграм('getMe');
  
  if (результат.ok && результат.result) {
    console.log('✅ Токен бота валиден. Бот:', результат.result.username);
    return { valid: true, bot: результат.result };
  }
  
  return { valid: false, error: результат.описание };
}

export default {
  запросТелеграм,
  отправитьСообщение,
  ответитьНаCallback,
  получитьФайлТелеграм,
  отправитьДействие,
  проверитьТокенБота
};

