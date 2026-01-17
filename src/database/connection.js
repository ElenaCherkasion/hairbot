// src/database/connection.js
import { Sequelize } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const databaseUrl = process.env.DATABASE_URL || 'sqlite://./database/hairbot.db';

const sequelize = new Sequelize(databaseUrl, {
  dialect: databaseUrl.includes('sqlite') ? 'sqlite' : 'mysql',
  storage: databaseUrl.includes('sqlite') ? path.join(__dirname, 'hairbot.db') : undefined,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Тестовое подключение
sequelize.authenticate()
  .then(() => console.log('✅ База данных подключена'))
  .catch(err => console.error('❌ Ошибка подключения к БД:', err.message));

export { sequelize };
