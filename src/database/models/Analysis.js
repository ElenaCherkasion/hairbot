import { getDatabaseConnection } from '../connection.js';

export class Analysis {
  /**
   * Создать новый анализ
   */
  static async create(userId, data) {
    const db = await getDatabaseConnection();
    
    const [result] = await db.query(
      `INSERT INTO analyses 
        (user_id, tariff, face_shape, recommendations, photo_url, status) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        data.tariff || 'free',
        data.face_shape,
        JSON.stringify(data.recommendations || []),
        data.photo_url,
        data.status || 'pending'
      ]
    );
    
    return {
      id: result.insertId,
      user_id: userId,
      ...data,
      created_at: new Date()
    };
  }
  
  /**
   * Обновить статус анализа
   */
  static async updateStatus(analysisId, status, resultData = null) {
    const db = await getDatabaseConnection();
    
    const updates = {
      status,
      updated_at: new Date()
    };
    
    if (resultData) {
      if (resultData.face_shape) updates.face_shape = resultData.face_shape;
      if (resultData.recommendations) {
        updates.recommendations = JSON.stringify(resultData.recommendations);
      }
    }
    
    await db.query(
      'UPDATE analyses SET ? WHERE id = ?',
      [updates, analysisId]
    );
    
    return this.findById(analysisId);
  }
  
  /**
   * Найти анализ по ID
   */
  static async findById(analysisId) {
    const db = await getDatabaseConnection();
    const [analyses] = await db.query(
      'SELECT * FROM analyses WHERE id = ?',
      [analysisId]
    );
    return analyses[0] || null;
  }
  
  /**
   * Получить все анализы пользователя
   */
  static async findByUserId(userId) {
    const db = await getDatabaseConnection();
    const [analyses] = await db.query(
      'SELECT * FROM analyses WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return analyses;
  }
  
  /**
   * Удалить старые анализы (очистка)
   */
  static async cleanupOldAnalyses(days = 30) {
    const db = await getDatabaseConnection();
    const [result] = await db.query(
      'DELETE FROM analyses WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [days]
    );
    return result.affectedRows;
  }
}
