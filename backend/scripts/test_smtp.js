const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { sendPasswordResetEmail } = require('../utils/mailer');

(async () => {
  try {
    const to = process.env.RESEND_TEST_TO || process.env.RESEND_FROM;
    const resetUrl = 'https://example.com/reset?token=testing';

    if (!to) {
      throw new Error('Set RESEND_TEST_TO before running this script.');
    }

    console.log('Sending test reset email to', to);
    await sendPasswordResetEmail({ to, name: 'CLN Test', resetUrl });
    console.log('Test email sent successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err && err.message ? err.message : err);
    if (err && err.cause) console.error('Cause:', err.cause);
    process.exit(1);
  }
})();
