const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { verifyTransporter, sendPasswordResetEmail } = require('../utils/mailer');

(async () => {
  try {
    console.log('Starting SMTP verification...');
    await verifyTransporter();
    console.log('SMTP verified OK.');

    const to = process.env.SMTP_USER;
    console.log('Sending test reset email to', to);
    await sendPasswordResetEmail({ to, name: 'CLN Test', resetUrl: 'https://example.com/reset?token=testing' });
    console.log('Test email sent successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err && err.message ? err.message : err);
    if (err && err.cause) console.error('Cause:', err.cause);
    process.exit(1);
  }
})();
