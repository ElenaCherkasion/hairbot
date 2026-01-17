import { отправитьСообщение } from '../utils/telegram-api.js';
import { getMainKeyboard } from '../keyboards/main.js';
import { getWelcomeText } from '../utils/text-templates.js';

export async function handleStart(userId, chatId) {
  try {
    const welcomeText = getWelcomeText();
    const keyboard = getMainKeyboard();
    
    const результат = await отправитьСообщение(chatId, welcomeText, keyboard);
    
    if (!результат.ok) {
      console.error('❌ Ошибка отправки приветствия:', результат.описание);
      // Пробуем отправить без HTML
      await отправитьСообщение(chatId, 
        '👋 Добро пожаловать в HAIRbot! Используйте кнопки меню для навигации.',
        keyboard
      );
    }
  } catch (error) {
    console.error('❌ Критическая ошибка в handleStart:', error);
  }
}
