const db = require('../config/db');

const CustomerModel = {
  async create({ name, phone, address, area, added_by }) {
    const [result] = await db.query(
      'INSERT INTO customers (name, phone, address, area, added_by) VALUES (?, ?, ?, ?, ?)',
      [name, phone, address, area, added_by]
    );
    return result.insertId;
  },

  async findById(id) {
    const [rows] = await db.query(
      `SELECT c.*, u.name AS added_by_name
       FROM customers c
       LEFT JOIN users u ON c.added_by = u.id
       WHERE c.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async getAll({ area, search, added_by } = {}) {
    let sql = `
      SELECT c.*, u.name AS added_by_name
      FROM customers c
      LEFT JOIN users u ON c.added_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (area) { sql += ' AND c.area = ?'; params.push(area); }
    if (search) { sql += ' AND (c.name LIKE ? OR c.phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (added_by) { sql += ' AND c.added_by = ?'; params.push(added_by); }

    sql += ' ORDER BY c.created_at DESC';
    const [rows] = await db.query(sql, params);
    return rows;
  },

  async getAreas() {
    const [rows] = await db.query('SELECT DISTINCT area FROM customers ORDER BY area');
    return rows.map(r => r.area);
  },

  async delete(id) {
    const [result] = await db.query('DELETE FROM customers WHERE id=?', [id]);
    return result.affectedRows;
  }
};

module.exports = CustomerModel;
