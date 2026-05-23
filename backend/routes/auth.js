const express = require('express');
const router = express.Router();
const ipRestriction = require('../middleware/ipRestriction');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter, forgotPasswordLimiter } = require('../middleware/rateLimit');

// Employee login — restricted to office IP
// Admin login — unrestricted
router.post('/login', loginLimiter, (req, res, next) => {
  // Apply IP restriction only for employee role
  if (req.body.role === 'employee') {
    return ipRestriction(req, res, next);
  }
  next();
}, authController.login);

router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Get current user info
router.get('/me', requireAuth, authController.getMe);

module.exports = router;
