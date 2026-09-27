const db = require('../config/db');

const UserModel = {
  async findByEmail(email) {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0] || null;
  },

  async findById(id) {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async getAll(role = null) {
    let sql = 'SELECT * FROM users';
    const params = [];
    if (role) {
      sql += ' WHERE role = ?';
      params.push(role);
    }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await db.query(sql, params);
    return rows;
  },

  async findByUsername(username) {
    if (!username) return null;
    const [rows] = await db.query('SELECT * FROM users WHERE LOWER(username) = ?', [username.toLowerCase()]);
    return rows[0] || null;
  },

  async create({ name, email, password, role, phone, designation, username, must_change_password }) {
    const [result] = await db.query(
      `INSERT INTO users (name, email, password, role, phone, designation, username, must_change_password, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        name,
        email.toLowerCase(),
        password,
        role || 'employee',
        phone || null,
        designation || 'Loan Executive',
        username ? username.toLowerCase() : null,
        must_change_password ? 1 : 0
      ]
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
  },

  async removeEmployee(id) {
    const [result] = await db.query('DELETE FROM users WHERE id = ? AND role = ?', [id, 'employee']);
    return result.affectedRows;
  }
};

module.exports = UserModel;
