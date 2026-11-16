const nodemailer = require('nodemailer');

function cleanEnvValue(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  const hasWrappingQuotes = (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"));
  return hasWrappingQuotes ? rawValue.slice(1, -1).trim() : rawValue;
}

function normalizeResendFrom(value) {
  const rawValue = cleanEnvValue(value || '');
  if (!rawValue) return '';

  const mailtoMatch = rawValue.match(/mailto:([^\]\)\s>]+)/i);
  if (mailtoMatch && mailtoMatch[1]) {
    return mailtoMatch[1].trim();
  }

  const angleMatch = rawValue.match(/<([^>]+)>/);
  if (angleMatch && angleMatch[1]) {
    return angleMatch[1].trim();
  }

  const markdownMailtoMatch = rawValue.match(/\[([^\]]+)\]\(mailto:([^\)]+)\)/i);
  if (markdownMailtoMatch && markdownMailtoMatch[2]) {
    return markdownMailtoMatch[2].trim();
  }

  return rawValue;
}

function normalizeResendConfig() {
  const apiKey = cleanEnvValue(process.env.RESEND_API_KEY || '');
  const from = normalizeResendFrom(process.env.RESEND_FROM || '');

  logResendEnvPresence(apiKey, from);

  if (!apiKey || !from) {
    throw new Error('Resend is not configured. Set RESEND_API_KEY and RESEND_FROM in environment variables.');
  }

  return { apiKey, from };
}

function logResendEnvPresence(apiKey, from) {
  const debugEnabled = String(process.env.RESEND_DEBUG || '').trim().toLowerCase() === 'true';
  if (!debugEnabled) return;

  console.info('[Mailer] Resend env presence:', {
    apiKeyPresent: Boolean(apiKey),
    apiKeyLength: apiKey ? apiKey.length : 0,
    fromPresent: Boolean(from),
    fromLength: from ? from.length : 0
  });
}

function debugMailerEnvironment() {
  const smtpHost = cleanEnvValue(process.env.SMTP_HOST || '');
  const resendKey = cleanEnvValue(process.env.RESEND_API_KEY || '');
  const isRender = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_HOSTNAME);

  if (smtpHost) {
    const port = process.env.SMTP_PORT || '587';
    console.info(`[Mailer] Configured to use SMTP: ${smtpHost}:${port}, User: ${process.env.SMTP_USER}`);
    if (isRender) {
      console.warn('[Mailer] Note: Running on Render. Outbound SMTP ports (25, 465, 587) may be blocked on Free tier services. If SMTP fails, configure RESEND_API_KEY and RESEND_FROM as an HTTP fallback.');
    }
  } else if (resendKey) {
    console.info(`[Mailer] Configured to use Resend API, From: ${process.env.RESEND_FROM}`);
  } else {
    console.warn('[Mailer] WARNING: No mailer transport (SMTP or Resend) is configured!');
  }
}

let smtpTransporter = null;

function getSMTPTransporter() {
  if (smtpTransporter) return smtpTransporter;

  const host = cleanEnvValue(process.env.SMTP_HOST || '');
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = cleanEnvValue(process.env.SMTP_USER || '');
  const pass = cleanEnvValue(process.env.SMTP_PASS || '');
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (!host || !user || !pass) {
    throw new Error('SMTP is not fully configured. Missing SMTP_HOST, SMTP_USER, or SMTP_PASS.');
  }

  const transportOptions = {
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  };

  if (host.includes('gmail.com')) {
    transportOptions.tls = {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2'
    };
  }

  smtpTransporter = nodemailer.createTransport(transportOptions);
  return smtpTransporter;
}

async function sendViaSMTP({ to, subject, html, text }) {
  const user = cleanEnvValue(process.env.SMTP_USER || '');
  const transporter = getSMTPTransporter();
  const fromAddress = cleanEnvValue(process.env.SMTP_FROM || user);

  const mailOptions = {
    from: fromAddress,
    to,
    subject,
    html,
    text
  };

  const info = await transporter.sendMail(mailOptions);
  console.info(`[Mailer] Message sent via SMTP to ${to} (MessageId: ${info.messageId || 'N/A'})`);
  return info;
}

