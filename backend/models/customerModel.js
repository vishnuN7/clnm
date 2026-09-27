const db = require('../config/db');

const CustomerModel = {
  async create({ name, phone, email, address, area, net_salary, total_obligation, added_by }) {
    const [result] = await db.query(
      'INSERT INTO customers (name, phone, email, address, area, net_salary, total_obligation, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, phone, email || null, address, area, net_salary || 0, total_obligation || 0, added_by]
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

  async getAll({ area, search, added_by, period, startDate, endDate } = {}) {
    let sql = `
      SELECT c.*, u.name AS added_by_name,
             (SELECT COUNT(*) FROM documents d WHERE d.customer_id = c.id) AS document_count
      FROM customers c
      LEFT JOIN users u ON c.added_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (area) { sql += ' AND c.area = ?'; params.push(area); }
    if (search) { sql += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.area LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (added_by) { sql += ' AND c.added_by = ?'; params.push(added_by); }

    if (period === 'today') {
      sql += ' AND DATE(c.created_at) = CURDATE()';
    } else if (period === 'yesterday') {
      sql += ' AND DATE(c.created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
    } else if (period === 'week') {
      sql += ' AND c.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
    } else if (period === 'month') {
      sql += ' AND c.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
    } else if (period === 'this_month') {
      sql += ' AND YEAR(c.created_at) = YEAR(CURDATE()) AND MONTH(c.created_at) = MONTH(CURDATE())';
    } else if (period === 'year') {
      sql += ' AND c.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
    }

    if (startDate) {
      sql += ' AND c.created_at >= ?';
      params.push(startDate.includes(' ') ? startDate : `${startDate} 00:00:00`);
    }
    if (endDate) {
      sql += ' AND c.created_at <= ?';
      params.push(endDate.includes(' ') ? endDate : `${endDate} 23:59:59`);
    }

    sql += ' ORDER BY c.created_at DESC';
    const [rows] = await db.query(sql, params);
    return rows;
  },

  async getAreas() {
    const [rows] = await db.query('SELECT DISTINCT area FROM customers ORDER BY area');
    return rows.map(r => r.area);
  },

  async update(id, { name, phone, email, address, area, net_salary, total_obligation }) {
    const [result] = await db.query(
      `UPDATE customers
       SET name = ?, phone = ?, email = ?, address = ?, area = ?,
           net_salary = ?, total_obligation = ?
       WHERE id = ?`,
      [name, phone, email || null, address, area, net_salary, total_obligation, id]
    );
    return result.affectedRows;
  },

  async delete(id) {
    const [result] = await db.query('DELETE FROM customers WHERE id=?', [id]);
    return result.affectedRows;
  }
};

module.exports = CustomerModel;
