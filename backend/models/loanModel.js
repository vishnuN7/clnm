const db = require('../config/db');

const LoanModel = {
  async create({ customer_id, amount, purpose, applied_by }) {
    const [result] = await db.query(
      'INSERT INTO loans (customer_id, amount, purpose, applied_by) VALUES (?, ?, ?, ?)',
      [customer_id, amount, purpose || null, applied_by]
    );
    return result.insertId;
  },

  async findById(id) {
    const [rows] = await db.query(
      `SELECT l.*, c.name AS customer_name, c.area, c.phone AS customer_phone,
              u.name AS applied_by_name, a.name AS approved_by_name
       FROM loans l
       LEFT JOIN customers c ON l.customer_id = c.id
       LEFT JOIN users u ON l.applied_by = u.id
       LEFT JOIN users a ON l.approved_by = a.id
       WHERE l.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async getAll({ status, area, period, applied_by, search, customer_id } = {}) {
    let sql = `
      SELECT l.*, c.name AS customer_name, c.area, c.phone AS customer_phone,
             u.name AS applied_by_name
      FROM loans l
      LEFT JOIN customers c ON l.customer_id = c.id
      LEFT JOIN users u ON l.applied_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) { sql += ' AND l.status = ?'; params.push(status); }
    if (area) { sql += ' AND c.area = ?'; params.push(area); }
    if (applied_by) { sql += ' AND l.applied_by = ?'; params.push(applied_by); }
    if (customer_id) { sql += ' AND l.customer_id = ?'; params.push(customer_id); }
    if (search) {
      sql += ' AND (c.name LIKE ? OR c.phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Time period filter
    if (period === 'week') {
      sql += ' AND l.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
    } else if (period === 'month') {
      sql += ' AND l.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
    } else if (period === 'year') {
      sql += ' AND l.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
    }

    sql += ' ORDER BY l.created_at DESC';
    const [rows] = await db.query(sql, params);
    return rows;
  },

  async updateStatus(id, { status, notes, approved_by }) {
    const [result] = await db.query(
      'UPDATE loans SET status=?, notes=?, approved_by=? WHERE id=?',
      [status, notes || null, approved_by || null, id]
    );
    return result.affectedRows;
  },

  async getDashboardStats() {
    const [total] = await db.query('SELECT COUNT(*) AS total FROM loans');
    const [statusBreakdown] = await db.query(
      'SELECT status, COUNT(*) AS count FROM loans GROUP BY status'
    );
    const [totalAmount] = await db.query(
      "SELECT SUM(amount) AS total_amount FROM loans WHERE status = 'Approved'"
    );
    const [monthlyTrend] = await db.query(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
             COUNT(*) AS count,
             SUM(amount) AS total_amount
      FROM loans
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month
      ORDER BY month ASC
    `);
    const [recentLoans] = await db.query(`
      SELECT l.id, l.amount, l.status, l.created_at,
             c.id AS customer_id, c.name AS customer_name, u.name AS applied_by_name
      FROM loans l
      LEFT JOIN customers c ON l.customer_id = c.id
      LEFT JOIN users u ON l.applied_by = u.id
      ORDER BY l.created_at DESC
      LIMIT 5
    `);

    return {
      total: total[0].total,
      statusBreakdown,
      totalApprovedAmount: totalAmount[0].total_amount || 0,
      monthlyTrend,
      recentLoans
    };
  }
};

module.exports = LoanModel;
