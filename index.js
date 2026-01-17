#!/usr/bin/env node
// index.js - КОРНЕВОЙ ЗАПУСКАТЕЛЬ HAIRBOT

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  console.log('🚀 =================================');
  console.log('🚀 ЗАПУСК HAIRBOT');
  console.log('🚀 =================================\n');

  // 1. БАЗОВАЯ ИНФОРМАЦИЯ О ЗАПУСКЕ
  console.log('📊 Информация о системе:');
  console.log('   Время запуска:', new Date().toLocaleString());
  console.log('   Node.js:', process.version);
  console.log('   Платформа:', process.platform, process.arch);
  console.log('   NODE_ENV:', process.env.NODE_ENV || 'production');
  console.log('   PORT:', process.env.PORT || 3000);
  console.log('   Рабочая директория:', __dirname);

  // 2. ПРОВЕРКА КРИТИЧЕСКИ ВАЖНЫХ ФАЙЛОВ
  console.log('\n🔍 Проверка структуры проекта:');
  const criticalFiles = [
    { path: 'src/index.js', name: 'Основное приложение' },
    { path: 'src/database/connection.js', name: 'Подключение к БД' },
    { path: 'src/utils/logger.js', name: 'Система логирования' },
    { path: 'src/handlers/', name: 'Обработчики команд', type: 'dir' },
    { path: 'package.json', name: 'Конфигурация проекта' }
  ];

  let hasErrors = false;
  criticalFiles.forEach(item => {
    const fullPath = join(__dirname, item.path);
    const exists = fs.existsSync(fullPath);
    
    if (item.type === 'dir') {
      const isDir = exists && fs.statSync(fullPath).isDirectory();
      console.log(`   ${isDir ? '✅' : '❌'} ${item.name}`);
      if (!isDir) hasErrors = true;
    } else {
      console.log(`   ${exists ? '✅' : '❌'} ${item.name}`);
      if (!exists) hasErrors = true;
    }
  });

  if (hasErrors) {
    console.error('\n❌ Критические файлы отсутствуют!');
    console.error('   Проверьте структуру проекта');
    process.exit(1);
  }

  // 3. ПРОВЕРКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ
  console.log('\n🔐 Проверка переменных окружения:');

  const telegramToken = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const openaiKey = process.env.OPENAI_API_KEY;

  console.log(`   ${telegramToken ? '✅' : '❌'} Telegram Token: ${telegramToken ? 'установлен' : 'ОТСУТСТВУЕТ'}`);
  console.log(`   ${openaiKey ? '✅' : '❌'} OpenAI API Key: ${openaiKey ? 'установлен' : 'ОТСУТСТВУЕТ'}`);

  if (!telegramToken || !openaiKey) {
    console.error('\n⚠️  Внимание: отсутствуют обязательные переменные!');
    console.error('   Бот не сможет работать без:');
    if (!telegramToken) console.error('   - TELEGRAM_TOKEN или TELEGRAM_BOT_TOKEN');
    if (!openaiKey) console.error('   - OPENAI_API_KEY');
    console.error('\n💡 Добавьте их в Render Dashboard → Environment');
    
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.log('   ⚠️  Продолжаем в режиме development...');
    }
  }

  // 4. СОЗДАНИЕ НЕОБХОДИМЫХ ДИРЕКТОРИЙ
  console.log('\n📁 Подготовка директорий:');
  const requiredDirs = ['logs', 'database', 'backups'];
  requiredDirs.forEach(dir => {
    const dirPath = join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`   ✅ Создана: ${dir}/`);
      } catch (error) {
        console.log(`   ⚠️  Не удалось создать ${dir}/: ${error.message}`);
      }
    } else {
      console.log(`   ✅ Существует: ${dir}/`);
    }
  });

  // 5. ПЕРЕХОД В ПАПКУ SRC ДЛЯ ПРАВИЛЬНЫХ ПУТЕЙ
  console.log('\n🔄 Переход в рабочую директорию...');
  try {
    const srcDir = join(__dirname, 'src');
    
    if (!fs.existsSync(srcDir)) {
      throw new Error(`Папка src не найдена: ${srcDir}`);
    }
    
    process.chdir(srcDir);
    console.log('✅ Успешно перешли в папку src');
    console.log('   Текущая директория:', process.cwd());
    
  } catch (error) {
    console.error(`❌ Ошибка перехода в папку src: ${error.message}`);
    process.exit(1);
  }

  // 6. ЗАПУСК ОСНОВНОГО ПРИЛОЖЕНИЯ
  console.log('\n🎯 ЗАПУСК ОСНОВНОГО ПРИЛОЖЕНИЯ');
  console.log('========================================\n');

  try {
    // Импортируем основной модуль
    console.log('📦 Импортируем src/index.js...');
    const appModule = await import('./index.js');
    
    // ДЕБАГ: покажем что импортировалось
    console.log('🔍 Доступные экспорты:', Object.keys(appModule));
    
    // Ищем функцию запуска
    const startFunction = appModule.startBot;
    
    if (typeof startFunction === 'function') {
      console.log('✅ Функция startBot найдена!');
      console.log('🚀 Запускаем бота...\n');
      await startFunction();
    } else {
      console.error('❌ ОШИБКА: startBot не является функцией!');
      console.error('Тип startBot:', typeof startFunction);
      console.error('Все экспорты:', appModule);
      
      // Попробуем найти любую функцию
      const allExports = Object.keys(appModule);
      for (const exportName of allExports) {
        if (typeof appModule[exportName] === 'function') {
          console.log(`Найдена функция ${exportName}, пробуем запустить...`);
          try {
            await appModule[exportName]();
            return;
          } catch (error) {
            console.error(`Функция ${exportName} завершилась с ошибкой:`, error.message);
          }
        }
      }
      
      process.exit(1);
    }
    
    // УСПЕШНЫЙ ЗАПУСК
    console.log('\n========================================');
    console.log('✅ HAIRBOT УСПЕШНО ЗАПУЩЕН!');
    console.log('🤖 Бот готов к работе');
    console.log('========================================\n');
    
    // Информация для админа
    if (telegramToken) {
      const botId = telegramToken.split(':')[0];
      console.log(`   Bot ID: ${botId}`);
    }
    
    console.log(`   Режим: ${process.env.NODE_ENV || 'production'}`);
    console.log(`   Health check: http://localhost:${process.env.PORT || 3000}/health`);
    
    if (process.env.WEBHOOK_URL) {
      console.log(`   Webhook: ${process.env.WEBHOOK_URL}`);
    } else {
      console.log('   Режим подключения: Polling');
    }
    
  } catch (error) {
    // ОБРАБОТКА ОШИБОК ЗАПУСКА
    console.error('\n❌ ОШИБКА ЗАПУСКА ПРИЛОЖЕНИЯ:');
    console.error('   Сообщение:', error.message);
    
    // Детальный анализ для распространенных ошибок
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      console.error('   Тип: MODULE_NOT_FOUND (модуль не найден)');
      
      // Извлекаем путь из сообщения об ошибке
      const match = error.message.match(/Cannot find module '([^']+)'/);
      if (match) {
        const missingModule = match[1];
        console.error(`   Отсутствующий модуль: ${missingModule}`);
        
        // Подсказки для распространенных проблем
        if (missingModule.includes('config.js')) {
          console.error('   💡 Решение: Создайте файл src/config.js или удалите его импорт из src/index.js');
        } else if (missingModule.includes('telegraf')) {
          console.error('   💡 Решение: Установите зависимость: npm install telegraf');
        } else if (missingModule.includes('openai')) {
          console.error('   💡 Решение: Установите зависимость: npm install openai');
        }
      }
    } else if (error.message.includes('sequelize')) {
      console.error('   💡 Проблема с базой данных. Проверьте DATABASE_URL');
    } else if (error.message.includes('token')) {
      console.error('   💡 Проблема с токеном бота. Проверьте TELEGRAM_TOKEN');
    } else if (error.message.includes('startBot')) {
      console.error('   💡 Проблема с функцией startBot. Проверьте что она правильно экспортируется');
    }
    
    console.error('\n🔧 Stack trace для отладки:');
    console.error(error.stack);
    
    process.exit(1);
  }
}

// Запускаем main функцию
main().catch(error => {
  console.error('❌ Необработанная ошибка в main():', error);
  process.exit(1);
});

// GRACEFUL SHUTDOWN - КОРРЕКТНОЕ ЗАВЕРШЕНИЕ
process.on('SIGINT', () => {
  console.log('\n\n🛑 Получен SIGINT. Корректное завершение работы...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Получен SIGTERM. Корректное завершение работы...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('\n💥 НЕОБРАБОТАННОЕ ИСКЛЮЧЕНИЕ:');
  console.error('   Сообщение:', error.message);
  console.error('   Stack trace:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 НЕОБРАБОТАННЫЙ REJECTION:');
  console.error('   Причина:', reason);
  process.exit(1);
});
