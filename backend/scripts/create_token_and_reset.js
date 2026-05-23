const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../config/db');
const crypto = require('crypto');

const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: fetch}) => fetch(...args)));

(async () => {
  try {
    const email = 'dixitlendingsolution@gmail.com';
    const rawToken = 'manual-test-token-0001';
    const newPassword = 'AdminNewP@ss123';

    const [users] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (!users || users.length === 0) {
      console.error('User not found:', email);
      process.exit(1);
    }
    const userId = users[0].id;

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // delete old tokens for user
    await db.query('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);

    await db.query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [userId, tokenHash, expiresAt]);
    console.log('Inserted manual reset token for user', email);

    // Call reset endpoint (use TARGET_PORT or PORT env if provided)
    const port = process.env.TARGET_PORT || process.env.PORT || 5000;
    const res = await fetch(`http://localhost:${port}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken, password: newPassword, confirmPassword: newPassword })
    });
    const data = await res.json().catch(() => null);
    console.log('Reset response status:', res.status);
    console.log('Reset response body:', data);

    // Optionally verify login using new password (not implemented)
    process.exit(0);
  } catch (err) {
    console.error('Error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
