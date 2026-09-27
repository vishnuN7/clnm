const jwt = require('jsonwebtoken');
const db = require('../config/db');

function formatTimeToAMPM(timeStr) {
  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const formattedHour = hour % 12 || 12;
  const paddedHour = String(formattedHour).padStart(2, '0');
  return `${paddedHour}:${minStr} ${ampm}`;
}

/**
 * Verify JWT token from Authorization header
 */
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.query?.token;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Check DB status, token revocation, business hours, and temporary password status
    const [users] = await db.query(
      'SELECT id, role, is_active, auto_deactivated, manual_override, token_version, must_change_password FROM users WHERE id = ?',
      [decoded.id]
    );
    const user = users[0];

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found or account removed.' });
    }

    // Token revocation check: if token was invalidated by logout or password change
    if (decoded.token_version !== undefined && user.token_version !== undefined && decoded.token_version !== user.token_version) {
      return res.status(401).json({ success: false, message: 'Session has expired or was terminated. Please sign in again.' });
    }

    if (decoded.role === 'admin') {
      if (!user.is_active) {
        return res.status(403).json({ success: false, message: 'Admin account has been deactivated.' });
      }
      return next();
    }

    // Role is employee
    if (decoded.role === 'employee') {
      // Security enforcement: temporary onboarding password must be changed before accessing operational routes
      if (user.must_change_password === 1) {
        const fullUrl = (req.originalUrl || (req.baseUrl + req.path) || '').toLowerCase();
        const isPasswordChangeRoute =
          fullUrl.includes('/profile/change-password') ||
          fullUrl.includes('/auth/me') ||
          fullUrl.includes('/auth/logout') ||
          fullUrl.includes('/api/profile') ||
          fullUrl.includes('/notifications');

        if (!isPasswordChangeRoute) {
          return res.status(403).json({
            success: false,
            must_change_password: true,
            message: 'Temporary onboarding password detected. You must change your password before accessing the system.'
          });
        }
      }

      // Manual override = full access regardless of business hours
      if (user.manual_override === 1 && user.is_active === 1) {
        return next();
      }

      // Hard-deactivated by admin (not auto, not override)
      if (!user.is_active && user.auto_deactivated === 0 && user.manual_override === 0) {
        return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });
      }

      // Fetch working hours configuration
      const [settings] = await db.query('SELECT * FROM system_settings');
      const settingsMap = {};
      settings.forEach(s => settingsMap[s.setting_key] = s.setting_value);

      const startTime = settingsMap['auto_activation_time'] || '07:00';
      const endTime = settingsMap['auto_deactivation_time'] || '20:00';

      // Get current time in Asia/Kolkata
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

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

/**
 * Restrict route to admin role only
 */
const requireAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
    }
    next();
  });
};

/**
 * Restrict route to employee role only
 */
const requireEmployee = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.role !== 'employee') {
      return res.status(403).json({ success: false, message: 'Access denied. Employee privileges required.' });
    }
    next();
  });
};

/**
 * Allow both admin and employee (any authenticated user)
 */
const requireAuth = (req, res, next) => {
  verifyToken(req, res, next);
};

module.exports = { verifyToken, requireAdmin, requireEmployee, requireAuth };
