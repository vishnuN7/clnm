const db = require('../config/db');

const DocumentModel = {
  async create({ customer_id, doc_type, document_password, file_name, file_path, uploaded_by }) {
    const [result] = await db.query(
      'INSERT INTO documents (customer_id, doc_type, document_password, file_name, file_path, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
      [customer_id, doc_type, document_password || null, file_name, file_path, uploaded_by]
    );
    return result.insertId;
  },

  async getByCustomer(customer_id) {
    const [rows] = await db.query(
      `SELECT d.*, u.name AS uploaded_by_name
       FROM documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE d.customer_id = ?
       ORDER BY d.uploaded_at DESC`,
      [customer_id]
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await db.query('SELECT * FROM documents WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async delete(id) {
    const [result] = await db.query('DELETE FROM documents WHERE id = ?', [id]);
    return result.affectedRows;
  }
};

module.exports = DocumentModel;
