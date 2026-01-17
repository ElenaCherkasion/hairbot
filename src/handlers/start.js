import { отправитьСообщение } from '../../utils/telegram-api.js';
import { getMainKeyboard } from '../keyboards/main.js';
import { getWelcomeText } from '../utils/text-templates.js';

export async function handleStart(userId, chatId, userData) {
  const text = getWelcomeText();
  const keyboard = getMainKeyboard();
  
  await отправитьСообщение(chatId, text, keyboard);
}
