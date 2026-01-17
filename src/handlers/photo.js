import { отправитьСообщение, получитьФайлТелеграм } from '../../utils/telegram-api.js';
import { User, Analysis } from '../database/models/index.js';
import { getProcessingText, getCompletionText, getErrorText } from '../utils/text-templates.js';
import { analyzePhotoWithAI } from '../services/ai-service.js';
import { getBackKeyboard } from '../keyboards/main.js';

export async function handlePhoto(userId, chatId, photo, tariff) {
  try {
    // 1. Получаем информацию о пользователе
    const user = await User.findByTelegramId(userId);
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    
    // 2. Проверяем лимиты для бесплатного тарифа
    if (tariff === 'free') {
      const freeCount = await User.getFreeAnalysesCount(user.id);
      const maxFree = process.env.MAX_FREE_ANALYSES || 1;
      
      if (freeCount >= maxFree) {
        await отправитьСообщение(chatId,
          `❌ <b>Лимит бесплатных анализов исчерпан</b>\n\n` +
          `Вы использовали ${freeCount} из ${maxFree} бесплатных анализов.\n` +
          `Пожалуйста, выберите платный тариф для продолжения.`,
          getBackKeyboard()
        );
        return;
      }
    }
    
    // 3. Получаем URL фото
    const fileUrl = await получитьФайлТелеграм(photo.file_id);
    
    // 4. Создаем запись об анализе в БД
    const analysis = await Analysis.create(user.id, {
      tariff,
      photo_url: fileUrl,
      status: 'processing'
    });
    
    // 5. Сообщаем о начале обработки
    await отправитьСообщение(chatId, getProcessingText(tariff), getBackKeyboard());
    
    // 6. Выполняем анализ через ИИ
    const aiResult = await analyzePhotoWithAI(fileUrl, tariff);
    
    // 7. Обновляем запись анализа с результатами
    await Analysis.updateStatus(analysis.id, 'completed', {
      face_shape: aiResult.face_shape,
      recommendations: aiResult.recommendations
    });
    
    // 8. Отправляем результат пользователю
    await отправитьСообщение(
      chatId, 
      getCompletionText(aiResult, tariff),
      getBackKeyboard()
    );
    
  } catch (error) {
    console.error('Ошибка обработки фото:', error);
    
    await отправитьСообщение(
      chatId,
      getErrorText(error.message),
      getBackKeyboard()
    );
  }
}
