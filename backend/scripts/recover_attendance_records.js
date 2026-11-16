require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../config/db');

async function recover() {
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
  `);

  console.log(`Recovering ${candidates.length} attendance log rows...`);

  let recoveredCount = 0;
  for (const c of candidates) {
    const durationHours = Number((Math.min(c.act_duration_sec, 12 * 3600) / 3600).toFixed(2));
    await db.query(
      'UPDATE attendance_logs SET logout_time = ?, total_working_hours = ?, session_status = "Logged Out" WHERE id = ?',
      [c.logout_at, durationHours, c.attendance_id]
    );
    console.log(`✅ Recovered Attendance Log #${c.attendance_id}: set logout_time = ${c.logout_at.toISOString()}, total_working_hours = ${durationHours}`);
    recoveredCount++;
  }

  console.log(`Successfully recovered ${recoveredCount} records.`);
  process.exit(0);
}

recover().catch(err => {
  console.error(err);
  process.exit(1);
});
