#!/usr/bin/env node
// scripts/show-stats.js

import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем конфигурацию
import dotenv from 'dotenv';
dotenv.config();

console.log('📊 СТАТИСТИКА HAIRBOT\n');

// 1. Информация о системе
console.log('🔧 СИСТЕМНАЯ ИНФОРМАЦИЯ:');
console.log(`   Платформа: ${os.platform()} ${os.arch()}`);
console.log(`   Процессор: ${os.cpus()[0].model} (${os.cpus().length} ядер)`);
console.log(`   Память: ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB всего, ${(os.freemem() / 1024 ** 3).toFixed(1)} GB свободно`);
console.log(`   Загрузка CPU: ${os.loadavg().map(v => v.toFixed(2)).join(', ')} (1, 5, 15 мин)`);
console.log(`   Uptime системы: ${(os.uptime() / 3600).toFixed(1)} часов`);

// 2. Информация о приложении
console.log('\n🤖 ИНФОРМАЦИЯ О ПРИЛОЖЕНИИ:');
try {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  console.log(`   Версия: ${packageData.version}`);
  console.log(`   Режим: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Node.js: ${process.version}`);
  console.log(`   Используемая память: ${(process.memoryUsage().heapUsed / 1024 ** 2).toFixed(2)} MB`);
  console.log(`   PID: ${process.pid}`);
  
  // Информация о боте
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const botId = process.env.TELEGRAM_BOT_TOKEN.split(':')[0];
    console.log(`   Bot ID: ${botId}`);
  }
} catch (error) {
  console.log(`   Ошибка чтения package.json: ${error.message}`);
}

// 3. Проверка зависимостей
console.log('\n📦 ПРОВЕРКА ЗАВИСИМОСТЕЙ:');
const dependencies = [
  'express',
  'openai',
  'mysql2',
  'winston',
  'helmet',
  'compression',
  'express-rate-limit'
];

const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
dependencies.forEach(dep => {
  const depPath = path.join(nodeModulesPath, dep);
  const exists = fs.existsSync(depPath);
  console.log(`   ${exists ? '✅' : '❌'} ${dep}`);
});

// 4. Проверка файлов и директорий
console.log('\n📁 ФАЙЛЫ И ДИРЕКТОРИИ:');
const checkPaths = [
  { name: 'Исходный код', path: 'src/', required: true },
  { name: 'Модели БД', path: 'src/database/models/', required: true },
  { name: 'Обработчики', path: 'src/handlers/', required: true },
  { name: 'Сервисы', path: 'src/services/', required: true },
  { name: 'Утилиты', path: 'src/utils/', required: true },
  { name: 'Логи', path: 'logs/', required: false },
  { name: 'База данных', path: 'database/', required: false },
  { name: 'Конфигурация', path: 'config.js', required: true }
];

checkPaths.forEach(item => {
  const fullPath = path.join(__dirname, '..', item.path);
  const exists = fs.existsSync(fullPath);
  const status = exists ? '✅' : (item.required ? '❌' : '⚠️ ');
  console.log(`   ${status} ${item.name}`);
});

// 5. Статистика базы данных (если доступна)
console.log('\n🗄️ СТАТИСТИКА БАЗЫ ДАННЫХ:');
try {
  const { sequelize } = await import('../src/database/connection.js');
  const { User, Analysis, Payment } = await import('../src/database/models/index.js');
  
  if (sequelize) {
    const userCount = await User.count();
    const analysisCount = await Analysis.count();
    const paymentCount = await Payment.count();
    
    console.log(`   👤 Пользователей: ${userCount}`);
    console.log(`   📊 Анализов: ${analysisCount}`);
    console.log(`   💳 Платежей: ${paymentCount}`);
    
    // Последние активности
    const lastUser = await User.findOne({ order: [['createdAt', 'DESC']] });
    if (lastUser) {
      const timeDiff = Date.now() - new Date(lastUser.createdAt).getTime();
      console.log(`   ⏰ Последний пользователь: ${Math.floor(timeDiff / (1000 * 60 * 60))} часов назад`);
    }
  }
} catch (error) {
  console.log(`   ℹ️  База данных не доступна: ${error.message}`);
}

// 6. Проверка API ключей
console.log('\n🔐 ПРОВЕРКА API:');
if (process.env.OPENAI_API_KEY) {
  const key = process.env.OPENAI_API_KEY;
  console.log(`   ✅ OpenAI API: настроен (${key.substring(0, 7)}...)`);
} else {
  console.log(`   ❌ OpenAI API: не настроен`);
}

if (process.env.TELEGRAM_BOT_TOKEN) {
  console.log(`   ✅ Telegram Bot: настроен`);
} else {
  console.log(`   ❌ Telegram Bot: не настроен`);
}

// 7. Рекомендации
console.log('\n💡 РЕКОМЕНДАЦИИ:');
const recommendations = [];

// Проверка памяти
const memoryUsage = process.memoryUsage();
const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
if (heapUsedPercent > 80) {
  recommendations.push('Высокое использование памяти - рассмотрите оптимизацию');
}

// Проверка NODE_ENV
if (process.env.NODE_ENV === 'production' && !process.env.WEBHOOK_URL) {
  recommendations.push('В production рекомендуется использовать webhook вместо polling');
}

// Проверка логов
const logsDir = path.join(__dirname, '..', 'logs');
if (fs.existsSync(logsDir)) {
  const logs = fs.readdirSync(logsDir);
  if (logs.length === 0) {
    recommendations.push('Директория logs пуста - логи не ведутся');
  }
}

if (recommendations.length > 0) {
  recommendations.forEach(rec => console.log(`   ⚠️  ${rec}`));
} else {
  console.log('   ✅ Все системы работают нормально');
}

console.log('\n🎯 СТАТУС: ГОТОВ К РАБОТЕ!');
