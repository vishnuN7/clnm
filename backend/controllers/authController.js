const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UserModel = require('../models/userModel');
const PasswordResetModel = require('../models/passwordResetModel');
const { sendPasswordResetEmail } = require('../utils/mailer');
const db = require('../config/db');
const { recordFailedLogin, recordSuccessfulLogin } = require('../middleware/rateLimit');
const geolocationService = require('../services/geolocationService');
const { checkOfficeNetwork, OFFICE_ONLY_MESSAGE } = require('../middleware/officeNetwork');

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Parse a User-Agent string into device, browser, and OS fields.
 * @param {string|null} ua - The User-Agent header value
 * @returns {{ device: string, browser: string, os: string }}
 */
function parseUA(ua) {
  if (!ua) return { device: 'Unknown', browser: 'Unknown', os: 'Unknown' };

  // Detect OS
  let os = 'Unknown';
  if (/windows nt/i.test(ua))        os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua))      os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/linux/i.test(ua))        os = 'Linux';
  else if (/cros/i.test(ua))         os = 'ChromeOS';

  // Detect Browser
  let browser = 'Unknown';
  if (/edg\//i.test(ua))             browser = 'Edge';
  else if (/opr\//i.test(ua))        browser = 'Opera';
  else if (/chrome/i.test(ua))       browser = 'Chrome';
  else if (/firefox/i.test(ua))      browser = 'Firefox';
  else if (/safari/i.test(ua))       browser = 'Safari';
  else if (/msie|trident/i.test(ua)) browser = 'Internet Explorer';

  // Detect Device type
  let device = 'Desktop';
  if (/mobile/i.test(ua))            device = 'Mobile';
  else if (/tablet|ipad/i.test(ua))  device = 'Tablet';

  return { device, browser, os };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getFrontendBaseUrl(req) {
  // 1. Explicit environment variable FRONTEND_BASE_URL or FRONTEND_URL
  const envFrontend = process.env.FRONTEND_BASE_URL || process.env.FRONTEND_URL;
  if (envFrontend && envFrontend.trim()) {
    const firstUrl = envFrontend.split(',')[0].trim().replace(/\/$/, '');
    if (firstUrl) return firstUrl;
  }

  // 2. Request Origin header sent by browser fetch/XHR
  const origin = req.get('origin');
  if (origin && typeof origin === 'string') {
    const cleanOrigin = origin.trim().replace(/\/$/, '');
    try {
      const parsed = new URL(cleanOrigin);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return cleanOrigin;
      }
    } catch {}
  }

  // 3. Request Referer header
  const referer = req.get('referer');
  if (referer && typeof referer === 'string') {
    try {
      const parsed = new URL(referer);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {}
  }

  // 4. ALLOWED_ORIGIN env var
  const envAllowed = process.env.ALLOWED_ORIGIN;
  if (envAllowed && envAllowed.trim()) {
    const origins = envAllowed.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
    const prodOrigin = origins.find(o => o.startsWith('https://'));
    if (prodOrigin) return prodOrigin;
    if (origins.length > 0) return origins[0];
  }

  // 5. In production, default to production domain
  if (process.env.NODE_ENV === 'production') {
    return 'https://dixitlendingsolution.in';
  }

  // 6. Host fallback (respecting proxy headers)
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:5000';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${host}`.replace(/\/$/, '');
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function formatTimeToAMPM(timeStr) {
  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const formattedHour = hour % 12 || 12;
  const paddedHour = String(formattedHour).padStart(2, '0');
  return `${paddedHour}:${minStr} ${ampm}`;
}

const authController = {
  /**
   * POST /api/auth/login
   * IP restriction for employees is applied via middleware before this
   */
  async login(req, res) {
    try {
      const { email, password, role, keepMeSignedIn } = req.body;

      if (!email || !password || !role) {
        return res.status(400).json({ success: false, message: 'Email, password, and role are required.' });
      }

      const normalized = normalizeEmail(email);

      // Enforce Admin account restriction: only authorized Admin email is allowed
      const AUTHORIZED_ADMIN_EMAIL = 'dixitlendingsolution@gmail.com';
      if (role === 'admin' && normalized !== AUTHORIZED_ADMIN_EMAIL) {
        recordFailedLogin(req.ip, normalized);
        return res.status(403).json({ success: false, message: 'This account is not authorized for Admin access.' });
      }

      const user = await UserModel.findByEmail(normalized);

      if (!user) {
        recordFailedLogin(req.ip, normalized);
        // Don't reveal if email exists or not (prevents user enumeration)
        return res.status(401).json({ success: false, message: 'Authentication failed. Please check your credentials.' });
      }

      if (user.role === 'admin' && normalized !== AUTHORIZED_ADMIN_EMAIL) {
        recordFailedLogin(req.ip, normalized);
        return res.status(403).json({ success: false, message: 'This account is not authorized for Admin access.' });
      }

      if (user.role === 'employee') {
        // Manual override = full access regardless of business hours
        if (user.manual_override === 1 && user.is_active === 1) {
          // Override is active — skip all business hours checks, fall through to password check
        } else {
          // Hard-deactivated by admin
          if (!user.is_active && user.auto_deactivated === 0) {
            return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });
          }

          const [settings] = await db.query('SELECT * FROM system_settings');
          const settingsMap = {};
          settings.forEach(s => settingsMap[s.setting_key] = s.setting_value);

          const startTime = settingsMap['auto_activation_time'] || '07:00';
          const endTime = settingsMap['auto_deactivation_time'] || '20:00';

          const options = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false };
          const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(new Date());
          const hour = parts.find(p => p.type === 'hour')?.value;
          const minute = parts.find(p => p.type === 'minute')?.value;
          const currentTime = `${hour}:${minute}`;

          const isOutsideWorkingHours = currentTime < startTime || currentTime >= endTime;

          if (user.auto_deactivated === 1 || !user.is_active || isOutsideWorkingHours) {
            const startAMPM = formatTimeToAMPM(startTime);
            const endAMPM = formatTimeToAMPM(endTime);
            return res.status(403).json({
              success: false,
              message: `Your account has been automatically deactivated as business hours have ended.\nWorking hours: ${startAMPM} - ${endAMPM}.`
            });
          }
        }
      } else {
        if (!user.is_active) {
          return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });
        }
      }

      if (user.role !== role) {
        recordFailedLogin(req.ip, normalized);
        return res.status(403).json({ success: false, message: `This account is not registered as ${role}.` });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        recordFailedLogin(req.ip, normalized);
        return res.status(401).json({ success: false, message: 'Authentication failed. Please check your credentials.' });
      }

      // Employees may only sign in from the office network (admins are exempt)
      if (user.role === 'employee') {
        const net = checkOfficeNetwork(req);
        if (!net.allowed) {
          console.warn(`[OfficeNetwork] Blocked employee login ${normalized} from ${net.ip}`);
          return res.status(403).json({ success: false, code: 'OFFICE_NETWORK_REQUIRED', message: OFFICE_ONLY_MESSAGE });
        }
      }

      // Credentials valid — reset any failed attempt counters immediately
      recordSuccessfulLogin(req.ip, normalized);

      const expiresIn = keepMeSignedIn ? '30d' : (process.env.JWT_EXPIRES_IN || '8h');
      const token = jwt.sign(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          token_version: user.token_version || 1
        },
        process.env.JWT_SECRET,
        { expiresIn }
      );

      const ip = geolocationService.extractClientIp(req) || '::1';
      const device = req.headers['user-agent'] || null;
      const uaInfo = parseUA(device);

      // Resolve IP geolocation
      let geo = null;
      try {
        geo = await geolocationService.resolveIpLocation(ip);
      } catch (geoErr) {
        console.warn('[AuthController] IP location resolution error:', geoErr.message);
        geo = {
          city: null,
          region: null,
          country: null,
          country_code: null,
          isp: null,
          latitude: null,
          longitude: null,
          source: 'error'
        };
      }

      // Generate unique session identifier for tracking
      const sessionId = crypto.randomUUID();
      let activityId = null;

      // Attendance logs & Login Activities tracking for employees
      if (user.role === 'employee') {
        const [activeSessions] = await db.query(
          'SELECT id, login_time FROM attendance_logs WHERE employee_id = ? AND session_status = "Active Session" AND logout_time IS NULL',
          [user.id]
        );
        const loginNow = new Date();
        const todayYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(loginNow);

        for (const s of activeSessions) {
          const sessionLoginTime = new Date(s.login_time);
          const sessionYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(sessionLoginTime);

          let closeTime;
          if (todayYmd === sessionYmd) {
            // Re-authenticating on the same day (e.g. after clearing cookies/browsing data, browser restart):
            // Credit full active duration up to right now, preventing zero-duration data wipe!
            closeTime = loginNow;
          } else {
            // Past day unclosed session: credit up to last_active_at if valid, else standard 8h shift capped at midnight
            if (user.last_active_at && new Date(user.last_active_at) > sessionLoginTime) {
              closeTime = new Date(user.last_active_at);
            } else {
              closeTime = new Date(Math.min(sessionLoginTime.getTime() + 8 * 3600 * 1000, loginNow.getTime()));
            }
          }

          const rawSec = Math.max(0, Math.floor((closeTime.getTime() - sessionLoginTime.getTime()) / 1000));
          const durationSec = Math.min(rawSec, 12 * 3600);
          closeTime = new Date(sessionLoginTime.getTime() + durationSec * 1000);
          const durationHours = Number((durationSec / 3600).toFixed(2));
          await db.query(
            'UPDATE attendance_logs SET logout_time = ?, total_working_hours = ?, session_status = "Logged Out" WHERE id = ?',
            [closeTime, durationHours, s.id]
          );
        }

        // Close previous active login_activities sessions for session isolation
        await db.query(
          'UPDATE login_activities SET logout_at = NOW(), session_status = "Logged Out" WHERE employee_id = ? AND session_status = "Active"',
          [user.id]
        ).catch(() => {});

        // Create new active session record in login_activities
        try {
          const [actResult] = await db.query(
            `INSERT INTO login_activities 
              (employee_id, session_id, ip_address, device_type, operating_system, browser, user_agent, permission_status, capture_status, login_at, session_status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'prompt', 'pending', NOW(), 'Active')`,
            [user.id, sessionId, ip, uaInfo.device, uaInfo.os, uaInfo.browser, device]
          );
          activityId = actResult.insertId;
        } catch (actErr) {
          console.warn('[Auth] Error creating login_activities row:', actErr.message);
        }

        // Create new active session record in attendance_logs with location
        await db.query(
          `INSERT INTO attendance_logs 
            (employee_id, employee_name, login_time, session_status, ip_address, device, browser, os,
             location_city, location_region, location_country, location_country_code, location_isp, latitude, longitude, location_source, location_resolved_at) 
           VALUES (?, ?, NOW(), "Active Session", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            user.id,
            user.name,
            ip,
            uaInfo.device,
            uaInfo.browser,
            uaInfo.os,
            geo?.city || null,
            geo?.region || null,
            geo?.country || null,
            geo?.country_code || null,
            geo?.isp || null,
            geo?.latitude != null ? geo.latitude : null,
            geo?.longitude != null ? geo.longitude : null,
            geo?.source || null
          ]
        );

        // Check if employee has an active break in progress to preserve their break status across re-authentication
        const [activeBreaks] = await db.query(
          'SELECT id FROM break_records WHERE employee_id = ? AND end_time IS NULL LIMIT 1',
          [user.id]
        );
        const resolvedCurrentStatus = (activeBreaks && activeBreaks.length > 0) ? 'On Break' : 'Available';

        // Update user status in DB
        await db.query(
          "UPDATE users SET current_status = ?, last_active_at = NOW() WHERE id = ?",
          [resolvedCurrentStatus, user.id]
        );
      }

      // Log login event in login_history (for all roles) with location
      await db.query(
        `INSERT INTO login_history 
          (user_id, login_time, ip_address, device, status,
           location_city, location_region, location_country, location_country_code, location_isp, latitude, longitude, location_source, location_resolved_at) 
         VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          user.id,
          ip,
          device,
          'Success',
          geo?.city || null,
          geo?.region || null,
          geo?.country || null,
          geo?.country_code || null,
          geo?.isp || null,
          geo?.latitude != null ? geo.latitude : null,
          geo?.longitude != null ? geo.longitude : null,
          geo?.source || null
        ]
      ).catch(() => {}); // Non-blocking
      await db.query(
        'INSERT INTO user_activity_logs (user_id, activity, status, ip_address) VALUES (?, ?, ?, ?)',
        [user.id, 'Logged in', 'Success', ip]
      ).catch(() => {}); // Non-blocking

      // Seed notification/bank/emergency preferences row if not exists
      await db.query('INSERT IGNORE INTO notification_preferences (user_id) VALUES (?)', [user.id]).catch(() => {});
      await db.query('INSERT IGNORE INTO bank_details (user_id) VALUES (?)', [user.id]).catch(() => {});
      await db.query('INSERT IGNORE INTO emergency_contacts (user_id) VALUES (?)', [user.id]).catch(() => {});

      return res.json({
        success: true,
        message: 'Login successful',
        token,
        session_id: sessionId,
        activity_id: activityId,
        must_change_password: Boolean(user.must_change_password),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          must_change_password: Boolean(user.must_change_password),
          profile_picture: user.profile_picture || null
        }
      });
    } catch (err) {
      console.error('[Auth] Login error:', err);
      return res.status(500).json({ success: false, message: 'Server error during login.' });
    }
  },

  /**
   * GET /api/auth/me
   * Return current user info from token
   */
  async getMe(req, res) {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
      return res.json({ success: true, user });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  },

  /**
   * POST /api/auth/forgot-password
   * Sends an email with a reset link for Admin or Employee account.
   */
  async forgotPassword(req, res) {
    try {
      const email = normalizeEmail(req.body.email);

      if (!email) {
        return res.status(400).json({ success: false, message: 'Email address is required.' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
      }

      const genericMessage = 'If your email is registered with an account, a password reset link has been sent. Please check your inbox and spam folder.';

      const user = await UserModel.findByEmail(email);

      // Keep response generic to prevent user enumeration if user not found or deactivated
      if (!user || user.is_active === 0) {
        return res.json({
          success: true,
          message: genericMessage
        });
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      const baseUrl = getFrontendBaseUrl(req);
      const resetUrl = `${baseUrl}/reset-password.html?token=${rawToken}`;

      await PasswordResetModel.deleteForUser(user.id);
      await PasswordResetModel.create({ userId: user.id, tokenHash, expiresAt });

      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        role: user.role,
        resetUrl
      });

      return res.json({
        success: true,
        message: genericMessage
      });
    } catch (err) {
      console.error('[Auth] Forgot password error:', err && err.message ? err.message : err);
      return res.status(500).json({
        success: false,
        message: 'Unable to send password reset email at this time. Please try again later.'
      });
    }
  },

  /**
   * GET /api/auth/verify-reset-token
   * Validates if a token is valid, unexpired, and unused before rendering or submitting.
   */
  async verifyResetToken(req, res) {
    try {
      const token = req.query.token;
      if (!token) {
        return res.status(400).json({ success: false, valid: false, message: 'Reset token is required.' });
      }

      const tokenHash = hashResetToken(token);
      const resetEntry = await PasswordResetModel.findValidByTokenHash(tokenHash);

      if (!resetEntry) {
        return res.status(400).json({
          success: false,
          valid: false,
          message: 'This password reset link is invalid, has expired, or has already been used.'
        });
      }

      return res.json({ success: true, valid: true });
    } catch (err) {
      console.error('[Auth] Verify reset token error:', err);
      return res.status(500).json({ success: false, valid: false, message: 'Server error verifying reset link.' });
    }
  },

  /**
   * POST /api/auth/reset-password
   * Updates the password using a valid reset token.
   */
  async resetPassword(req, res) {
    try {
      const { token, password, confirmPassword } = req.body;

      if (!token || !password || !confirmPassword) {
        return res.status(400).json({ success: false, message: 'Token, new password, and confirm password are required.' });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Passwords do not match.' });
      }

      if (password.trim().length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
      }

      const tokenHash = hashResetToken(token);
      const resetEntry = await PasswordResetModel.findValidByTokenHash(tokenHash);

      if (!resetEntry) {
        return res.status(400).json({
          success: false,
          message: 'This reset link is invalid, has expired, or has already been used. Please request a new one.'
        });
      }

      const user = await UserModel.findById(resetEntry.user_id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User account not found.' });
      }

      if (user.is_active === 0) {
        return res.status(403).json({ success: false, message: 'This account has been deactivated. Please contact administrator.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await UserModel.updatePassword(user.id, hashedPassword);

      // Increment token_version to invalidate all existing sessions, clear must_change_password
      await db.query(
        'UPDATE users SET token_version = token_version + 1, must_change_password = 0 WHERE id = ?',
        [user.id]
      );

      await PasswordResetModel.markUsed(resetEntry.id);
      await PasswordResetModel.deleteForUser(user.id);

      // Audit log the password reset
      await db.query(
        'INSERT INTO user_activity_logs (user_id, activity, status, ip_address) VALUES (?, ?, ?, ?)',
        [user.id, 'Password reset via email link', 'Success', req.ip || null]
      ).catch(() => {});

      return res.json({
        success: true,
        message: 'Password has been reset successfully. You can now sign in with your new password.'
      });
    } catch (err) {
      console.error('[Auth] Reset password error:', err);
      return res.status(500).json({ success: false, message: 'Unable to reset password right now. Please try again.' });
    }
  },

  /**
   * POST /api/auth/logout
   */
  async logout(req, res) {
    try {
      const userId = req.user.id;
      const role = req.user.role;

      // Invalidate token server-side for this user by incrementing token_version
      await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [userId]);

      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
      await db.query(
        'INSERT INTO user_activity_logs (user_id, activity, status, ip_address) VALUES (?, ?, ?, ?)',
        [userId, 'Logged out', 'Success', ip]
      ).catch(() => {});

      if (role === 'employee') {
        // Find all active open sessions for this employee
        const [activeSessions] = await db.query(
          'SELECT id, login_time FROM attendance_logs WHERE employee_id = ? AND session_status = "Active Session" AND logout_time IS NULL',
          [userId]
        );

        for (const s of activeSessions) {
          const loginTime = new Date(s.login_time).getTime();
          const logoutTime = new Date();
          const rawSec = Math.max(0, Math.floor((logoutTime.getTime() - loginTime) / 1000));
          const durationSec = Math.min(rawSec, 12 * 3600);
          const durationHours = Number((durationSec / 3600).toFixed(2));

          await db.query(
            'UPDATE attendance_logs SET logout_time = NOW(), total_working_hours = ?, session_status = "Logged Out" WHERE id = ?',
            [durationHours, s.id]
          );
        }

        // Close any active open break for this employee
        await db.query(
          'UPDATE break_records SET end_time = NOW(), duration = GREATEST(60, TIMESTAMPDIFF(SECOND, start_time, NOW())), status = "Completed" WHERE employee_id = ? AND end_time IS NULL',
          [userId]
        ).catch(() => {});

        // Mark active login_activities sessions as Logged Out
        await db.query(
          'UPDATE login_activities SET logout_at = NOW(), session_status = "Logged Out" WHERE employee_id = ? AND session_status = "Active"',
          [userId]
        ).catch(() => {});

        // Set status to Offline
        await db.query(
          "UPDATE users SET current_status = 'Offline', last_active_at = NOW() WHERE id = ?",
          [userId]
        );
      }

      return res.json({ success: true, message: 'Logged out successfully.' });
    } catch (err) {
      console.error('[Auth] Logout error:', err);
      return res.status(500).json({ success: false, message: 'Logout failed.' });
    }
  }
};

module.exports = authController;