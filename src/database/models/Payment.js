import { getDatabaseConnection } from '../connection.js';

export class Payment {
  /**
   * Создать платеж
   */
  static async create(userId, data) {
    const db = await getDatabaseConnection();
    
    const [result] = await db.query(
      `INSERT INTO payments 
        (user_id, amount, currency, tariff, payment_id, provider, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        data.amount,
        data.currency || 'RUB',
        data.tariff,
        data.payment_id,
        data.provider || 'test',
        data.status || 'pending'
      ]
    );
    
    return {
      id: result.insertId,
      user_id: userId,
      ...data,
      created_at: new Date(),
      updated_at: new Date()
    };
  }
  
  /**
   * Обновить статус платежа
   */
  static async updateStatus(paymentId, status) {
    const db = await getDatabaseConnection();
    
    await db.query(
      `UPDATE payments SET 
        status = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE payment_id = ?`,
      [status, paymentId]
    );
    
    return this.findByPaymentId(paymentId);
  }
  
  /**
   * Найти платеж по ID платежа
   */
  static async findByPaymentId(paymentId) {
    const db = await getDatabaseConnection();
    const [payments] = await db.query(
      'SELECT * FROM payments WHERE payment_id = ?',
      [paymentId]
    );
    return payments[0] || null;
  }
  
  /**
   * Получить платежи пользователя
   */
  static async findByUserId(userId) {
    const db = await getDatabaseConnection();
    const [payments] = await db.query(
      'SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return payments;
  }
  
  /**
   * Проверить, оплачен ли тариф пользователем
   */
  static async isTariffPaid(userId, tariff) {
    const db = await getDatabaseConnection();
    const [payments] = await db.query(
      `SELECT * FROM payments 
       WHERE user_id = ? AND tariff = ? AND status = 'paid'
       ORDER BY created_at DESC LIMIT 1`,
      [userId, tariff]
    );
    return payments.length > 0;
  }
}
