const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');

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

      const user = await UserModel.findByEmail(email.toLowerCase().trim());

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
  }
};

module.exports = authController;
