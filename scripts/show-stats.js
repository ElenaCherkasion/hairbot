#!/usr/bin/env node
// scripts/show-stats.js

import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('📊 СТАТИСТИКА СИСТЕМЫ И ПРИЛОЖЕНИЯ\n');

// 1. Системная информация
console.log('🔧 СИСТЕМА:');
console.log(`   Платформа: ${os.platform()} ${os.arch()}`);
console.log(`   Процессор: ${os.cpus()[0].model}`);
console.log(`   Ядра CPU: ${os.cpus().length}`);
console.log(`   Общая память: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log(`   Свободно памяти: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log(`   Использование памяти: ${((1 - os.freemem() / os.totalmem()) * 100).toFixed(1)}%`);
console.log(`   Время работы системы: ${(os.uptime() / 3600).toFixed(2)} часов`);

// 2. Информация о Node.js
console.log('\n🟢 NODE.JS:');
console.log(`   Версия Node: ${process.version}`);
console.log(`   Версия V8: ${process.versions.v8}`);
console.log(`   Платформа: ${process.platform}`);
console.log(`   PID процесса: ${process.pid}`);
console.log(`   Рабочая директория: ${process.cwd()}`);
console.log(`   Используемая память: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
console.log(`   Всего выделено: ${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`);
console.log(`   RSS: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`);

// 3. Информация о приложении
console.log('\n🤖 ПРИЛОЖЕНИЕ HAIRBOT:');
try {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  );
  console.log(`   Версия: ${packageJson.version}`);
  console.log(`   Режим: ${process.env.NODE_ENV || 'development'}`);
  
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const botId = token.split(':')[0];
    console.log(`   Bot ID: ${botId}`);
  }
  
  if (process.env.OPENAI_API_KEY) {
    const key = process.env.OPENAI_API_KEY;
    console.log(`   OpenAI: настроен (${key.substring(0, 10)}...)`);
  }
} catch (error) {
  console.log(`   Ошибка чтения package.json: ${error.message}`);
}

// 4. Проверка зависимостей
console.log('\n📦 ЗАВИСИМОСТИ:');
try {
  const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
  const hasNodeModules = fs.existsSync(nodeModulesPath);
  
  if (hasNodeModules) {
    const deps = ['express', 'openai', 'mysql2', 'winston'];
    deps.forEach(dep => {
      const depPath = path.join(nodeModulesPath, dep);
      console.log(`   ${dep}: ${fs.existsSync(depPath) ? '✅ установлен' : '❌ отсутствует'}`);
    });
  } else {
    console.log('   ❌ node_modules не найдены. Запустите: npm install');
  }
} catch (error) {
  console.log(`   Ошибка проверки зависимостей: ${error.message}`);
}

// 5. Проверка важных файлов и директорий
console.log('\n📁 ФАЙЛОВАЯ СИСТЕМА:');
const importantPaths = [
  { name: 'Исходный код', path: 'src/', optional: false },
  { name: 'Файл окружения', path: '.env', optional: false },
  { name: 'Логи', path: 'logs/', optional: true },
  { name: 'Резервные копии', path: 'backups/', optional: true },
  { name: 'Конфигурация Docker', path: 'docker-compose.yml', optional: true }
];

importantPaths.forEach(item => {
  const fullPath = path.join(__dirname, '..', item.path);
  const exists = fs.existsSync(fullPath);
  const status = exists ? '✅ найден' : (item.optional ? '⚠️  опциональный' : '❌ отсутствует');
  console.log(`   ${item.name}: ${status}`);
});

// 6. Сетевые интерфейсы
console.log('\n🌐 СЕТЬ:');
const interfaces = os.networkInterfaces();
Object.keys(interfaces).forEach(iface => {
  interfaces[iface].forEach(address => {
    if (address.family === 'IPv4' && !address.internal) {
      console.log(`   ${iface}: ${address.address}`);
    }
  });
});

console.log('\n🎯 РЕКОМЕНДАЦИИ:');
const recommendations = [];

if (os.freemem() / os.totalmem() < 0.1) {
  recommendations.push('🔴 Мало свободной памяти! Рассмотрите увеличение RAM');
}

if (os.loadavg()[0] > os.cpus().length * 0.7) {
  recommendations.push('🟡 Высокая загрузка CPU');
}

if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  recommendations.push('🟢 Режим разработки активирован');
}

if (recommendations.length > 0) {
  recommendations.forEach(rec => console.log(`   ${rec}`));
} else {
  console.log('   ✅ Все системы работают нормально');
}

console.log('\n📈 Готов к работе!');
