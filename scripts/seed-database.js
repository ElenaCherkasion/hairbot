import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function seedDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hairbot'
  });

  try {
    // Очищаем таблицы (опционально)
    console.log('🧹 Очистка старых данных...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('TRUNCATE TABLE payments');
    await connection.query('TRUNCATE TABLE analyses');
    await connection.query('TRUNCATE TABLE user_sessions');
    await connection.query('TRUNCATE TABLE users');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    
    // Тестовые пользователи
    console.log('👥 Добавление тестовых пользователей...');
    await connection.query(`
      INSERT INTO users (telegram_id, username, first_name, last_name) VALUES
        (123456789, 'test_user_1', 'Анна', 'Иванова'),
        (987654321, 'test_user_2', 'Иван', 'Петров'),
        (555555555, 'demo_user', 'Мария', 'Сидорова');
    `);
    
    // Тестовые анализы
    console.log('📊 Добавление тестовых анализов...');
    await connection.query(`
      INSERT INTO analyses (user_id, tariff, face_shape, recommendations, status) VALUES
        (1, 'free', 'овальное', '["Каскад", "Длинный боб"]', 'completed'),
        (2, 'basic', 'круглое', '["Асимметричная стрижка", "Каре"]', 'completed'),
        (3, 'pro', 'квадратное', '["Длинные слои", "Пикси"]', 'processing');
    `);
    
    // Тестовые платежи
    console.log('💰 Добавление тестовых платежей...');
    await connection.query(`
      INSERT INTO payments (user_id, amount, tariff, payment_id, status) VALUES
        (2, 500.00, 'basic', 'pay_001', 'paid'),
        (3, 1000.00, 'pro', 'pay_002', 'paid');
    `);
    
    console.log('✅ Тестовые данные успешно добавлены');
    
  } catch (error) {
    console.error('❌ Ошибка при добавлении тестовых данных:', error.message);
  } finally {
    await connection.end();
  }
}

seedDatabase();
