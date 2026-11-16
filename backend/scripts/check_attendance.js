require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../config/db');

async function checkAttendance() {
  const [rows] = await db.query(`
    SELECT id, employee_id, employee_name, login_time, logout_time, total_working_hours, session_status, DATE(login_time) as dt, CURDATE() as curdate
    FROM attendance_logs
    ORDER BY id DESC
    LIMIT 20
  `);
  console.log('Recent attendance_logs:', rows);
  process.exit(0);
}

checkAttendance();
