require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../config/db');

async function testRecovery() {
  const [candidates] = await db.query(`
    SELECT al.id AS attendance_id, al.employee_id, al.login_time, al.logout_time, al.total_working_hours,
           la.id AS activity_id, la.login_at, la.logout_at,
           TIMESTAMPDIFF(SECOND, la.login_at, la.logout_at) AS act_duration_sec
    FROM attendance_logs al
    JOIN login_activities la ON la.employee_id = al.employee_id
      AND la.login_at BETWEEN DATE_SUB(al.login_time, INTERVAL 5 SECOND) AND DATE_ADD(al.login_time, INTERVAL 5 SECOND)
    WHERE al.total_working_hours = '0.00'
      AND al.logout_time = al.login_time
      AND la.logout_at IS NOT NULL
      AND la.logout_at > la.login_at
    ORDER BY al.id DESC
  `);

  console.log(`Found ${candidates.length} recoverable attendance logs:`);
  for (const c of candidates) {
    const hours = (c.act_duration_sec / 3600).toFixed(2);
    console.log(`Attendance ID ${c.attendance_id} (Emp ${c.employee_id}): Login ${c.login_time.toISOString()}, Act Logout ${c.logout_at.toISOString()}, Duration ${c.act_duration_sec}s (${hours}h)`);
  }

  process.exit(0);
}

testRecovery().catch(err => {
  console.error(err);
  process.exit(1);
});
