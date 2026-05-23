const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UserModel = require('../models/userModel');
const PasswordResetModel = require('../models/passwordResetModel');
const { sendPasswordResetEmail } = require('../utils/mailer');

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const authController = {
  /**
   * POST /api/auth/login
   * IP restriction for employees is applied via middleware before this
   */
  async login(req, res) {
    try {
      const { email, password, role } = req.body;

      if (!email || !password || !role) {
        return res.status(400).json({ success: false, message: 'Email, password, and role are required.' });
      }

      const user = await UserModel.findByEmail(normalizeEmail(email));

      if (!user) {
        // Don't reveal if email exists or not (prevents user enumeration)
        return res.status(401).json({ success: false, message: 'Authentication failed. Please check your credentials.' });
      }

      if (!user.is_active) {
        return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });
      }

      if (user.role !== role) {
        return res.status(403).json({ success: false, message: `This account is not registered as ${role}.` });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Authentication failed. Please check your credentials.' });
      }

      const token = jwt.sign(
        { id: user.id, name: user.name, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      return res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
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
   * Sends an email with a reset link for the admin account.
   */
  async forgotPassword(req, res) {
    try {
      const email = normalizeEmail(req.body.email);

      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
      }

      const user = await UserModel.findByEmail(email);

      // Keep the response generic to avoid user enumeration.
      if (!user || user.role !== 'admin') {
        return res.json({
          success: true,
          message: 'If the email is registered as an admin account, a reset link will be sent.'
        });
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${rawToken}`;

      await PasswordResetModel.deleteForUser(user.id);
      await PasswordResetModel.create({ userId: user.id, tokenHash, expiresAt });
      await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });

      return res.json({
        success: true,
        message: 'If the email is registered as an admin account, a reset link will be sent.'
      });
    } catch (err) {
      console.error('[Auth] Forgot password error:', err);
      return res.status(500).json({ success: false, message: 'Unable to send reset email right now.' });
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
        return res.status(400).json({ success: false, message: 'Token, password, and confirm password are required.' });
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
        return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await UserModel.updatePassword(resetEntry.user_id, hashedPassword);
      await PasswordResetModel.markUsed(resetEntry.id);
      await PasswordResetModel.deleteForUser(resetEntry.user_id);

      return res.json({ success: true, message: 'Password has been reset successfully.' });
    } catch (err) {
      console.error('[Auth] Reset password error:', err);
      return res.status(500).json({ success: false, message: 'Unable to reset password right now.' });
    }
  }
};

module.exports = authController;
