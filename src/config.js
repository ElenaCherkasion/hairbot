import dotenv from 'dotenv';
dotenv.config();

// ================== КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ ==================
export const КОНФИГ = {
  // === TELEGRAM ===
  ТОКЕН_ТЕЛЕГРАМ: process.env.TELEGRAM_TOKEN,
  
  // === OPENAI ===
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL_VISION: process.env.OPENAI_MODEL_VISION || 'gpt-4o-mini',
  OPENAI_MODEL_TEXT: process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL || 'dall-e-3',
  OPENAI_MAX_TOKENS: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
  
  // === APP ===
  ПОРТ: process.env.PORT || 3000,
  ПОЧТА_ПОДДЕРЖКИ: process.env.SUPPORT_EMAIL || 'cherkashina720@gmail.com',
  ДОМЕН: process.env.RENDER_EXTERNAL_HOSTNAME || `localhost:${process.env.PORT || 3000}`,
  ССЫЛКА_ПОЛИТИКА: process.env.PRIVACY_POLICY_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME || `localhost:${process.env.PORT || 3000}`}/privacy`,
  
  // === SETTINGS ===
  ТАЙМАУТ: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
  ФОТО_ТАЙМАУТ: parseInt(process.env.PHOTO_UPLOAD_TIMEOUT) || 10,
  РЕЖИМ_ОТЛАДКИ: process.env.DEBUG_MODE === 'true',
  ТЕСТ_ПЛАТЕЖИ: process.env.TEST_PAYMENT_MODE === 'true',
  ОКРУЖЕНИЕ: process.env.NODE_ENV || 'development',
  ЛОГ_УРОВЕНЬ: process.env.LOG_LEVEL || 'INFO',
  
  // === LIMITS ===
  МАКС_РАЗМЕР_ФОТО: parseInt(process.env.MAX_PHOTO_SIZE) || 5, // MB
  МАКС_БЕСПЛАТНЫЕ: parseInt(process.env.MAX_FREE_ANALYSES) || 1,
  
  // === CLEANUP ===
  ОЧИСТКА_ЧАСЫ: parseInt(process.env.STATE_CLEANUP_HOURS) || 24,
  
  // === DATABASE ===
  БД_SSL: process.env.DATABASE_SSL === 'true',
  БД_ХОСТ: process.env.DB_HOST || 'localhost',
  БД_ПОРТ: process.env.DB_PORT || 3306,
  БД_ИМЯ: process.env.DB_NAME || 'hairbot',
  БД_ПОЛЬЗОВАТЕЛЬ: process.env.DB_USER || 'root',
  БД_ПАРОЛЬ: process.env.DB_PASSWORD || '',
  БД_URL: process.env.DATABASE_URL
};

// ================== ПРОВЕРКА КОНФИГУРАЦИИ ==================
export function проверитьКонфигурацию() {
  const ошибки = [];
  
  if (!КОНФИГ.ТОКЕН_ТЕЛЕГРАМ) {
    ошибки.push('❌ TELEGRAM_TOKEN не установлен');
  }
  
  if (!КОНФИГ.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY не установлен, AI функции будут недоступны');
  }
  
  if (КОНФИГ.ТЕСТ_ПЛАТЕЖИ) {
    console.log('💰 ТЕСТОВЫЙ РЕЖИМ ПЛАТЕЖЕЙ: Включен');
  }
  
  if (ошибки.length > 0) {
    console.error('КРИТИЧЕСКИЕ ОШИБКИ КОНФИГУРАЦИИ:');
    ошибки.forEach(ошибка => console.error(ошибка));
    return false;
  }
  
  console.log(`✅ Конфигурация загружена. Режим: ${КОНФИГ.ОКРУЖЕНИЕ}`);
  return true;
}

// ================== СЛУЖЕБНЫЕ ФУНКЦИИ ==================
export function получитьСсылку(путь = '') {
  const протокол = КОНФИГ.ОКРУЖЕНИЕ === 'production' ? 'https' : 'http';
  return `${протокол}://${КОНФИГ.ДОМЕН}${путь ? '/' + пусть : ''}`;
}

export function вРежимеРазработки() {
  return КОНФИГ.ОКРУЖЕНИЕ === 'development';
}

export function вРежимеПродакшена() {
  return КОНФИГ.ОКРУЖЕНИЕ === 'production';
}

export default КОНФИГ;

