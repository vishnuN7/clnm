const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../config/db');

async function migrate() {
  console.log('--- Starting Master Workbook & Allocation Migration ---');

  // Helper to check if a column exists
  async function columnExists(table, column) {
    const [rows] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    return rows.length > 0;
  }

  // 1. Add columns to excel_records
  if (!await columnExists('excel_records', 'assignment_id')) {
    await db.query(`ALTER TABLE excel_records ADD COLUMN assignment_id INT NULL AFTER file_id, ADD INDEX idx_er_assignment (assignment_id)`);
    console.log('✓ Added assignment_id to excel_records');
  }

  if (!await columnExists('excel_records', 'assigned_to')) {
    await db.query(`ALTER TABLE excel_records ADD COLUMN assigned_to INT NULL AFTER assignment_id, ADD INDEX idx_er_assigned_to (assigned_to)`);
    console.log('✓ Added assigned_to to excel_records');
  }

  if (!await columnExists('excel_records', 'source_employee_name')) {
    await db.query(`ALTER TABLE excel_records ADD COLUMN source_employee_name VARCHAR(150) NULL AFTER assigned_to`);
    console.log('✓ Added source_employee_name to excel_records');
  }

  // 2. Add columns to excel_assignments
  if (!await columnExists('excel_assignments', 'start_row')) {
    await db.query(`ALTER TABLE excel_assignments ADD COLUMN start_row INT NULL AFTER employee_id`);
    console.log('✓ Added start_row to excel_assignments');
  }

  if (!await columnExists('excel_assignments', 'end_row')) {
    await db.query(`ALTER TABLE excel_assignments ADD COLUMN end_row INT NULL AFTER start_row`);
    console.log('✓ Added end_row to excel_assignments');
  }

  if (!await columnExists('excel_assignments', 'assigned_count')) {
    await db.query(`ALTER TABLE excel_assignments ADD COLUMN assigned_count INT NOT NULL DEFAULT 0 AFTER end_row`);
    console.log('✓ Added assigned_count to excel_assignments');
  }

  if (!await columnExists('excel_assignments', 'allocation_method')) {
    await db.query(`ALTER TABLE excel_assignments ADD COLUMN allocation_method VARCHAR(50) NULL DEFAULT 'full' AFTER assigned_count`);
    console.log('✓ Added allocation_method to excel_assignments');
  }

  // 3. Backfill existing assignments into excel_records
  const [assignments] = await db.query(`SELECT id, file_id, employee_id FROM excel_assignments ORDER BY id ASC`);
  for (const asgn of assignments) {
    const [recs] = await db.query(`SELECT id FROM excel_records WHERE file_id = ?`, [asgn.file_id]);
    const total = recs.length;

    // Update assignment record counts
    await db.query(
      `UPDATE excel_assignments SET start_row = 1, end_row = ?, assigned_count = ?, allocation_method = 'full' WHERE id = ?`,
      [total, total, asgn.id]
    );

    // If records for this file don't have assignment_id set yet, set them to this assignment
    await db.query(
      `UPDATE excel_records SET assignment_id = ?, assigned_to = ? WHERE file_id = ? AND assignment_id IS NULL`,
      [asgn.id, asgn.employee_id, asgn.file_id]
    );
  }
  console.log('✓ Backfilled existing assignments and records successfully');

  console.log('--- Migration Completed Successfully ---');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
