/**
 * IP Restriction Middleware
 * Restricts access to only requests coming from the office network.
 * Configured via ALLOWED_IP_PREFIX in .env
 */

const ipRestriction = (req, res, next) => {
  const allowedPrefix = process.env.ALLOWED_IP_PREFIX || '192.168.';
  const allowLocalhost = process.env.ALLOW_LOCALHOST === 'true';

  // Get client IP — handle proxies
  const rawIp =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    '';

  // Normalize IPv6 loopback to IPv4
  const clientIp = rawIp.replace(/^::ffff:/, '');

  const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost';
  const isAllowedNetwork = clientIp.startsWith(allowedPrefix);

  if ((allowLocalhost && isLocalhost) || isAllowedNetwork) {
    // Attach IP to request for logging
    req.clientIp = clientIp;
    return next();
  }

  console.warn(`[IP BLOCKED] Login attempt from restricted IP: ${clientIp}`);

  return res.status(403).json({
    success: false,
    message: 'Access denied. You must be connected to the office network to log in as an Employee.',
    clientIp,
    allowedNetwork: `${allowedPrefix}*`
  });
};

module.exports = ipRestriction;
