function normalizeResendConfig() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.RESEND_FROM || '').trim();

  if (!apiKey || !from) {
    throw new Error('Resend is not configured. Set RESEND_API_KEY and RESEND_FROM.');
  }

  return { apiKey, from };
}

function buildResetEmail({ name, resetUrl }) {
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

  return { subject, html, text };
}

async function sendViaResend({ to, subject, html, text }) {
  const { apiKey, from } = normalizeResendConfig();
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 15000);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Resend request failed: ${response.status} ${responseText}`);
    }

    return await response.json();
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('Resend request timed out.');
    }

    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (!to || !resetUrl) {
    throw new Error('Password reset email requires both a recipient and reset URL.');
  }

  const { subject, html, text } = buildResetEmail({ name, resetUrl });

  try {
    await sendViaResend({ to, subject, html, text });
  } catch (err) {
    console.error('[Mailer] sendPasswordResetEmail error:', err && err.message ? err.message : err);
    throw err;
  }
}

module.exports = {
  sendPasswordResetEmail
};