async function sendViaResend({ to, subject, html, text }) {
  const { apiKey, from } = normalizeResendConfig();
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 12000);

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

    const rawBody = await response.text();
    const parsedBody = rawBody ? tryParseJson(rawBody) : null;

    if (!response.ok) {
      const responseMessage = parsedBody?.message || parsedBody?.error || rawBody || response.statusText || 'Unknown error';
      throw new Error(`Resend request failed: ${response.status} ${responseMessage}`);
    }

    if (!parsedBody || typeof parsedBody !== 'object' || !parsedBody.id) {
      throw new Error('Resend request failed: invalid API response.');
    }

    console.info(`[Mailer] Message sent via Resend to ${to} (ID: ${parsedBody.id})`);
    return parsedBody;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('Resend request timed out while sending email.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function sendEmailWithFallback({ to, subject, html, text }) {
  const hasSMTP = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const hasResend = Boolean(process.env.RESEND_API_KEY);

  if (!hasSMTP && !hasResend) {
    throw new Error('No email provider is configured. Please configure SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS) or Resend (RESEND_API_KEY, RESEND_FROM).');
  }

  let smtpError = null;

  if (hasSMTP) {
    try {
      return await sendViaSMTP({ to, subject, html, text });
    } catch (err) {
      smtpError = err;
      console.warn(`[Mailer] SMTP delivery failed to ${to}: ${err.message}`);

      // If Resend is also configured, attempt automatic fallback
      if (hasResend) {
        console.info(`[Mailer] Attempting fallback delivery via Resend API to ${to}...`);
        try {
          const resendResult = await sendViaResend({ to, subject, html, text });
          console.info(`[Mailer] Fallback delivery to ${to} via Resend succeeded.`);
          return resendResult;
        } catch (resendErr) {
          console.error(`[Mailer] Fallback delivery via Resend also failed: ${resendErr.message}`);
          throw new Error(`Email delivery failed on both SMTP (${smtpError.message}) and Resend (${resendErr.message})`);
        }
      } else {
        throw err;
      }
    }
  }

  // If SMTP is not configured, send directly via Resend
  return await sendViaResend({ to, subject, html, text });
}

function buildResetEmail({ name, role, resetUrl }) {
  const roleLabel = role === 'admin' ? 'Administrator' : 'Employee';
  const subject = 'Reset your Dixit Lending Solution account password';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f3f4f6; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); border: 1px solid #e5e7eb;">
          <tr>
            <td style="background: linear-gradient(135deg, #004d2a 0%, #006b3c 60%, #059669 100%); padding: 28px 32px; text-align: center; border-bottom: 3px solid #d4af37;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">
                Dixit Lending Solution
              </h1>
              <p style="margin: 6px 0 0 0; color: #d1fae5; font-size: 13px; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase;">
                CLN Lending Suite &bull; Secure Authentication
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 19px; font-weight: 700; color: #111827;">
                Password Reset Request
              </h2>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #374151;">
                Hello <strong>${name || 'there'}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #374151;">
                We received a request to reset the password for your Dixit Lending Solution <strong>${roleLabel}</strong> account.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #006b3c; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 32px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0, 107, 60, 0.35); text-align: center;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 24px 0 16px 0;">
                <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">
                  Button not working? Copy and paste this link:
                </p>
                <p style="margin: 0; font-size: 13px; word-break: break-all; line-height: 1.5;">
                  <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="color: #006b3c; text-decoration: underline;">
                    ${resetUrl}
                  </a>
                </p>
              </div>
              <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                  &bull; <strong>Expiration:</strong> This reset link will expire in <strong>30 minutes</strong>.
                </p>
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                  &bull; <strong>Single-use:</strong> For security, this link can be used only once.
                </p>
                <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                  &bull; <strong>Did not request this?</strong> If you did not make this request, you can safely ignore this email. Your current password remains unchanged.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #9ca3af;">
                &copy; 2026 Dixit Lending Solution. All rights reserved.
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                Assistance &amp; Support: <a href="mailto:avitecin@gmail.com" style="color: #006b3c; text-decoration: none;">avitecin@gmail.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'Dixit Lending Solution — Password Reset Request',
    '===============================================',
    '',
    `Hello ${name || 'there'},`,
    '',
    `We received a request to reset the password for your Dixit Lending Solution ${roleLabel} account.`,
    '',
    'Click the link below or copy and paste it into your browser to reset your password:',
    resetUrl,
    '',
    'Important security notes:',
    '- This reset link will expire in 30 minutes.',
    '- This link is single-use and can only be used once.',
    '- If you did not request a password reset, you can safely ignore this email. Your password will not change.',
    '',
    '© 2026 Dixit Lending Solution. All rights reserved.',
    'Support: avitecin@gmail.com'
  ].join('\n');

  return { subject, html, text };
}

async function sendPasswordResetEmail({ to, name, role, resetUrl }) {
  if (!to || !resetUrl) {
    throw new Error('Password reset email requires both a recipient and reset URL.');
  }

  const { subject, html, text } = buildResetEmail({ name, role, resetUrl });

  try {
    return await sendEmailWithFallback({ to, subject, html, text });
  } catch (err) {
    console.error('[Mailer] sendPasswordResetEmail error:', err && err.message ? err.message : err);
    throw err;
  }
}

async function sendSystemNotificationEmail({ to, name, subject, message }) {
  if (!to || !message) {
    throw new Error('System notification email requires a recipient and message.');
  }

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin-bottom: 16px;">System Notification</h2>
      <p>Hello ${name || 'there'},</p>
      <p>${message}</p>
      <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">This is an automated system notification from Dixit Lending Solution.</p>
    </div>
  `;

  const text = `Hello ${name || 'there'},\n\n${message}\n\nThis is an automated system notification from Dixit Lending Solution.`;

  try {
    return await sendEmailWithFallback({ to, subject, html, text });
  } catch (err) {
    console.error('[Mailer] sendSystemNotificationEmail error:', err && err.message ? err.message : err);
    throw err;
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendSystemNotificationEmail,
  debugResendEnvironment: debugMailerEnvironment,
  debugMailerEnvironment
};
