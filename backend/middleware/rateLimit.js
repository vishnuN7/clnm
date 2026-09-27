/**
 * Rate Limiting & Failed Login Lockout Middleware
 * Protects against brute force attacks and DoS
 */

const rateLimitStore = new Map();
const failedLoginStore = new Map();

const getRateLimit = () => ({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '5', 10) // 5 attempts
});

const getLoginLockoutConfig = () => ({
  windowMs: parseInt(process.env.LOGIN_LOCKOUT_WINDOW_MS || process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  maxFailedAttempts: parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS || process.env.RATE_LIMIT_MAX_REQUESTS || '5', 10) // 5 failed attempts
});

/**
 * Simple in-memory rate limiter for general requests
 */
const rateLimit = (identifier, options = getRateLimit()) => {
  const now = Date.now();
  const key = identifier;

  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { count: 1, resetTime: now + options.windowMs });
    return { allowed: true, remaining: options.maxRequests - 1, resetTime: now + options.windowMs };
  }

  const record = rateLimitStore.get(key);

  if (now > record.resetTime) {
    // Window has expired, reset
    rateLimitStore.set(key, { count: 1, resetTime: now + options.windowMs });
    return { allowed: true, remaining: options.maxRequests - 1, resetTime: now + options.windowMs };
  }

  record.count++;
  const allowed = record.count <= options.maxRequests;
  const remaining = Math.max(0, options.maxRequests - record.count);

  return { allowed, remaining, resetTime: record.resetTime };
};

/**
 * Login Rate Limiter Middleware
 * Only checks whether an account/IP is CURRENTLY LOCKED OUT due to repeated failed attempts.
 * Does NOT increment any counters on incoming requests; counters are incremented strictly on failed authentication.
 */
const loginLimiter = (req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  const email = String(req.body?.email || '').toLowerCase().trim();
  const key = `failed_login:${ip}:${email}`;

  const record = failedLoginStore.get(key);
  if (record && record.lockedUntil) {
    const now = Date.now();
    if (now < record.lockedUntil) {
      const waitMins = Math.max(1, Math.ceil((record.lockedUntil - now) / 60000));
      const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);

      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        message: `Too many unsuccessful login attempts. Please try again after ${waitMins} minute(s).`,
        retryAfter
      });
    } else {
      // Lockout window has elapsed, remove lockout
      failedLoginStore.delete(key);
    }
  }

  next();
};

/**
 * Record a failed authentication attempt for an IP + email
 */
function recordFailedLogin(rawIp, rawEmail) {
  const email = String(rawEmail || '').toLowerCase().trim();
  if (!email) return;
  const ip = String(rawIp || 'unknown').trim();
  const key = `failed_login:${ip}:${email}`;
  const config = getLoginLockoutConfig();
  const now = Date.now();

  let record = failedLoginStore.get(key);
  if (!record || (now - record.firstFailureTime > config.windowMs && !record.lockedUntil)) {
    record = { attempts: 1, firstFailureTime: now, lockedUntil: null };
  } else {
    record.attempts += 1;
  }

  if (record.attempts >= config.maxFailedAttempts) {
    record.lockedUntil = now + config.windowMs;
    console.warn(`[Security] Account locked out: IP ${ip}, Email ${email} for ${config.windowMs / 60000} mins`);
  }

  failedLoginStore.set(key, record);
  return record;
}

/**
 * Reset failed authentication attempts upon successful login
 */
function recordSuccessfulLogin(rawIp, rawEmail) {
  const email = String(rawEmail || '').toLowerCase().trim();
  const ip = String(rawIp || 'unknown').trim();
  if (email) {
    failedLoginStore.delete(`failed_login:${ip}:${email}`);
    // Clear any matching email entries
    for (const k of failedLoginStore.keys()) {
      if (k.endsWith(`:${email}`)) {
        failedLoginStore.delete(k);
      }
    }
  }
}

/**
 * Password reset request limiter
 * Slightly looser than login, but still protects the mailbox.
 */
const forgotPasswordLimiter = (req, res, next) => {
  const identifier = `forgot-password:${req.ip}:${req.body?.email || 'unknown'}`;
  const limit = rateLimit(identifier, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3 // 3 requests per hour
  });

  res.setHeader('RateLimit-Limit', limit.maxRequests || 3);
  res.setHeader('RateLimit-Remaining', Math.max(0, limit.remaining || 0));
  res.setHeader('RateLimit-Reset', new Date(limit.resetTime).toISOString());

  if (!limit.allowed) {
    return res.status(429).json({
      success: false,
      message: `Too many password reset requests. Please try again after ${new Date(limit.resetTime).toLocaleTimeString()}.`,
      retryAfter: Math.ceil((limit.resetTime - Date.now()) / 1000)
    });
  }

  next();
};

/**
 * API General Rate Limiter
 * Moderate rate limiting for general API usage
 */
const apiLimiter = (req, res, next) => {
  // Skip rate limiting for static files and uploads
  if (req.path.startsWith('/uploads') || req.path.match(/\.(js|css|json|png|jpg|jpeg|gif|svg)$/i)) {
    return next();
  }

  const identifier = `api:${req.ip}`;
  const limit = rateLimit(identifier, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100 // 100 requests per minute
  });

  if (!limit.allowed) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((limit.resetTime - Date.now()) / 1000)
    });
  }

  next();
};

/**
 * Cleanup expired entries (run periodically)
 */
const cleanupRateLimitStore = () => {
  const now = Date.now();
  const config = getLoginLockoutConfig();

  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }

  for (const [key, record] of failedLoginStore.entries()) {
    if (record.lockedUntil) {
      if (now > record.lockedUntil) failedLoginStore.delete(key);
    } else if (now - record.firstFailureTime > config.windowMs) {
      failedLoginStore.delete(key);
    }
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);

module.exports = {
  loginLimiter,
  recordFailedLogin,
  recordSuccessfulLogin,
  forgotPasswordLimiter,
  apiLimiter,
  rateLimit,
  getRateLimit,
  getLoginLockoutConfig
};
