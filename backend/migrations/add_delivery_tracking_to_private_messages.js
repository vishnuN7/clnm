require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../config/db');

async function migrate() {
  console.log('Adding delivery tracking columns to private_messages...');
  const connection = await db.getConnection();

  try {
    const [cols] = await connection.query("SHOW COLUMNS FROM private_messages LIKE 'is_delivered'");
    if (cols.length === 0) {
      await connection.query(`
        ALTER TABLE private_messages
        ADD COLUMN is_delivered TINYINT(1) DEFAULT 0 AFTER otp_purpose,
        ADD COLUMN delivered_at DATETIME NULL AFTER is_delivered,
        ADD INDEX idx_pmsg_delivered (is_delivered)
      `);
      console.log('Columns is_delivered and delivered_at added.');

      // Backfill existing read messages as delivered
      await connection.query(`
        UPDATE private_messages
        SET is_delivered = 1, delivered_at = COALESCE(read_at, created_at)
        WHERE is_read = 1
      `);
      console.log('Existing read messages marked as delivered.');
    } else {
      console.log('Columns is_delivered and delivered_at already exist.');
    }
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate();
