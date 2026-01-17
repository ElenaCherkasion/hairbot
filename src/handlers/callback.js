import { отправитьСообщение } from '../../utils/telegram-api.js';
import { handleStart } from './start.js';
import { handleTariffSelection } from './tariff.js';
import { getAboutText, getExamplesText, getTariffsText } from '../utils/text-templates.js';
import { getMainKeyboard, getBackKeyboard } from '../keyboards/main.js';

export async function handleCallback(userId, chatId, callbackData) {
  switch(callbackData) {
    case 'menu':
      await handleStart(userId, chatId);
      break;
      
    case 'about':
      await отправитьСообщение(chatId, getAboutText(), getBackKeyboard());
      break;
      
    case 'examples':
      await отправитьСообщение(chatId, getExamplesText(), getBackKeyboard());
      break;
      
    case 'tariffs':
      await отправитьСообщение(chatId, getTariffsText(), getMainKeyboard());
      break;
      
    case 'free':
    case 'basic':
    case 'pro':
    case 'premium':
      await handleTariffSelection(userId, chatId, callbackData);
      break;
      
    default:
      await отправитьСообщение(chatId, 'Неизвестная команда', getMainKeyboard());
      break;
  }
}
