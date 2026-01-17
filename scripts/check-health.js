import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

async function checkHealth() {
  const services = [
    { name: 'Основное приложение', url: `http://localhost:${process.env.PORT || 3000}/health` },
    { name: 'Telegram API', url: `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/getMe` },
    // Добавьте другие сервисы при необходимости
  ];
  
  console.log('🩺 Проверка здоровья системы...\n');
  
  for (const service of services) {
    try {
      const response = await fetch(service.url, { timeout: 5000 });
      const data = await response.json().catch(() => ({}));
      
      if (response.ok && (data.ok || data.status === 'ok')) {
        console.log(`✅ ${service.name}: Работает`);
      } else {
        console.log(`❌ ${service.name}: Ошибка (${response.status})`);
      }
    } catch (error) {
      console.log(`❌ ${service.name}: Недоступен (${error.message})`);
    }
  }
  
  console.log('\n✅ Проверка завершена');
}

checkHealth();
