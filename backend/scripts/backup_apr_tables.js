require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../config/db');
const fs = require('fs');
const path = require('path');

async function backup() {
  try {
    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tables = ['attendance_logs', 'break_records', 'break_rules', 'users'];

    for (const tbl of tables) {
      const [rows] = await db.query(`SELECT * FROM \`${tbl}\``);
      const filePath = path.join(backupDir, `${tbl}_backup_${timestamp}.json`);
      fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
      console.log(`Backed up ${rows.length} rows from ${tbl} to ${filePath}`);
    }

    console.log('Backup completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Backup failed:', err);
    process.exit(1);
  }
}

backup();
