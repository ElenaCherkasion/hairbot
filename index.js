// Проверка согласий перед любым действием
async function requireConsents(userId, chatId, actionType = "действие") {
  const hasConsents = await hasAllConsents(userId);
  
  if (!hasConsents) {
    const existingConsents = await checkExistingConsents(userId);
    const missingConsents = [];
    
    if (!existingConsents.pd_processing) {
      missingConsents.push("Обработка персональных данных");
    }
    if (!existingConsents.third_party_transfer) {
      missingConsents.push("Передача данных третьим лицам");
    }
    
    let message = `❌ <b>Необходимо дать согласие на обработку персональных данных</b>\n\n`;
    
    if (missingConsents.length > 0) {
      message += `Отсутствуют следующие согласия:\n`;
      missingConsents.forEach((consent, index) => {
        message += `${index + 1}. ${consent}\n`;
      });
    }
    
    message += `\nДля продолжения выберите тариф и пройдите процедуру согласия.`;
    
    await sendMessage(chatId, message, {
      inline_keyboard: [
        [{ text: "📋 Пройти процедуру согласия", callback_data: "start_consent_flow" }],
        [{ text: "🔒 Политика конфиденциальности", url: PRIVACY_POLICY_URL }],
        [{ text: "🏠 Главное меню", callback_data: "menu" }]
      ]
    });
    
    return false;
  }
  
  return true;
}

// ================== ОБНОВЛЕННЫЕ ОБРАБОТЧИКИ ==================

async function handleTariffSelection(userId, chatId, tariff) {
  // Для бесплатного тарифа сразу начинаем согласия
  if (tariff === 'free') {
    const used = await isFreeUsed(userId);
    if (used) {
      await sendMessage(chatId, 
        `❌ <b>Бесплатный анализ уже использован</b>\n\n` +
        "Бесплатный анализ доступен только один раз.\n" +
        "Выберите платный тариф для продолжения:",
        MAIN_KEYBOARD
      );
      return;
    }
    
    // Начинаем процедуру согласия
    await startConsentFlow(userId, chatId, 'free');
    
  } else {
    // Для платных тарифов проверяем согласия
    const hasConsents = await hasAllConsents(userId);
    
    if (!hasConsents) {
      // Согласий нет - предлагаем пройти процедуру
      await sendMessage(chatId,
        `💰 <b>Тариф: ${tariff.toUpperCase()}</b>\n\n` +
        `❌ <b>Необходимо дать согласие на обработку данных</b>\n\n` +
        `Перед оплатой тарифа необходимо дать согласие на:\n` +
        `1. Обработку персональных данных\n` +
        `2. Передачу данных третьим лицам\n\n` +
        `Нажмите кнопку ниже, чтобы пройти процедуру согласия:`,
        {
          inline_keyboard: [
            [{ text: "✅ Пройти процедуру согласия", callback_data: `consent_before_pay_${tariff}` }],
            [{ text: "🔒 Политика конфиденциальности", url: PRIVACY_POLICY_URL }],
            [{ text: "🏠 Главное меню", callback_data: "menu" }]
          ]
        }
      );
      return;
    }
    
    // Согласия есть - отправляем инвойс
    if (!PROVIDER_TOKEN) {
      await sendMessage(chatId,
        `❌ <b>Оплата временно недоступна</b>\n\n`,
        MAIN_KEYBOARD
      );
      return;
    }
    
    await sendInvoice(userId, chatId, tariff);
  }
}

// Новая функция: начало процедуры согласия
async function startConsentFlow(userId, chatId, tariff = null) {
  // Получаем имя пользователя для персонализации
  const userInfo = await tgApi('getChat', { chat_id: userId });
  const userName = userInfo.result?.first_name || userInfo.result?.username || "";
  
  // Сохраняем состояние
  setUserState(userId, {
    mode: tariff,
    awaitingConsent: true,
    currentConsentStep: 1,
    consentsGranted: {},
    inConsentFlow: true
  });
  
  // Показываем первый экран согласия
  await showConsentScreen1(userId, chatId, userName);
}

