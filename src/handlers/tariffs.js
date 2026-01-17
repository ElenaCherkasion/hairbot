import { отправитьСообщение } from '../../utils/telegram-api.js';
import { getBackKeyboard } from '../keyboards/main.js';
import { getPhotoUploadText } from '../utils/text-templates.js';
import { User } from '../database/models/index.js';

export async function handleTariffSelection(userId, chatId, tariff) {
  try {
    // Проверяем лимиты для бесплатного тарифа
    if (tariff === 'free') {
      const user = await User.findByTelegramId(userId);
      if (user) {
        const freeAnalysesCount = await User.getFreeAnalysesCount(user.id);
        const maxFree = parseInt(process.env.MAX_FREE_ANALYSES) || 1;
        
        if (freeAnalysesCount >= maxFree) {
          await отправитьСообщение(chatId, 
            `❌ <b>Лимит бесплатных анализов исчерпан</b>\n\n` +
            `Вы использовали ${freeAnalysesCount} из ${maxFree} бесплатных анализов.\n` +
            `Пожалуйста, выберите платный тариф для продолжения.`,
            getBackKeyboard()
          );
          return;
        }
      }
    }
    
    // Для платных тарифов в тестовом режиме
    if (tariff !== 'free' && process.env.TEST_PAYMENT_MODE === 'true') {
      await отправитьСообщение(chatId,
        `💳 <b>Оплата тарифа ${tariff.toUpperCase()}</b>\n\n` +
        `В тестовом режиме оплата временно недоступна.\n\n` +
        `📧 <b>Для тестирования свяжитесь с поддержкой:</b>\n` +
        `${process.env.SUPPORT_EMAIL || 'cherkashina720@gmail.com'}`,
        getBackKeyboard()
      );
      return;
    }
    
    // Сохраняем выбор тарифа в состоянии пользователя
    // (в реальном проекте это было бы в БД или сессии)
    const userState = {
      selectedTariff: tariff,
      awaitingPhoto: true,
      timestamp: Date.now()
    };
    
    // В реальном проекте сохраняли бы в БД или Redis
    // await UserState.save(userId, userState);
    
    // Отправляем инструкцию по загрузке фото
    await отправитьСообщение(chatId, getPhotoUploadText(tariff), getBackKeyboard());
    
  } catch (error) {
    console.error('Ошибка выбора тарифа:', error);
    await отправитьСообщение(chatId,
      '❌ Произошла ошибка при выборе тарифа. Пожалуйста, попробуйте еще раз.',
      getBackKeyboard()
    );
  }
}
