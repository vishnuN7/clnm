const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../config/db');

(async () => {
  try {
    const email = 'dixitlendingsolution@gmail.com';
    const [users] = await db.query('SELECT id, email FROM users WHERE email = ? LIMIT 1', [email]);
    if (!users || users.length === 0) {
      console.log('No user found with email', email);
      process.exit(0);
    }
    const userId = users[0].id;
    const [rows] = await db.query('SELECT id, token_hash, expires_at, used_at, created_at FROM password_reset_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [userId]);
    if (!rows || rows.length === 0) {
      console.log('No password reset tokens found for user', email);
      process.exit(0);
    }
    console.log('Recent password reset tokens for', email, ':');
    rows.forEach(r => console.log(r));
    process.exit(0);
  } catch (err) {
    console.error('Error querying DB:', err.message || err);
    process.exit(1);
  }
})();
