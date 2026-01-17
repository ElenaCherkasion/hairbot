#!/usr/bin/env node
// index.js (КОРНЕВОЙ ФАЙЛ - ТОЛЬКО ЗАПУСК)

import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 =================================');
console.log('🚀 HAIRBOT - TELEGRAM БОТ ДЛЯ ПОДБОРА СТРИЖЕК');
console.log('🚀 =================================\n');

// Отладочная информация
console.log('📊 Информация о запуске:');
console.log('   Время:', new Date().toLocaleString());
console.log('   Node.js:', process.version);
console.log('   Платформа:', process.platform, process.arch);
console.log('   Память:', Math.round(process.memoryUsage().rss / 1024 / 1024), 'MB');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'production');
console.log('   PORT:', process.env.PORT || 3000);
console.log('   Рабочая директория:', __dirname);

// Проверка структуры проекта
console.log('\n🔍 Проверка структуры проекта:');
const checkPaths = [
  { path: 'src/', name: 'Папка с исходным кодом', type: 'dir' },
  { path: 'src/index.js', name: 'Основное приложение', type: 'file' },
  { path: 'src/config.js', name: 'Конфигурация', type: 'file' },
  { path: 'src/database/', name: 'Модели базы данных', type: 'dir' },
  { path: 'package.json', name: 'Конфигурация проекта', type: 'file' },
];

let allExists = true;
checkPaths.forEach(item => {
  const fullPath = join(__dirname, item.path);
  const exists = fs.existsSync(fullPath);
  const isCorrectType = exists && 
    ((item.type === 'dir' && fs.statSync(fullPath).isDirectory()) ||
     (item.type === 'file' && fs.statSync(fullPath).isFile()));
  
  const status = exists && isCorrectType ? '✅' : '❌';
  console.log(`   ${status} ${item.name}`);
  
  if (!exists || !isCorrectType) {
    allExists = false;
    if (!exists) {
      console.log(`      Файл/папка не существует: ${item.path}`);
    } else if (!isCorrectType) {
      console.log(`      Неверный тип: ожидается ${item.type}`);
    }
  }
});

if (!allExists) {
  console.error('\n❌ Критическая ошибка: некорректная структура проекта');
  console.error('   Проверьте наличие всех необходимых файлов и папок');
  process.exit(1);
}

// Проверка переменных окружения
console.log('\n🔐 Проверка переменных окружения:');
const requiredVars = [
  { name: 'TELEGRAM_BOT_TOKEN', aliases: ['TELEGRAM_TOKEN'] },
  { name: 'OPENAI_API_KEY', aliases: [] }
];

let allVarsOk = true;
requiredVars.forEach(variable => {
  const allNames = [variable.name, ...variable.aliases];
  const found = allNames.find(name => process.env[name]);
  
  if (found) {
    const value = process.env[found];
    const maskedValue = found.includes('TOKEN') || found.includes('KEY') 
      ? '••••••••' + value.substring(value.length - 4)
      : value;
    console.log(`   ✅ ${variable.name}: установлена (как ${found}=${maskedValue})`);
  } else {
    console.log(`   ❌ ${variable.name}: не установлена`);
    allVarsOk = false;
  }
});

if (!allVarsOk) {
  console.error('\n⚠️  Внимание: отсутствуют некоторые переменные окружения');
  console.error('   Бот может работать некорректно');
  console.error('   Проверьте настройки в Render Dashboard → Environment');
}

// Создаем необходимые директории
console.log('\n📁 Подготовка директорий:');
const requiredDirs = ['logs', 'backups', 'database'];
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

// Переходим в папку src для правильных относительных путей
const srcDir = join(__dirname, 'src');
console.log(`\n🔄 Переход в рабочую директорию: ${srcDir}`);

try {
  process.chdir(srcDir);
  console.log('✅ Успешно перешли в папку src');
} catch (error) {
  console.error(`❌ Ошибка перехода в папку src: ${error.message}`);
  process.exit(1);
}

// Запускаем основное приложение
console.log('\n🎯 ЗАПУСК ОСНОВНОГО ПРИЛОЖЕНИЯ');
console.log('========================================\n');

try {
  // Динамический импорт основного приложения
  const appModule = await import('./index.js');
  
  // Проверяем экспорты
  if (typeof appModule.startBot === 'function') {
    console.log('✅ Найдена функция startBot, запускаем...');
    await appModule.startBot();
  } else if (typeof appModule.default === 'function') {
    console.log('✅ Найдена default функция, запускаем...');
    await appModule.default();
  } else {
    console.log('ℹ️  Функция запуска не экспортирована, пытаемся запустить модуль...');
    // Модуль может запускаться самостоятельно при импорте
  }
  
  console.log('\n========================================');
  console.log('✅ Приложение успешно запущено!');
  console.log('🤖 Бот должен быть активен');
  
  // Информация для пользователя
  const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;
  if (botToken) {
    const botId = botToken.split(':')[0];
    console.log(`   Bot ID: ${botId}`);
  }
  
  if (process.env.WEBHOOK_URL) {
    console.log(`🌐 Webhook: ${process.env.WEBHOOK_URL}`);
  } else {
    console.log('🔄 Режим: Polling');
  }
  
  console.log(`📊 Health check: http://localhost:${process.env.PORT || 3000}/health`);
  console.log('========================================\n');
  
} catch (error) {
  console.error('\n❌ ОШИБКА ЗАПУСКА ПРИЛОЖЕНИЯ:');
  console.error('   Сообщение:', error.message);
  
  // Детальный анализ ошибки
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('   Тип: MODULE_NOT_FOUND (файл не найден)');
    
    // Извлекаем путь из сообщения об ошибке
    const match = error.message.match(/Cannot find module '([^']+)'/);
    if (match) {
      const missingModule = match[1];
      console.error(`   Отсутствующий модуль: ${missingModule}`);
      
      // Пробуем найти модуль
      if (missingModule.startsWith('./') || missingModule.startsWith('../')) {
        const modulePath = resolve(process.cwd(), missingModule);
        console.error(`   Искомый путь: ${modulePath}`);
        console.error(`   Существует: ${fs.existsSync(modulePath) ? 'Да' : 'Нет'}`);
        
        // Показываем содержимое текущей директории
        console.error('\n📁 Содержимое текущей директории:');
        try {
          const files = fs.readdirSync(process.cwd());
          files.forEach(file => {
            const fullPath = join(process.cwd(), file);
            const stat = fs.statSync(fullPath);
            console.error(`   ${stat.isDirectory() ? '📁' : '📄'} ${file}`);
          });
        } catch (readError) {
          console.error('   Не удалось прочитать директорию');
        }
      }
    }
  }
  
  console.error('\n🔧 Stack trace для отладки:');
  console.error(error.stack);
  
  process.exit(1);
}

// Обработка сигналов для graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Получен SIGINT. Завершение работы...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Получен SIGTERM. Завершение работы...');
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
