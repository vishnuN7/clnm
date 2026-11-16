require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../config/db');

async function main() {
  const [zeroRows] = await db.query(`
    SELECT id, employee_id, employee_name, login_time, logout_time, total_working_hours, session_status
    FROM attendance_logs
    WHERE total_working_hours = '0.00' AND logout_time = login_time
    ORDER BY id DESC
  `);
  console.log('Total zero-duration closed sessions:', zeroRows.length);
  console.log('Sample of zero-duration rows (first 10):', zeroRows.slice(0, 10));

  // Check login_activities corresponding to these sessions
  for (const r of zeroRows.slice(0, 5)) {
    const [acts] = await db.query(
      'SELECT id, session_id, login_at, logout_at, session_status FROM login_activities WHERE employee_id = ? AND login_at BETWEEN DATE_SUB(?, INTERVAL 5 SECOND) AND DATE_ADD(?, INTERVAL 5 SECOND)',
      [r.employee_id, r.login_time, r.login_time]
    );
    console.log(`Matching login_activities for attendance_log ${r.id}:`, acts);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
