import { getDatabaseConnection } from '../connection.js';

export class User {
  /**
   * Найти или создать пользователя
   */
  static async findOrCreate(telegramUser) {
    const db = await getDatabaseConnection();
    
    // Проверяем существование пользователя
    const [existingUsers] = await db.query(
      'SELECT * FROM users WHERE telegram_id = ?',
      [telegramUser.id]
    );
    
    if (existingUsers.length > 0) {
      // Обновляем данные пользователя если они изменились
      const user = existingUsers[0];
      await db.query(
        `UPDATE users SET 
          username = COALESCE(?, username),
          first_name = COALESCE(?, first_name),
          last_name = COALESCE(?, last_name),
          language_code = COALESCE(?, language_code),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          telegramUser.username,
          telegramUser.first_name,
          telegramUser.last_name,
          telegramUser.language_code,
          user.id
        ]
      );
      return user;
    }
    
    // Создаем нового пользователя
    const [result] = await db.query(
      `INSERT INTO users 
        (telegram_id, username, first_name, last_name, language_code) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        telegramUser.id,
        telegramUser.username,
        telegramUser.first_name,
        telegramUser.last_name,
        telegramUser.language_code || 'ru'
      ]
    );
    
    return {
      id: result.insertId,
      telegram_id: telegramUser.id,
      username: telegramUser.username,
      first_name: telegramUser.first_name,
      last_name: telegramUser.last_name,
      language_code: telegramUser.language_code || 'ru',
      created_at: new Date(),
      updated_at: new Date()
    };
  }
  
  /**
   * Получить пользователя по Telegram ID
   */
  static async findByTelegramId(telegramId) {
    const db = await getDatabaseConnection();
    const [users] = await db.query(
      'SELECT * FROM users WHERE telegram_id = ?',
      [telegramId]
    );
    return users[0] || null;
  }
  
  /**
   * Получить пользователя по ID
   */
  static async findById(userId) {
    const db = await getDatabaseConnection();
    const [users] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );
    return users[0] || null;
  }
  
  /**
   * Получить количество бесплатных анализов пользователя
   */
  static async getFreeAnalysesCount(userId) {
    const db = await getDatabaseConnection();
    const [result] = await db.query(
      `SELECT COUNT(*) as count FROM analyses 
       WHERE user_id = ? AND tariff = 'free' 
       AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [userId]
    );
    return result[0]?.count || 0;
  }
  
  /**
   * Получить историю анализов пользователя
   */
  static async getAnalysesHistory(userId, limit = 10) {
    const db = await getDatabaseConnection();
    const [analyses] = await db.query(
      `SELECT * FROM analyses 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
      [userId, limit]
    );
    return analyses;
  }
}
