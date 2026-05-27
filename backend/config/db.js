const mysql = require('mysql2/promise');

const mysqlUrl = process.env.MYSQL_URL || process.env.DATABASE_URL || '';

const poolConfig = mysqlUrl
  ? mysqlUrl
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'cln_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: '+05:30'
    };

const pool = mysql.createPool(poolConfig);

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log('MySQL connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('MySQL connection failed:', err.message);
    console.error('   → Make sure MySQL is running and .env credentials are correct');
  });

module.exports = pool;
