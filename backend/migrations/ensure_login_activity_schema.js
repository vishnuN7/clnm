/**
 * Migration: make sure the Login Activity feature has every column it needs.
 *
 * Runs on every server start (see server.js), is safe to run repeatedly, and
 * only adds what is missing. It replaces the old add_login_review_columns.js
 * script, which was never called by the server (and had local Windows paths
 * and test-data fixes hardcoded in it).
 */
const db = require('../config/db');

async function hasTable(table) {
  const [rows] = await db.query(
    'SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
    [table]
  );
  return rows.length > 0;
}

async function hasColumn(table, column) {
  const [rows] = await db.query(
    'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}

// Columns the Login Activity controller reads/writes on login_activities.
// Order matters: each AFTER column must already exist when it is added.
const REVIEW_COLUMNS = [
  { name: 'location_source',
    def: "ENUM('browser_verified','approximate_network','test_fixture','legacy_backfill','unavailable') NOT NULL DEFAULT 'unavailable' AFTER accuracy" },
  { name: 'distance_from_last_km', def: 'DECIMAL(10,2) NULL AFTER unusual_reason' },
  { name: 'review_status',
    def: "ENUM('Pending Review','Reviewed','Dismissed') NOT NULL DEFAULT 'Pending Review' AFTER is_unusual" },
  { name: 'reviewed_by',         def: 'INT NULL AFTER review_status' },
  { name: 'reviewed_at',         def: 'TIMESTAMP NULL AFTER reviewed_by' },
  { name: 'investigation_notes', def: 'TEXT NULL AFTER reviewed_at' }
];

module.exports = async function ensureLoginActivitySchema() {
  try {
    if (!(await hasTable('login_activities'))) {
      console.warn('[Migration] login_activities table not found - skipping login activity schema check.');
      return;
    }

    // users.department is shown on the Login Activity page.
    if (!(await hasColumn('users', 'department'))) {
      await db.query('ALTER TABLE users ADD COLUMN department VARCHAR(50) NULL');
      console.log("[Migration] Added column 'department' to 'users'.");
    }

    for (const col of REVIEW_COLUMNS) {
      if (!(await hasColumn('login_activities', col.name))) {
        await db.query(`ALTER TABLE login_activities ADD COLUMN ${col.name} ${col.def}`);
        console.log(`[Migration] Added column '${col.name}' to 'login_activities'.`);
      }
    }

    console.log('[Migration] Login Activity schema verified.');
  } catch (err) {
    console.error('[Migration] Failed to ensure Login Activity schema:', err.message);
  }
};
