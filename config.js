import dotenv from 'dotenv';
dotenv.config();

export const КОНФИГ = {
  // Telegram
  ТОКЕН_ТЕЛЕГРАМ: process.env.TELEGRAM_TOKEN,
  
  // OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL_VISION: process.env.OPENAI_MODEL_VISION || "gpt-4o-mini",
  OPENAI_MODEL_TEXT: process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini",
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL || "dall-e-3",
  OPENAI_MAX_TOKENS: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
  
  // App
  ПОРТ: process.env.PORT || 3000,
  ПОЧТА_ПОДДЕРЖКИ: process.env.SUPPORT_EMAIL || "cherkashina720@gmail.com",
  ДОМЕН: process.env.RENDER_EXTERNAL_HOSTNAME || `localhost:${process.env.PORT || 3000}`,
  ССЫЛКА_ПОЛИТИКА: process.env.PRIVACY_POLICY_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME || `localhost:${process.env.PORT || 3000}`}/privacy`,
  
  // Settings
  ТАЙМАУТ: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
  ФОТО_ТАЙМАУТ: parseInt(process.env.PHOTO_UPLOAD_TIMEOUT) || 10,
  РЕЖИМ_ОТЛАДКИ: process.env.DEBUG_MODE === 'true',
  ТЕСТ_ПЛАТЕЖИ: process.env.TEST_PAYMENT_MODE === 'true',
  ОКРУЖЕНИЕ: process.env.NODE_ENV || 'development',
  
  // Limits
  МАКС_РАЗМЕР_ФОТО: parseInt(process.env.MAX_PHOTO_SIZE) || 5, // MB
  МАКС_БЕСПЛАТНЫЕ: parseInt(process.env.MAX_FREE_ANALYSES) || 1,
  
  // Cleanup
  ОЧИСТКА_ЧАСЫ: parseInt(process.env.STATE_CLEANUP_HOURS) || 24,
  
  // Database
  БД_SSL: process.env.DATABASE_SSL === 'true'
};

// Проверка обязательных переменных
if (!КОНФИГ.ТОКЕН_ТЕЛЕГРАМ) {
  console.error("❌ ОШИБКА: TELEGRAM_TOKEN не установлен");
  process.exit(1);
}

console.log(`✅ Конфигурация загружена. Режим: ${КОНФИГ.ОКРУЖЕНИЕ}`);
