#!/usr/bin/env node
// scripts/check-env.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Проверка переменных окружения HairBot...\n');

// Основные критические переменные для бота
const CRITICAL_VARS = [
  'TELEGRAM_BOT_TOKEN',
  'OPENAI_API_KEY'
];

// Рекомендованные для базовой работы
const RECOMMENDED_VARS = [
  'DATABASE_URL',
  'NODE_ENV',
  'PORT',
  'LOG_LEVEL',
  'LOG_FILE'
];

// Дополнительные для продвинутых функций
const OPTIONAL_VARS = [
  'WEBHOOK_URL',
  'WEBHOOK_SECRET',
  'ADMIN_USER_ID',
  'PAYMENT_PROVIDER_TOKEN',
  'ENABLE_ANALYTICS',
  'REDIS_URL'
];

// Проверка наличия .env файла
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envPath)) {
  console.error('❌ Файл .env не найден!');
  console.log('\n💡 Решение:');
  console.log('   1. Скопируйте .env.example в .env:');
  console.log('      cp .env.example .env');
  console.log('   2. Заполните значения в .env файле');
  console.log('   3. Запустите проверку снова\n');
  
  // Предлагаем создать .env из примера
  if (fs.existsSync(envExamplePath)) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('Создать .env файл из .env.example? (y/n): ', (answer) => {
      if (answer.toLowerCase() === 'y') {
        try {
          fs.copyFileSync(envExamplePath, envPath);
          console.log('✅ Файл .env создан');
          console.log('⚠️  Отредактируйте .env и добавьте реальные значения!');
        } catch (error) {
          console.error('Ошибка при создании .env:', error.message);
        }
      }
      rl.close();
    });
  }
  process.exit(1);
}

// Загружаем .env файл
import dotenv from 'dotenv';
dotenv.config({ path: envPath });

console.log('📋 КРИТИЧЕСКИ ВАЖНЫЕ:');
const missingCritical = [];
CRITICAL_VARS.forEach(varName => {
  if (process.env[varName]) {
    const value = process.env[varName];
    const maskedValue = varName.includes('TOKEN') || varName.includes('KEY') || varName.includes('SECRET')
      ? '••••••••' + value.substring(value.length - 4)
      : value;
    console.log(`   ✅ ${varName}=${maskedValue}`);
  } else {
    console.log(`   ❌ ${varName}=НЕ УСТАНОВЛЕНА`);
    missingCritical.push(varName);
  }
});

console.log('\n📋 РЕКОМЕНДОВАННЫЕ:');
const missingRecommended = [];
RECOMMENDED_VARS.forEach(varName => {
  if (process.env[varName]) {
    console.log(`   ✅ ${varName}=${process.env[varName]}`);
  } else {
    console.log(`   ⚠️  ${varName}=НЕ УСТАНОВЛЕНА (используется значение по умолчанию)`);
    missingRecommended.push(varName);
  }
});

console.log('\n📋 ОПЦИОНАЛЬНЫЕ:');
OPTIONAL_VARS.forEach(varName => {
  if (process.env[varName]) {
    console.log(`   ✅ ${varName}=установлена`);
  } else {
    console.log(`   ➖ ${varName}=не установлена`);
  }
});

// Проверка специфичных значений
console.log('\n🔧 ДОПОЛНИТЕЛЬНЫЕ ПРОВЕРКИ:');

// NODE_ENV
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
  console.log('   ⚠️  NODE_ENV не установлен, используется "development"');
} else if (!['development', 'production', 'test'].includes(process.env.NODE_ENV)) {
  console.log(`   ⚠️  NODE_ENV="${process.env.NODE_ENV}" нестандартное значение`);
}

// DATABASE_URL
if (process.env.DATABASE_URL) {
  const dbUrl = process.env.DATABASE_URL.toLowerCase();
  if (dbUrl.includes('mysql://')) {
    console.log('   ✅ Используется MySQL база данных');
  } else if (dbUrl.includes('postgres://') || dbUrl.includes('postgresql://')) {
    console.log('   ✅ Используется PostgreSQL база данных');
  } else if (dbUrl.includes('sqlite://')) {
    console.log('   ✅ Используется SQLite база данных');
  } else if (dbUrl.startsWith('file:')) {
    console.log('   ✅ Используется локальная SQLite база данных');
  }
} else {
  console.log('   ℹ️  DATABASE_URL не установлен - будет использована SQLite в памяти');
}

// Проверка директорий
console.log('\n📁 ПРОВЕРКА ДИРЕКТОРИЙ:');
const requiredDirs = [
  { path: 'logs', optional: false },
  { path: 'database', optional: true },
  { path: 'backups', optional: true }
];

requiredDirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir.path);
  if (fs.existsSync(dirPath)) {
    console.log(`   ✅ ${dir.path}/`);
  } else if (!dir.optional) {
    console.log(`   ⚠️  ${dir.path}/ - отсутствует, создаю...`);
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Итог
console.log('\n📊 ИТОГ ПРОВЕРКИ:');
if (missingCritical.length === 0) {
  console.log('✅ Все критические переменные установлены');
  console.log('🚀 Бот готов к запуску!');
  
  if (missingRecommended.length > 0) {
    console.log(`\n⚠️  Рекомендуется установить: ${missingRecommended.join(', ')}`);
  }
  
  // Проверка подключения к базе данных (если установлена)
  if (process.env.DATABASE_URL) {
    try {
      const { checkDatabaseConnection } = await import('../src/database/connection.js');
      const isConnected = await checkDatabaseConnection();
      if (isConnected) {
        console.log('✅ Подключение к базе данных успешно');
      }
    } catch (error) {
      console.log('ℹ️  Подключение к базе данных не проверено');
    }
  }
} else {
  console.error(`❌ Отсутствуют критические переменные: ${missingCritical.join(', ')}`);
  console.error('   Бот не может быть запущен');
  process.exit(1);
}
