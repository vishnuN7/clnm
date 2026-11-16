require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../config/db');
const fs = require('fs');

async function main() {
  try {
    const [tables] = await db.query('SHOW TABLES');
    const tableNames = tables.map(r => Object.values(r)[0]);
    console.log('Tables:', tableNames);

    const aprRelatedTables = tableNames.filter(t =>
      t.includes('attendance') ||
      t.includes('break') ||
      t.includes('apr') ||
      t.includes('session') ||
      t.includes('login') ||
      t.includes('user')
    );
    console.log('APR related tables:', aprRelatedTables);

    for (const tbl of aprRelatedTables) {
      const [cols] = await db.query(`DESCRIBE \`${tbl}\``);
      console.log(`\n--- Structure of ${tbl} ---`);
      console.log(cols.map(c => `${c.Field} (${c.Type}, Null: ${c.Null}, Key: ${c.Key}, Default: ${c.Default})`).join('\n'));
      const [countRes] = await db.query(`SELECT COUNT(*) as cnt FROM \`${tbl}\``);
      console.log(`Count in ${tbl}: ${countRes[0].cnt}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
