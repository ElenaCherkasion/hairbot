import { 
  отправитьСообщение, 
  получитьФайлТелеграм, 
  отправитьДействие 
} from '../../../utils/telegram-api.js';
import { getProcessingText, getResultText, getErrorText } from '../utils/text-templates.js';
import { getBackKeyboard } from '../keyboards/main.js';
import { analyzeFaceWithOpenAI } from '../services/ai-service.js';

export async function handlePhoto(userId, chatId, photoInfo, tariff = 'free') {
  try {
    // Сообщаем, что бот "печатает"
    await отправитьДействие(chatId, 'upload_photo');
    
    // Получаем URL фото
    const photoUrl = await получитьФайлТелеграм(photoInfo.file_id);
    console.log(`📸 Получено фото от ${userId}, URL: ${photoUrl.substring(0, 50)}...`);
    
    // Отправляем сообщение о начале обработки
    await отправитьСообщение(chatId, getProcessingText(tariff), getBackKeyboard());
    
    // Анализ через OpenAI
    const aiResult = await analyzeFaceWithOpenAI(photoUrl, tariff);
    
    if (!aiResult.success && !aiResult.is_test_data) {
      throw new Error('Ошибка анализа: ' + aiResult.error);
    }
    
    // Отправляем результат
    const resultText = getResultText(aiResult.data, tariff);
    await отправитьСообщение(chatId, resultText, getBackKeyboard());
    
    console.log(`✅ Анализ завершен для пользователя ${userId}, тариф: ${tariff}`);
    
  } catch (error) {
    console.error('❌ Ошибка обработки фото:', error);
    
    // Отправляем сообщение об ошибке
    await отправитьСообщение(
      chatId, 
      getErrorText('general'), 
      getBackKeyboard()
    );
  }
}
