/**
 * Migration: Add IP Geolocation columns to attendance_logs, login_history,
 * and create ip_geolocation_cache table.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../config/db');

async function migrate() {
  try {
    console.log('--- Starting Location Columns Migration ---');

    // 1. Create ip_geolocation_cache table
    await db.query(`
      CREATE TABLE IF NOT EXISTS ip_geolocation_cache (
        ip_address VARCHAR(64) PRIMARY KEY,
        city VARCHAR(100) NULL,
        region VARCHAR(100) NULL,
        country VARCHAR(100) NULL,
        country_code VARCHAR(10) NULL,
        isp VARCHAR(150) NULL,
        latitude DECIMAL(10, 7) NULL,
        longitude DECIMAL(10, 7) NULL,
        source VARCHAR(50) NULL,
        resolved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_resolved_at (resolved_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('ip_geolocation_cache table created / verified.');

    const locCols = [
      { name: 'location_city',         def: 'VARCHAR(100) NULL' },
      { name: 'location_region',       def: 'VARCHAR(100) NULL' },
      { name: 'location_country',      def: 'VARCHAR(100) NULL' },
      { name: 'location_country_code', def: 'VARCHAR(10) NULL' },
      { name: 'location_isp',          def: 'VARCHAR(150) NULL' },
      { name: 'latitude',              def: 'DECIMAL(10, 7) NULL' },
      { name: 'longitude',             def: 'DECIMAL(10, 7) NULL' },
      { name: 'location_source',       def: 'VARCHAR(50) NULL' },
      { name: 'location_resolved_at',   def: 'TIMESTAMP NULL' }
    ];

    // 2. Add columns to attendance_logs
    const [cols1] = await db.query('SHOW COLUMNS FROM attendance_logs');
    const names1 = cols1.map(c => c.Field);
    for (const c of locCols) {
      if (!names1.includes(c.name)) {
        await db.query(`ALTER TABLE attendance_logs ADD COLUMN ${c.name} ${c.def}`);
        console.log(`Added column '${c.name}' to 'attendance_logs'.`);
      }
    }

    // 3. Add columns to login_history
    const [cols2] = await db.query('SHOW COLUMNS FROM login_history');
    const names2 = cols2.map(c => c.Field);
    for (const c of locCols) {
      if (!names2.includes(c.name)) {
        await db.query(`ALTER TABLE login_history ADD COLUMN ${c.name} ${c.def}`);
        console.log(`Added column '${c.name}' to 'login_history'.`);
      }
    }

    console.log('--- Migration Completed Successfully ---');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  }
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = migrate;