// Обновленная обработка согласий
async function handleConsentResponse(userId, chatId, granted, callbackId = null) {
  const state = userState.get(userId);
  
  if (!state || !state.awaitingConsent) {
    await sendMessage(chatId, "Что-то пошло не так. Начните заново /start");
    if (callbackId) await answerCallbackQuery(callbackId, "Ошибка, начните заново");
    return;
  }
  
  const currentStep = state.currentConsentStep;
  let consentType;
  
  switch(currentStep) {
    case 1:
      consentType = 'pd_processing';
      break;
    case 2:
      consentType = 'third_party_transfer';
      break;
    default:
      if (callbackId) await answerCallbackQuery(callbackId, "Неизвестный шаг");
      return;
  }
  
  // Сохраняем согласие в БД
  await saveConsent(userId, consentType, granted);
  
  if (!granted) {
    // Отказ
    await sendMessage(chatId,
      `❌ <b>Согласие не получено</b>\n\n` +
      `Для использования сервиса необходимо дать согласие на обработку персональных данных.\n\n` +
      `Вы можете ознакомиться с политикой конфиденциальности или связаться с поддержкой.`,
      AFTER_REFUSAL_KEYBOARD
    );
    
    if (callbackId) await answerCallbackQuery(callbackId, "Согласие отклонено", true);
    clearUserState(userId);
    return;
  }
  
  if (callbackId) await answerCallbackQuery(callbackId, `Согласие ${currentStep}/2 получено`);
  
  // Обновляем состояние
  setUserState(userId, {
    ...state,
    consentsGranted: {
      ...state.consentsGranted,
      [consentType]: true
    }
  });
  
  // Проверяем, все ли согласия получены
  const newState = userState.get(userId);
  const allGranted = Object.values(newState.consentsGranted).every(Boolean);
  
  if (allGranted) {
    // Все согласия получены
    const tariff = newState.mode;
    
    if (tariff === 'free') {
      // Для free - просим фото
      await sendMessage(chatId,
        `✅ <b>Все согласия получены!</b>\n\n` +
        `Теперь вы можете отправить фото лица для бесплатного анализа.\n\n` +
        `📸 <b>Отправьте фото лица:</b>\n` +
        `• Лицо анфас\n` +
        `• Хорошее освещение\n` +
        `• Чёткое изображение`,
        BACK_KEYBOARD
      );
      
      setUserState(userId, {
        ...newState,
        awaitingConsent: false,
        awaitingPhoto: true,
        inConsentFlow: false
      });
      
    } else if (tariff) {
      // Для платного тарифа - отправляем инвойс
      await sendMessage(chatId,
        `✅ <b>Все согласия получены!</b>\n\n` +
        `Теперь вы можете оплатить тариф "${tariff.toUpperCase()}".\n` +
        `Нажмите кнопку ниже для оплаты:`,
        {
          inline_keyboard: [
            [{ text: `💳 Оплатить ${tariff.toUpperCase()}`, callback_data: `pay_after_consent_${tariff}` }],
            [{ text: "🏠 Главное меню", callback_data: "menu" }]
          ]
        }
      );
      
      setUserState(userId, {
        ...newState,
        awaitingConsent: false,
        inConsentFlow: false
      });
      
    } else {
      // Просто завершили согласия без тарифа
      await sendMessage(chatId,
        `✅ <b>Все согласия получены!</b>\n\n` +
        `Теперь вы можете выбрать тариф и начать анализ.`,
        MAIN_KEYBOARD
      );
      
      clearUserState(userId);
    }
    
  } else {
    // Показываем следующий экран согласия
    await showNextConsentScreen(userId, chatId, currentStep + 1);
  }
}

// ================== ОБНОВЛЕННЫЙ ОБРАБОТЧИК КОЛБЭКОВ ==================

// В функции handleUpdate, в блоке обработки callback_query:

