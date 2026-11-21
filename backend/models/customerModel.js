const db = require('../config/db');

let schemaReady = false;

async function ensureCustomerSchema(force = false) {
  if (schemaReady && !force) return;
  try {
    const [cols] = await db.query("SHOW COLUMNS FROM customers");
    const existing = new Set(
      cols.map(c => (c.Field || c.field || c.COLUMN_NAME || c.column_name || '').toLowerCase())
    );

    const columnsToAdd = [
      { name: 'email',            def: 'VARCHAR(150) NULL' },
      { name: 'net_salary',       def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'total_obligation', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'address',          def: 'TEXT NULL' },
      { name: 'area',             def: 'VARCHAR(100) NULL' },
      { name: 'added_by',         def: 'INT NULL' }
    ];

    for (const { name, def } of columnsToAdd) {
      if (!existing.has(name.toLowerCase())) {
        try {
          await db.query(`ALTER TABLE customers ADD COLUMN ${name} ${def}`);
          console.log(`[CustomerModel] Added missing column '${name}' to customers`);
        } catch (e) {
          if (e.code !== 'ER_DUP_FIELDNAME' && e.errno !== 1060) {
            console.warn(`[CustomerModel] Column '${name}' migration warning:`, e.message);
          }
        }
      }
    }
    schemaReady = true;
  } catch (err) {
    console.warn('[CustomerModel] ensureCustomerSchema warning:', err.message);
  }
}

const CustomerModel = {
  ensureSchema: ensureCustomerSchema,

  async create({ name, phone, email, address, area, net_salary, total_obligation, added_by }) {
    await ensureCustomerSchema();

    const cleanName = String(name || '').trim();
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-15) || String(phone || '').trim();
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    const cleanAddress = String(address || '').trim();
    const cleanArea = String(area || '').trim();
    const salaryVal = Number(net_salary) || 0;
    const obligationVal = Number(total_obligation) || 0;
    const addedByVal = added_by !== undefined && added_by !== null ? Number(added_by) || added_by : null;

    try {
      const [result] = await db.query(
        'INSERT INTO customers (name, phone, email, address, area, net_salary, total_obligation, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [cleanName, cleanPhone, cleanEmail, cleanAddress, cleanArea, salaryVal, obligationVal, addedByVal]
      );
      return result.insertId;
    } catch (insertErr) {
      const isColumnErr = insertErr.code === 'ER_BAD_FIELD_ERROR' || (insertErr.message && insertErr.message.includes('Unknown column'));
      if (isColumnErr) {
        console.warn('[CustomerModel] Unknown column detected in insert, attempting dynamic schema healing...');
        schemaReady = false;
        await ensureCustomerSchema(true);

        const [cols] = await db.query("SHOW COLUMNS FROM customers");
        const existing = new Set(
          cols.map(c => (c.Field || c.field || c.COLUMN_NAME || c.column_name || '').toLowerCase())
        );

        const fieldMap = {
          name: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          address: cleanAddress,
          area: cleanArea,
          net_salary: salaryVal,
          total_obligation: obligationVal,
          added_by: addedByVal
        };

        const insertCols = [];
        const insertVals = [];
        const placeholders = [];

        for (const [colName, val] of Object.entries(fieldMap)) {
          if (existing.has(colName.toLowerCase())) {
            insertCols.push(colName);
            insertVals.push(val);
            placeholders.push('?');
          }
        }

        if (insertCols.length > 0) {
          const [res] = await db.query(
            `INSERT INTO customers (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})`,
            insertVals
          );
          return res.insertId;
        }
      }
      throw insertErr;
    }
  },

  async findById(id) {
    const [rows] = await db.query(
      `SELECT c.*, u.name AS added_by_name
       FROM customers c
       LEFT JOIN users u ON c.added_by = u.id
       WHERE c.id = ?`,
      [id]
    );
    if (!rows[0]) return null;
    const customer = rows[0];
    if (customer.net_salary === undefined || customer.net_salary === null) customer.net_salary = 0;
    if (customer.total_obligation === undefined || customer.total_obligation === null) customer.total_obligation = 0;
    return customer;
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
    await ensureCustomerSchema();
    const cleanName = String(name || '').trim();
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-15) || String(phone || '').trim();
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    const cleanAddress = String(address || '').trim();
    const cleanArea = String(area || '').trim();
    const salaryVal = Number(net_salary) || 0;
    const obligationVal = Number(total_obligation) || 0;

    try {
      const [result] = await db.query(
        `UPDATE customers
         SET name = ?, phone = ?, email = ?, address = ?, area = ?,
             net_salary = ?, total_obligation = ?
         WHERE id = ?`,
        [cleanName, cleanPhone, cleanEmail, cleanAddress, cleanArea, salaryVal, obligationVal, id]
      );
      return result.affectedRows;
    } catch (updateErr) {
      const isColumnErr = updateErr.code === 'ER_BAD_FIELD_ERROR' || (updateErr.message && updateErr.message.includes('Unknown column'));
      if (isColumnErr) {
        schemaReady = false;
        await ensureCustomerSchema(true);

        const [cols] = await db.query("SHOW COLUMNS FROM customers");
        const existing = new Set(
          cols.map(c => (c.Field || c.field || c.COLUMN_NAME || c.column_name || '').toLowerCase())
        );

        const updateParts = [];
        const updateVals = [];

        if (existing.has('name')) { updateParts.push('name = ?'); updateVals.push(cleanName); }
        if (existing.has('phone')) { updateParts.push('phone = ?'); updateVals.push(cleanPhone); }
        if (existing.has('email')) { updateParts.push('email = ?'); updateVals.push(cleanEmail); }
        if (existing.has('address')) { updateParts.push('address = ?'); updateVals.push(cleanAddress); }
        if (existing.has('area')) { updateParts.push('area = ?'); updateVals.push(cleanArea); }
        if (existing.has('net_salary')) { updateParts.push('net_salary = ?'); updateVals.push(salaryVal); }
        if (existing.has('total_obligation')) { updateParts.push('total_obligation = ?'); updateVals.push(obligationVal); }

        if (updateParts.length > 0) {
          updateVals.push(id);
          const [res] = await db.query(
            `UPDATE customers SET ${updateParts.join(', ')} WHERE id = ?`,
            updateVals
          );
          return res.affectedRows;
        }
      }
      throw updateErr;
    }
  },

  async delete(id) {
    const [result] = await db.query('DELETE FROM customers WHERE id=?', [id]);
    return result.affectedRows;
  }
};

module.exports = CustomerModel;
