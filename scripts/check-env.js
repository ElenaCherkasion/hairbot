#!/usr/bin/env node
// scripts/check-env.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Проверяем, находимся ли мы в CI/CD окружении
const isCI = process.env.CI === 'true' || process.env.RENDER === 'true' || process.env.GITHUB_ACTIONS === 'true';

console.log('🔍 Проверка переменных окружения HairBot...\n');

// Проверка наличия .env файла
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

// Если находимся в CI/CD и файла .env нет - проверяем переменные окружения напрямую
if (!fs.existsSync(envPath) && isCI) {
  console.log('⚠️  CI/CD окружение обнаружено, проверяем переменные окружения напрямую...');
  
  // В CI/CD переменные окружения устанавливаются напрямую
  // Проверяем только критические переменные
  const CRITICAL_VARS = ['TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY'];
  const missingVars = CRITICAL_VARS.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ В CI/CD окружении отсутствуют критические переменные:');
    missingVars.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('\n💡 Установите эти переменные в настройках Render/GitHub Actions');
    process.exit(1);
  } else {
    console.log('✅ Все критические переменные установлены в CI/CD окружении');
    console.log('🚀 Продолжаем сборку...');
    process.exit(0);
  }
}

if (!fs.existsSync(envPath)) {
  console.error('❌ Файл .env не найден!');
  
  // Если есть .env.example, предлагаем создать .env
  if (fs.existsSync(envExamplePath)) {
    console.log('\n💡 Решение:');
    console.log('   1. Скопируйте .env.example в .env:');
    console.log('      cp .env.example .env');
    console.log('   2. Заполните значения в .env файле');
    console.log('   3. Запустите проверку снова\n');
  }
  
  process.exit(1);
}

// Загружаем .env файл
import dotenv from 'dotenv';
dotenv.config({ path: envPath });

// Продолжаем обычную проверку...
// ... остальной код проверки переменных окружения ...
