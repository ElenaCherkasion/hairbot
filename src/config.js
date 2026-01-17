// src/config.js
export default {
  bot: {
    token: process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN,
    webhookUrl: process.env.WEBHOOK_URL,
    adminId: process.env.ADMIN_USER_ID ? parseInt(process.env.ADMIN_USER_ID) : null
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000
  },
  server: {
    port: parseInt(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'production'
  }
};
