require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../config/db');

async function checkTime() {
  const [[tz]] = await db.query('SELECT CURDATE() as curdate, NOW() as now, @@global.time_zone as gtz, @@session.time_zone as stz');
  console.log('MySQL Time info:', tz);
  console.log('Node JS Local time:', new Date().toString());
  console.log('Node JS ISO time:', new Date().toISOString());
  console.log('Node JS IST time:', new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()));
  process.exit(0);
}

checkTime();
