require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../config/db');
const fs = require('fs');

async function main() {
  console.log('=== 1. Checking Environment Variables for R2 & Communication ===');
  const envKeys = Object.keys(process.env).filter(k => 
    k.includes('R2') || k.includes('S3') || k.includes('AWS') || k.includes('COMM') || k.includes('CLEANUP') || k.includes('SOCKET')
  );
  console.log('Relevant ENV Keys:', envKeys);
  for (const k of envKeys) {
    console.log(`  ${k}: ${process.env[k] ? (k.includes('SECRET') || k.includes('KEY') ? '***SET***' : process.env[k]) : 'NOT SET'}`);
  }

  console.log('\n=== 2. Inspecting Communication Tables ===');
  const [tables] = await db.query('SHOW TABLES');
  const tableNames = tables.map(r => Object.values(r)[0]);
  const commTables = tableNames.filter(t => 
    t.includes('comm') || t.includes('private') || t.includes('message') || t.includes('attachment') || t.includes('announc') || t.includes('conversation')
  );
  console.log('Matched Tables:', commTables);

  for (const t of commTables) {
    const [cols] = await db.query(`DESCRIBE \`${t}\``);
    console.log(`\nTable ${t}:`);
    console.log(cols.map(c => `  ${c.Field} (${c.Type}, Null: ${c.Null}, Key: ${c.Key}, Def: ${c.Default})`).join('\n'));
    const [[count]] = await db.query(`SELECT COUNT(*) as cnt FROM \`${t}\``);
    console.log(`  Total rows: ${count.cnt}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