if (update.callback_query) {
  const callback = update.callback_query;
  const userId = callback.from.id;
  const chatId = callback.message.chat.id;
  const data = callback.data;
  
  await answerCallbackQuery(callback.id);
  
  console.log(`🔄 Callback: ${data} от user ${userId}`);
  
  // Обработка команд меню
  if (data === 'menu') {
    await handleStart(userId, chatId);
  }
  else if (data === 'about_service') {
    await handleAboutService(userId, chatId);
  }
  else if (data === 'tariffs_info') {
    await handleTariffsInfo(userId, chatId);
  }
  else if (data === 'examples') {
    await handleExamples(userId, chatId);
  }
  else if (data.startsWith('mode_free') || data === 'tariff_free') {
    await handleTariffSelection(userId, chatId, 'free');
  }
  else if (data.startsWith('tariff_')) {
    const tariff = data.replace('tariff_', '');
    if (['basic', 'pro', 'premium'].includes(tariff)) {
      await handleTariffSelection(userId, chatId, tariff);
    }
  }
  else if (data === 'start_consent_flow') {
    // Начало процедуры согласия из меню
    await startConsentFlow(userId, chatId);
  }
  else if (data.startsWith('consent_before_pay_')) {
    // Согласия перед оплатой
    const tariff = data.replace('consent_before_pay_', '');
    await startConsentFlow(userId, chatId, tariff);
  }
  else if (data.startsWith('pay_after_consent_')) {
    // Оплата после получения согласий
    const tariff = data.replace('pay_after_consent_', '');
    const hasConsents = await hasAllConsents(userId);
    
    if (!hasConsents) {
      await sendMessage(chatId,
        "❌ <b>Согласия не получены</b>\n\n" +
        "Пройдите процедуру согласия перед оплатой.",
        {
          inline_keyboard: [
            [{ text: "✅ Пройти процедуру согласия", callback_data: `consent_before_pay_${tariff}` }]
          ]
        }
      );
      return;
    }
    
    if (!PROVIDER_TOKEN) {
      await sendMessage(chatId, "❌ Оплата временно недоступна", MAIN_KEYBOARD);
      return;
    }
    
    await sendInvoice(userId, chatId, tariff);
  }
  else if (data === 'consent_yes') {
    await handleConsentResponse(userId, chatId, true, callback.id);
  }
  else if (data === 'consent_no') {
    await handleConsentResponse(userId, chatId, false, callback.id);
  }
  else if (data === 'generate_images') {
    // Проверяем согласия перед генерацией изображений
    const hasConsents = await hasAllConsents(userId);
    if (!hasConsents) {
      await sendMessage(chatId,
        "❌ <b>Доступ запрещён</b>\n\n" +
        "Для генерации изображений необходимо дать согласие на обработку персональных данных.",
        {
          inline_keyboard: [
            [{ text: "📋 Пройти процедуру согласия", callback_data: "start_consent_flow" }]
          ]
        }
      );
      return;
    }
    await handleGenerateImages(userId, chatId);
  }
  else {
    await sendMessage(chatId, "❌ Неизвестная команда", BACK_KEYBOARD);
  }
}

// ================== ОБНОВЛЕННАЯ ОБРАБОТКА ФОТО ==================

async function handlePhoto(userId, chatId, photo) {
  // 1. Проверяем согласия
  const hasConsents = await hasAllConsents(userId);
  
  if (!hasConsents) {
    await sendMessage(chatId,
      `❌ <b>Необходимо дать согласие на обработку данных</b>\n\n` +
      `Перед отправкой фото необходимо дать согласие на:\n` +
      `1. Обработку персональных данных\n` +
      `2. Передачу данных третьим лицам\n\n` +
      `Выберите тариф и пройдите процедуру согласия:`,
      {
        inline_keyboard: [
          [{ text: "🎁 Начать бесплатный анализ", callback_data: "mode_free" }],
          [{ text: "📋 Пройти процедуру согласия", callback_data: "start_consent_flow" }],
          [{ text: "🔒 Политика конфиденциальности", url: PRIVACY_POLICY_URL }]
        ]
      }
    );
    return;
  }
  
  // 2. Проверяем состояние пользователя
  const state = userState.get(userId);
  
  if (!state?.awaitingPhoto) {
    await sendMessage(chatId, 
      "📸 Сначала выберите тариф в меню.", 
      MAIN_KEYBOARD
    );
    return;
  }
  
  // 3. Проверяем размер фото
  if (photo.file_size && photo.file_size < 50000) {
    await sendMessage(chatId,
      "❌ <b>Фото слишком маленькое</b>\n\n" +
      "Пожалуйста, отправьте фото большего размера.",
      BACK_KEYBOARD
    );
    return;
  }
  
  // 4. Логируем обработку файла
  await logFileProcessing(userId, photo.file_id, 'photo');
  
  // 5. Начинаем обработку
  try {
    await sendMessage(chatId, 
      "⏳ <b>Загружаю фото...</b>",
      BACK_KEYBOARD
    );
    
    // ... остальная логика обработки фото ...
    
  } catch (error) {
    console.error("❌ Ошибка обработки фото:", error.message);
    await sendMessage(chatId,
      "❌ <b>Произошла ошибка при обработке</b>\n\n" +
      "Попробуйте другое фото или обратитесь в поддержку.",
      BACK_KEYBOARD
    );
  }
}

