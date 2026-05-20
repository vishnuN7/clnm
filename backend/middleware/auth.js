const jwt = require('jsonwebtoken');

/**
 * Verify JWT token from Authorization header
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
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
