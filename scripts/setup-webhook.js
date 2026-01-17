import fetch from 'node-fetch';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function setupWebhook() {
  const telegramToken = process.env.TELEGRAM_TOKEN;
  
  if (!telegramToken) {
    console.error('❌ TELEGRAM_TOKEN не найден в .env');
    process.exit(1);
  }
  
  // Спрашиваем URL для webhook
  const defaultUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'hairstyle-bot.onrender.com'}/webhook`;
  
  rl.question(`Введите URL для webhook (по умолчанию: ${defaultUrl}): `, async (webhookUrl) => {
    webhookUrl = webhookUrl || defaultUrl;
    
    console.log(`\n🔄 Настройка webhook: ${webhookUrl}`);
    
    try {
      const url = `https://api.telegram.org/bot${telegramToken}/setWebhook`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        console.log('✅ Webhook успешно настроен!');
        console.log(`📊 Детали: ${data.description}`);
      } else {
        console.error('❌ Ошибка настройки webhook:', data.description);
      }
      
    } catch (error) {
      console.error('❌ Ошибка сети:', error.message);
    } finally {
      rl.close();
    }
  });
}

// Также можно удалить webhook
async function deleteWebhook() {
  const telegramToken = process.env.TELEGRAM_TOKEN;
  
  try {
    const url = `https://api.telegram.org/bot${telegramToken}/deleteWebhook`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ Webhook удален');
    } else {
      console.error('❌ Ошибка удаления webhook');
    }
  } catch (error) {
    console.error('❌ Ошибка сети:', error.message);
  }
}

// Проверяем текущий webhook
async function getWebhookInfo() {
  const telegramToken = process.env.TELEGRAM_TOKEN;
  
  try {
    const url = `https://api.telegram.org/bot${telegramToken}/getWebhookInfo`;
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('📋 Информация о webhook:');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

// Запускаем
const command = process.argv[2] || 'setup';

switch (command) {
  case 'setup':
    setupWebhook();
    break;
  case 'delete':
    deleteWebhook();
    break;
  case 'info':
    getWebhookInfo();
    break;
  default:
    console.log('Использование: node setup-webhook.js [setup|delete|info]');
    break;
}