// ================== ОБНОВЛЕННОЕ ГЛАВНОЕ МЕНЮ ==================

const MAIN_KEYBOARD = {
  inline_keyboard: [
    [{ text: "📋 О сервисе HAIRbot", callback_data: "about_service" }],
    [{ text: "💰 Сравнение тарифов", callback_data: "tariffs_info" }],
    [{ text: "📚 Примеры разборов", callback_data: "examples" }],
    [{ text: "🎁 Пробный Free", callback_data: "mode_free" }],
    [{ text: "💎 BASIC - 299₽", callback_data: "tariff_basic" }],
    [{ text: "✨ PRO - 599₽", callback_data: "tariff_pro" }],
    [{ text: "👑 PREMIUM - 999₽", callback_data: "tariff_premium" }],
    [{ text: "🔒 Политика конфиденциальности", url: PRIVACY_POLICY_URL }],
    [{ text: "📝 Пройти процедуру согласия", callback_data: "start_consent_flow" }]
  ]
};

// ================== НОВАЯ ФУНКЦИЯ ДЛЯ /start ==================

async function handleStart(userId, chatId) {
  // Получаем имя пользователя
  const userInfo = await tgApi('getChat', { chat_id: userId });
  const userName = userInfo.result?.first_name || userInfo.result?.username || "";
  
  // Проверяем, есть ли согласия
  const hasConsents = await hasAllConsents(userId);
  
  let message = `👋 ${userName ? userName + ", " : ""}<b>Добро пожаловать в HAIRbot!</b>\n\n`;
  
  if (hasConsents) {
    message += `✅ <b>Ваши согласия получены</b>\n\n`;
  } else {
    message += `📋 <b>Перед началом работы необходимо дать согласие на обработку персональных данных</b>\n\n`;
  }
  
  message += `Я помогу подобрать идеальную стрижку по форме вашего лица.\n`;
  message += `Выберите действие:`;
  
  await sendMessage(chatId, message, MAIN_KEYBOARD);
}

// ================== ОБНОВЛЕННАЯ ОБРАБОТКА УСПЕШНОЙ ОПЛАТЫ ==================

async function handleSuccessfulPayment(userId, chatId, paymentData) {
  try {
    const payload = paymentData.invoice_payload;
    const [tariff, userIdFromPayload] = payload.split('_');
    
    if (parseInt(userIdFromPayload) !== userId) {
      console.error("❌ Несоответствие userId в payload");
      return;
    }
    
    // Сохраняем платеж
    await createPayment(
      userId, 
      paymentData.total_amount / 100, 
      tariff, 
      `telegram_${paymentData.telegram_payment_charge_id || Date.now()}`
    );
    
    // Проверяем согласия (должны быть, но на всякий случай)
    const hasConsents = await hasAllConsents(userId);
    
    if (!hasConsents) {
      // Если почему-то согласий нет - просим их
      await sendMessage(chatId,
        `✅ <b>Оплата подтверждена!</b>\n` +
        `❌ <b>Но отсутствуют согласия на обработку данных</b>\n\n` +
        `Пройдите процедуру согласия, чтобы начать анализ:`,
        {
          inline_keyboard: [
            [{ text: "📝 Пройти процедуру согласия", callback_data: `consent_before_pay_${tariff}` }]
          ]
        }
      );
      return;
    }
    
    // Все готово - просим фото
    await sendMessage(chatId,
      `✅ <b>Оплата подтверждена!</b>\n` +
      `Тариф "${tariff.toUpperCase()}" активирован.\n\n` +
      `📸 <b>Отправьте фото лица для анализа:</b>\n` +
      `• Лицо анфас\n` +
      `• Хорошее освещение\n` +
      `• Чёткое изображение`,
      BACK_KEYBOARD
    );
    
    setUserState(userId, {
      mode: tariff,
      awaitingPhoto: true
    });
    
  } catch (error) {
    console.error("❌ Ошибка обработки платежа:", error.message);
    await sendMessage(chatId, "❌ Ошибка обработки платежа", MAIN_KEYBOARD);
  }
}
