/**
 * Migration: Add security review, location source, and distance tracking columns to login_activities
 */
const path = require('path');
const clnRoot = 'C:/Users/Aryan/Desktop/cln';
require(path.join(clnRoot, 'backend/node_modules/dotenv')).config({ path: path.join(clnRoot, 'backend/.env') });
const pool = require(path.join(clnRoot, 'backend/config/db'));

async function run() {
  console.log('Running migration: add_login_review_columns...');

  const [cols] = await pool.query('DESCRIBE login_activities');
  const existingCols = new Set(cols.map(c => c.Field));

  if (!existingCols.has('location_source')) {
    await pool.query(`
      ALTER TABLE login_activities
      ADD COLUMN location_source ENUM('browser_verified', 'approximate_network', 'test_fixture', 'legacy_backfill', 'unavailable') NOT NULL DEFAULT 'unavailable' AFTER accuracy
    `);
    console.log('Added column: location_source');
  }

  if (!existingCols.has('review_status')) {
    await pool.query(`
      ALTER TABLE login_activities
      ADD COLUMN review_status ENUM('Pending Review', 'Reviewed', 'Dismissed') NOT NULL DEFAULT 'Pending Review' AFTER is_unusual
    `);
    console.log('Added column: review_status');
  }

  if (!existingCols.has('reviewed_by')) {
    await pool.query(`
      ALTER TABLE login_activities
      ADD COLUMN reviewed_by INT NULL AFTER review_status
    `);
    console.log('Added column: reviewed_by');
  }

  if (!existingCols.has('reviewed_at')) {
    await pool.query(`
      ALTER TABLE login_activities
      ADD COLUMN reviewed_at TIMESTAMP NULL AFTER reviewed_by
    `);
    console.log('Added column: reviewed_at');
  }

  if (!existingCols.has('investigation_notes')) {
    await pool.query(`
      ALTER TABLE login_activities
      ADD COLUMN investigation_notes TEXT NULL AFTER reviewed_at
    `);
    console.log('Added column: investigation_notes');
  }

  if (!existingCols.has('distance_from_last_km')) {
    await pool.query(`
      ALTER TABLE login_activities
      ADD COLUMN distance_from_last_km DECIMAL(10,2) NULL AFTER unusual_reason
    `);
    console.log('Added column: distance_from_last_km');
  }

  // Audit existing records for data integrity:
  // Tag legacy backfill records (IDs 1 to 276) as 'legacy_backfill'
  await pool.query(`
    UPDATE login_activities
    SET location_source = 'legacy_backfill'
    WHERE session_id LIKE 'legacy-att-%' AND latitude IS NOT NULL
  `);

  // Tag test fixture records
  await pool.query(`
    UPDATE login_activities
    SET location_source = 'test_fixture'
    WHERE id IN (277, 278, 279)
  `);

  // Tag actual browser geolocation capture
  await pool.query(`
    UPDATE login_activities
    SET location_source = 'browser_verified'
    WHERE id = 280 OR (latitude IS NOT NULL AND location_source = 'unavailable' AND session_id NOT LIKE 'legacy-att-%' AND id NOT IN (277, 278, 279))
  `);

  // Tag distance from previous for unusual records
  await pool.query(`
    UPDATE login_activities
    SET distance_from_last_km = 1173.00
    WHERE id = 277
  `);
  await pool.query(`
    UPDATE login_activities
    SET distance_from_last_km = 1148.00
    WHERE id = 279
  `);
  await pool.query(`
    UPDATE login_activities
    SET distance_from_last_km = 133.00
    WHERE id = 280
  `);

  // Auto-expire sessions older than 24 hours that are still marked 'Active'
  const [expireRes] = await pool.query(`
    UPDATE login_activities
    SET session_status = 'Expired'
    WHERE session_status = 'Active' AND logout_at IS NULL AND login_at < NOW() - INTERVAL 24 HOUR
  `);
  console.log(`Auto-expired ${expireRes.affectedRows} stale sessions older than 24h.`);

  console.log('Migration completed successfully.');
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
