const db = require('../config/db');

const UserModel = {
  async findByEmail(email) {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
    return rows[0] || null;
  },

  async findById(id) {
    const [rows] = await db.query('SELECT id, name, email, password, role, phone, is_active, created_at FROM users WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async getAll(role = null) {
    let sql = 'SELECT id, name, email, password, role, phone, is_active, created_at FROM users';
    const params = [];
    if (role) {
      sql += ' WHERE role = ?';
      params.push(role);
    }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await db.query(sql, params);
    return rows;
  },

  async create({ name, email, password, role, phone }) {
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)',
      [name, email, password, role || 'employee', phone || null]
    );
    return result.insertId;
  },

  async deactivate(id) {
    const [result] = await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
    return result.affectedRows;
  },

  async activate(id) {
    const [result] = await db.query('UPDATE users SET is_active = 1 WHERE id = ?', [id]);
    return result.affectedRows;
  },

  async updatePassword(id, hashedPassword) {
    const [result] = await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
    return result.affectedRows;
  }
};

module.exports = UserModel;
