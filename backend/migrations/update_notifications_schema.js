require('../node_modules/dotenv').config({ path: __dirname + '/../.env' });
const db = require('../config/db');

async function migrate() {
  const [cols] = await db.query('DESC employee_notifications');
  const existing = cols.map(c => c.Field);
  const needed = [
    { name: 'expires_at', def: 'TIMESTAMP NULL AFTER read_at' },
    { name: 'status', def: "VARCHAR(20) NOT NULL DEFAULT 'active' AFTER expires_at" },
    { name: 'priority', def: "VARCHAR(20) NOT NULL DEFAULT 'normal' AFTER status" },
    { name: 'entity_type', def: 'VARCHAR(50) NULL AFTER priority' },
    { name: 'entity_id', def: 'INT NULL AFTER entity_type' },
    { name: 'assignment_id', def: 'INT NULL AFTER entity_id' },
    { name: 'record_id', def: 'INT NULL AFTER assignment_id' },
    { name: 'customer_id', def: 'INT NULL AFTER record_id' },
    { name: 'loan_id', def: 'INT NULL AFTER customer_id' }
  ];

  for (const col of needed) {
    if (!existing.includes(col.name)) {
      await db.query(`ALTER TABLE employee_notifications ADD COLUMN ${col.name} ${col.def}`);
      console.log('Added column:', col.name);
    }
  }

  // Ensure index on (employee_id, expires_at) and (employee_id, status)
  const [indexes] = await db.query('SHOW INDEX FROM employee_notifications');
  const indexNames = indexes.map(i => i.Key_name);
  if (!indexNames.includes('idx_emp_expires')) {
    await db.query('ALTER TABLE employee_notifications ADD INDEX idx_emp_expires (employee_id, expires_at)');
    console.log('Added index idx_emp_expires');
  }
  if (!indexNames.includes('idx_emp_status')) {
    await db.query('ALTER TABLE employee_notifications ADD INDEX idx_emp_status (employee_id, status)');
    console.log('Added index idx_emp_status');
  }

  // Populate expires_at for existing notifications: created_at + 24 hours
  await db.query(`
    UPDATE employee_notifications
    SET expires_at = DATE_ADD(created_at, INTERVAL 24 HOUR)
    WHERE expires_at IS NULL
  `);

  // Update status for expired records
  await db.query(`
    UPDATE employee_notifications
    SET status = 'expired'
    WHERE expires_at <= NOW() AND status != 'expired'
  `);

  // Sync reference_id to assignment_id / record_id where applicable
  await db.query(`
    UPDATE employee_notifications
    SET assignment_id = reference_id
    WHERE assignment_id IS NULL AND (reference_type = 'assignment' OR type IN ('assignment', 'work_assigned', 'assignment_updated'))
  `);

  console.log('employee_notifications migration complete.');
}

if (require.main === module) {
  require('../node_modules/dotenv').config({ path: __dirname + '/../.env' });
  migrate().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = migrate;
