import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

let pool = null;

export async function getDatabaseConnection() {
  if (!pool) {
    const config = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hairbot',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    };

    // Если есть DATABASE_URL (для PostgreSQL на Render), используем его
    if (process.env.DATABASE_URL) {
      pool = mysql.createPool(process.env.DATABASE_URL);
    } else {
      pool = mysql.createPool(config);
    }
    
    console.log('✅ Подключение к базе данных установлено');
  }
  
  return pool;
}

export async function testDatabaseConnection() {
  try {
    const connection = await getDatabaseConnection();
    await connection.query('SELECT 1');
    console.log('✅ Тест подключения к БД: УСПЕХ');
    return true;
  } catch (error) {
    console.error('❌ Ошибка подключения к БД:', error.message);
    return false;
  }
}

// Закрытие соединения при завершении приложения
export async function closeDatabaseConnection() {
  if (pool) {
    await pool.end();
    console.log('✅ Соединение с БД закрыто');
  }
}
