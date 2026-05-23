const db = require('../config/db');

const PasswordResetModel = {
  async create({ userId, tokenHash, expiresAt }) {
    const [result] = await db.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt]
    );

    return result.insertId;
  },

  async findValidByTokenHash(tokenHash) {
    const [rows] = await db.query(
      'SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1',
      [tokenHash]
    );

    return rows[0] || null;
  },

  async markUsed(id) {
    const [result] = await db.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
      [id]
    );

    return result.affectedRows;
  },

  async deleteForUser(userId) {
    const [result] = await db.query(
      'DELETE FROM password_reset_tokens WHERE user_id = ?',
      [userId]
    );

    return result.affectedRows;
  }
};

module.exports = PasswordResetModel;