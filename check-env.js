#!/usr/bin/env node
// scripts/check-env.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Читаем .env.example для получения списка обязательных переменных
const envExamplePath = path.join(__dirname, '..', '.env.example');
let requiredEnvVars = [];

try {
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
  requiredEnvVars = envExampleContent
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => line.split('=')[0])
    .filter(Boolean);
} catch (error) {
  console.warn('⚠️  Файл .env.example не найден, использую базовый список');
  requiredEnvVars = [
    'TELEGRAM_BOT_TOKEN',
    'OPENAI_API_KEY',
    'DATABASE_URL',
    'NODE_ENV',
    'PORT'
  ];
}

// Добавляем дополнительные обязательные переменные
const additionalRequiredVars = [
  'TELEGRAM_BOT_TOKEN',
  'OPENAI_API_KEY'
];

requiredEnvVars = [...new Set([...requiredEnvVars, ...additionalRequiredVars])];

console.log('🔍 Проверка переменных окружения...\n');

const missingVars = [];
const optionalVars = [];
const presentVars = [];

for (const varName of requiredEnvVars) {
  if (process.env[varName]) {
    presentVars.push(varName);
  } else if (varName.includes('OPTIONAL') || varName.includes('EXAMPLE')) {
    optionalVars.push(varName);
  } else {
    missingVars.push(varName);
  }
}

// Вывод результатов
if (presentVars.length > 0) {
  console.log('✅ Найдены переменные:');
  presentVars.forEach(varName => {
    const value = process.env[varName];
    const maskedValue = varName.includes('TOKEN') || varName.includes('KEY') || varName.includes('SECRET')
      ? value.substring(0, 8) + '...' + value.substring(value.length - 4)
      : value;
    console.log(`   ${varName}=${maskedValue}`);
  });
  console.log('');
}

if (optionalVars.length > 0) {
  console.log('⚠️  Опциональные переменные (не обязательны):');
  optionalVars.forEach(varName => {
    console.log(`   ${varName}`);
  });
  console.log('');
}

if (missingVars.length > 0) {
  console.error('❌ ОТСУТСТВУЮТ КРИТИЧЕСКИЕ ПЕРЕМЕННЫЕ:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n💡 Решение:');
  console.error('   1. Скопируйте .env.example в .env');
  console.error('   2. Заполните недостающие значения в .env файле');
  console.error('   3. Перезапустите приложение\n');
  
  // Предлагаем создать .env файл
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    const createEnv = process.argv.includes('--create') || process.argv.includes('-c');
    if (createEnv) {
      try {
        fs.copyFileSync(envExamplePath, envPath);
        console.log('📄 Создан файл .env на основе .env.example');
        console.log('⚠️  Отредактируйте .env и добавьте реальные значения!');
      } catch (error) {
        console.error('Ошибка при создании .env файла:', error.message);
      }
    } else {
      console.log('💡 Используйте: npm run check-env -- --create для создания .env файла');
    }
  }
  
  process.exit(1);
}

console.log('🎉 Все переменные окружения настроены корректно!');
console.log(`📊 Всего проверено: ${presentVars.length + missingVars.length + optionalVars.length} переменных`);
console.log(`   ✅ Найдено: ${presentVars.length}`);
console.log(`   ⚠️  Опциональных: ${optionalVars.length}`);
console.log(`   ❌ Отсутствует: ${missingVars.length}`);

// Дополнительные проверки
console.log('\n🔧 Дополнительные проверки:');

// Проверка NODE_ENV
if (!process.env.NODE_ENV) {
  console.warn('⚠️  NODE_ENV не установлен. По умолчанию: development');
  process.env.NODE_ENV = 'development';
} else {
  const validEnvs = ['development', 'production', 'test'];
  if (!validEnvs.includes(process.env.NODE_ENV)) {
    console.warn(`⚠️  NODE_ENV="${process.env.NODE_ENV}" не стандартный. Используйте: ${validEnvs.join(', ')}`);
  }
}

// Проверка базы данных
if (process.env.DATABASE_URL) {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl.includes('mysql://') || dbUrl.includes('postgresql://')) {
    console.log('✅ Настроена внешняя база данных');
  } else if (dbUrl.includes('sqlite://')) {
    console.log('✅ Настроена SQLite база данных');
  } else if (dbUrl.includes('file:')) {
    console.log('✅ Настроена локальная база данных SQLite');
  }
} else {
  console.warn('⚠️  DATABASE_URL не установлен. Будет использована SQLite в памяти');
}

console.log('\n🚀 Проверка завершена успешно!');
