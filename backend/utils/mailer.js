const nodemailer = require('nodemailer');
const dns = require('dns');

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

function normalizeSmtpConfig() {
  const rawHost = String(process.env.SMTP_HOST || '').trim();
  const rawUser = String(process.env.SMTP_USER || '').trim();
  const rawPass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');

  // Some deployments accidentally put the sender email into SMTP_HOST.
  // If that happens, assume Gmail SMTP and treat the value as the username.
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawHost);
  const host = !rawHost || looksLikeEmail ? 'smtp.gmail.com' : rawHost;
  const user = rawUser || (looksLikeEmail ? rawHost : '');

  return {
    host,
    port: Number(process.env.SMTP_PORT || 587),
    user,
    pass: rawPass,
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT || 587) === 465
  };
}

function createTransport() {
  const { host, port, user, pass, secure } = normalizeSmtpConfig();

  if (!host || !user || !pass) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    family: 4,
    lookup: (hostname, options, callback) => dns.lookup(hostname, { ...options, family: 4 }, callback),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    auth: { user, pass }
  });
}

async function verifyTransporter() {
  const transporter = createTransport();
  try {
    await transporter.verify();
    return true;
  } catch (err) {
    // rethrow with contextual message
    const e = new Error(`SMTP verification failed: ${err && err.message ? err.message : String(err)}`);
    e.cause = err;
    throw e;
  }
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const transporter = createTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const subject = 'Reset your CLN password';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin-bottom: 16px;">Password reset request</h2>
      <p>Hello ${name || 'there'},</p>
      <p>We received a request to reset the password for your CLN admin account.</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;">Reset password</a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link will expire soon for your security.</p>
    </div>
  `;

  const text = [
    `Hello ${name || 'there'},`,
    '',
    'We received a request to reset the password for your CLN admin account.',
    '',
    `Reset it here: ${resetUrl}`,
    '',
    'This link will expire soon for your security.'
  ].join('\n');

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html
    });
  } catch (err) {
    console.error('[Mailer] sendPasswordResetEmail error:', err && err.message ? err.message : err);
    throw err;
  }
}

module.exports = {
  sendPasswordResetEmail,
  verifyTransporter
};