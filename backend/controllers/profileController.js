const upload = require('../middleware/upload');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const cryptoUtil = require('../utils/cryptoUtil');

// ── Helper: log user activity ──────────────────────────────────────────────
async function logActivity(userId, activity, req, status = 'Success') {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
  await db.query(
    'INSERT INTO user_activity_logs (user_id, activity, status, ip_address) VALUES (?, ?, ?, ?)',
    [userId, activity, status, ip]
  ).catch(() => {});
}

// ── Helper: normalize Date of Birth to YYYY-MM-DD calendar string ────────────
function normalizeDateOfBirth(dob) {
  if (!dob) return null;
  if (typeof dob === 'string') {
    const trimmed = dob.trim();
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : trimmed;
  }
  if (dob instanceof Date && !isNaN(dob.getTime())) {
    const y = dob.getFullYear();
    const m = String(dob.getMonth() + 1).padStart(2, '0');
    const d = String(dob.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

const profileController = {

  // ── GET /api/profile ──────────────────────────────────────────────────────
  async getProfile(req, res) {
    try {
      const userId = req.user.id;

      const [userRows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
      if (!userRows.length) return res.status(404).json({ success: false, message: 'User not found.' });

      const user = { ...userRows[0] };
      delete user.password; // Never expose password hash
      if (user.date_of_birth) {
        user.date_of_birth = normalizeDateOfBirth(user.date_of_birth);
      }
      user.aadhaar_password_configured = Boolean(user.aadhaar_document_password);
      user.pan_password_configured = Boolean(user.pan_document_password);
      delete user.aadhaar_document_password;
      delete user.pan_document_password;

      const [[bank]] = await db.query('SELECT * FROM bank_details WHERE user_id = ?', [userId]);
      const [[emergency]] = await db.query('SELECT * FROM emergency_contacts WHERE user_id = ?', [userId]);
      const [[notifications]] = await db.query('SELECT * FROM notification_preferences WHERE user_id = ?', [userId]);
      const [loginHistory] = await db.query(
        'SELECT * FROM login_history WHERE user_id = ? ORDER BY login_time DESC LIMIT 10',
        [userId]
      );
      const [activityLogs] = await db.query(
        'SELECT * FROM user_activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
        [userId]
      );

      return res.json({
        success: true,
        data: {
          user,
          bank: bank || null,
          emergency: emergency || null,
          notifications: notifications || null,
          loginHistory,
          activityLogs
        }
      });
    } catch (err) {
      console.error('[Profile] getProfile error:', err);
      return res.status(500).json({ success: false, message: 'Failed to load profile.' });
    }
  },

  // ── PUT /api/profile/personal-info ────────────────────────────────────────
  async updatePersonalInfo(req, res) {
    try {
      const userId = req.user.id;
      const {
        date_of_birth, gender, address, permanent_address,
        city, state, country, postal_code
      } = req.body;

      let sanitizedDob = null;
      if (date_of_birth !== undefined && date_of_birth !== null && String(date_of_birth).trim() !== '') {
        const trimmed = String(date_of_birth).trim();
        const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
          return res.status(400).json({ success: false, message: 'Invalid Date of Birth format. Please use YYYY-MM-DD.' });
        }
        const y = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const d = parseInt(match[3], 10);
        if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) {
          return res.status(400).json({ success: false, message: 'Invalid Date of Birth values.' });
        }
        const daysInMonth = new Date(y, m, 0).getDate();
        if (d > daysInMonth) {
          return res.status(400).json({ success: false, message: `Invalid day for month ${m}: ${d}.` });
        }
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        if (trimmed > todayStr) {
          return res.status(400).json({ success: false, message: 'Date of Birth cannot be in the future.' });
        }
        sanitizedDob = trimmed;
      }

      await db.query(
        `UPDATE users SET date_of_birth=?, gender=?, address=?, permanent_address=?,
         city=?, state=?, country=?, postal_code=? WHERE id=?`,
        [sanitizedDob, gender ? String(gender).trim() : null, address ? String(address).trim() : null, permanent_address ? String(permanent_address).trim() : null,
         city ? String(city).trim() : null, state ? String(state).trim() : null, country ? String(country).trim() : null, postal_code ? String(postal_code).trim() : null, userId]
      );

      await logActivity(userId, 'Updated personal information', req);
      return res.json({ success: true, message: 'Personal information updated successfully.' });
    } catch (err) {
      console.error('[Profile] updatePersonalInfo error:', err);
      return res.status(500).json({ success: false, message: 'Failed to update personal information.' });
    }
  },

  // ── PUT /api/profile/account-settings ────────────────────────────────────
  async updateAccountSettings(req, res) {
    try {
      const userId = req.user.id;
      const { name, username, email, phone, role, authorizationRole, designation } = req.body;

      if (req.user.role === 'employee') {
        return res.status(403).json({
          success: false,
          message: 'Employees cannot update account settings from their profile.'
        });
      }

      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Name is required.' });
      }

      // Fetch existing user to enforce protected system fields
      const [userRows] = await db.query('SELECT email, role, designation FROM users WHERE id = ?', [userId]);
      if (!userRows.length) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
      const existingUser = userRows[0];

      // Reject unauthorized attempts to modify protected fields
      if (email !== undefined && email !== null && email.trim().toLowerCase() !== (existingUser.email || '').toLowerCase()) {
        return res.status(400).json({
          success: false,
          message: 'Email address is system-managed and cannot be modified.'
        });
      }

      const requestedRole = role || authorizationRole;
      if (requestedRole !== undefined && requestedRole !== null && requestedRole !== existingUser.role) {
        return res.status(400).json({
          success: false,
          message: 'Authorization role is system-managed and cannot be modified.'
        });
      }

      if (designation !== undefined && designation !== null && designation !== existingUser.designation) {
        return res.status(400).json({
          success: false,
          message: 'Designation is system-managed and cannot be modified.'
        });
      }

      // Check for duplicate username (if provided and changed)
      if (username && username.trim()) {
        const [usernameCheck] = await db.query(
          'SELECT id FROM users WHERE username = ? AND id != ?', [username.trim(), userId]
        );
        if (usernameCheck.length) {
          return res.status(400).json({ success: false, message: 'Username is already taken.' });
        }
      }

      // Update ONLY permitted fields: name, username, phone (protected fields are untouched)
      await db.query(
        'UPDATE users SET name=?, username=?, phone=? WHERE id=?',
        [name.trim(), username?.trim() || null, phone?.trim() || null, userId]
      );

      await logActivity(userId, 'Updated account settings', req);
      return res.json({ success: true, message: 'Account settings updated successfully.' });
    } catch (err) {
      console.error('[Profile] updateAccountSettings error:', err);
      return res.status(500).json({ success: false, message: 'Failed to update account settings.' });
    }
  },

  // ── PUT /api/profile/change-password ─────────────────────────────────────
  async changePassword(req, res) {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ success: false, message: 'All password fields are required.' });
      }
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'New passwords do not match.' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
      }

      const [userRows] = await db.query('SELECT password FROM users WHERE id = ?', [userId]);
      if (!userRows.length) return res.status(404).json({ success: false, message: 'User not found.' });

      const valid = await bcrypt.compare(currentPassword, userRows[0].password);
      if (!valid) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
      }

      const hashed = await bcrypt.hash(newPassword, 10);
      await db.query('UPDATE users SET password = ?, token_version = token_version + 1, must_change_password = 0 WHERE id = ?', [hashed, userId]);

      const [updatedRows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
      const updatedUser = updatedRows[0];
      const token = jwt.sign(
        {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          token_version: updatedUser.token_version || 1
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      await logActivity(userId, 'Changed password', req);
      return res.json({
        success: true,
        message: 'Password changed successfully.',
        token,
        must_change_password: false
      });
    } catch (err) {
      console.error('[Profile] changePassword error:', err);
      return res.status(500).json({ success: false, message: 'Failed to change password.' });
    }
  },

  // ── POST /api/profile/upload-avatar ──────────────────────────────────────
  async uploadAvatar(req, res) {
    try {
      const userId = req.user.id;
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
      }

      // Delete old avatar if it exists (only for local disk storage)
      const [userRows] = await db.query('SELECT profile_picture FROM users WHERE id = ?', [userId]);
      if (userRows[0]?.profile_picture && userRows[0].profile_picture.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, '..', userRows[0].profile_picture);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      const relativePath = upload.getFileUrl(req, req.file);
      await db.query('UPDATE users SET profile_picture=? WHERE id=?', [relativePath, userId]);

      await logActivity(userId, 'Updated profile picture', req);
      return res.json({ success: true, message: 'Avatar updated successfully.', profile_picture: relativePath });
    } catch (err) {
      console.error('[Profile] uploadAvatar error:', err);
      return res.status(500).json({ success: false, message: 'Failed to upload avatar.' });
    }
  },

  // ── POST /api/profile/upload-kyc ─────────────────────────────────────────
  async uploadKYCDoc(req, res) {
    try {
      const userId = req.user.id;
      const { doc_type, aadhaar_number, pan_number, aadhaar_document_password, pan_document_password } = req.body;

      // Lock enforcement: Block employee mutations if KYC is already approved
      const [uStatus] = await db.query('SELECT verification_status FROM users WHERE id=?', [userId]);
      if (uStatus[0]?.verification_status === 'Approved') {
        return res.status(403).json({
          success: false,
          message: 'KYC documents are locked after approval. Contact an administrator if changes are required.'
        });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
      }

      const relativePath = upload.getFileUrl(req, req.file);
      let activity = '';

      if (doc_type === 'aadhaar_front') {
        const [old] = await db.query('SELECT aadhaar_front FROM users WHERE id=?', [userId]);
        if (old[0]?.aadhaar_front && old[0].aadhaar_front.startsWith('/uploads/')) {
          const op = path.join(__dirname, '..', old[0].aadhaar_front);
          if (fs.existsSync(op)) fs.unlinkSync(op);
        }
        await db.query('UPDATE users SET aadhaar_front=?, aadhaar_number=COALESCE(?, aadhaar_number) WHERE id=?', [relativePath, aadhaar_number || null, userId]);
        if (aadhaar_document_password && aadhaar_document_password.trim() !== '') {
          const enc = cryptoUtil.encrypt(aadhaar_document_password.trim());
          await db.query('UPDATE users SET aadhaar_document_password=? WHERE id=?', [enc, userId]);
        }
        activity = 'Uploaded Aadhaar Front';
      } else if (doc_type === 'aadhaar_back') {
        const [old] = await db.query('SELECT aadhaar_back FROM users WHERE id=?', [userId]);
        if (old[0]?.aadhaar_back && old[0].aadhaar_back.startsWith('/uploads/')) {
          const op = path.join(__dirname, '..', old[0].aadhaar_back);
          if (fs.existsSync(op)) fs.unlinkSync(op);
        }
        await db.query('UPDATE users SET aadhaar_back=?, aadhaar_number=COALESCE(?, aadhaar_number) WHERE id=?', [relativePath, aadhaar_number || null, userId]);
        if (aadhaar_document_password && aadhaar_document_password.trim() !== '') {
          const enc = cryptoUtil.encrypt(aadhaar_document_password.trim());
          await db.query('UPDATE users SET aadhaar_document_password=? WHERE id=?', [enc, userId]);
        }
        activity = 'Uploaded Aadhaar Back';
      } else if (doc_type === 'pan_card') {
        const [old] = await db.query('SELECT pan_card FROM users WHERE id=?', [userId]);
        if (old[0]?.pan_card && old[0].pan_card.startsWith('/uploads/')) {
          const op = path.join(__dirname, '..', old[0].pan_card);
          if (fs.existsSync(op)) fs.unlinkSync(op);
        }
        await db.query('UPDATE users SET pan_card=?, pan_number=COALESCE(?, pan_number) WHERE id=?', [relativePath, pan_number || null, userId]);
        if (pan_document_password && pan_document_password.trim() !== '') {
          const enc = cryptoUtil.encrypt(pan_document_password.trim());
          await db.query('UPDATE users SET pan_document_password=? WHERE id=?', [enc, userId]);
        }
        activity = 'Uploaded PAN Card';
      } else {
        return res.status(400).json({ success: false, message: 'Invalid document type. Use aadhaar_front, aadhaar_back, or pan_card.' });
      }

      // Update verification status to Pending since docs changed
      await db.query('UPDATE users SET verification_status=? WHERE id=?', ['Pending', userId]);

      await logActivity(userId, activity, req);
      return res.json({ success: true, message: `${activity} successfully.`, path: relativePath });
    } catch (err) {
      console.error('[Profile] uploadKYCDoc error:', err);
      return res.status(500).json({ success: false, message: 'Failed to upload document.' });
    }
  },

  // ── PUT /api/profile/kyc-details ──────────────────────────────────────────
  async updateKYCDetails(req, res) {
    try {
      const userId = req.user.id;
      const {
        aadhaar_number,
        pan_number,
        aadhaar_document_password,
        pan_document_password,
        clear_aadhaar_password,
        clear_pan_password
      } = req.body;

      const [userRows] = await db.query('SELECT verification_status, aadhaar_number, pan_number FROM users WHERE id=?', [userId]);
      if (!userRows.length) return res.status(404).json({ success: false, message: 'User not found.' });

      // Lock enforcement: Block modifications if approved
      if (userRows[0].verification_status === 'Approved') {
        return res.status(403).json({
          success: false,
          message: 'KYC documents are locked after approval. Contact an administrator if changes are required.'
        });
      }

      const updates = [];
      const values = [];

      if (aadhaar_number !== undefined) {
        updates.push('aadhaar_number = ?');
        values.push(aadhaar_number ? String(aadhaar_number).trim() : null);
      }

      if (pan_number !== undefined) {
        updates.push('pan_number = ?');
        values.push(pan_number ? String(pan_number).trim().toUpperCase() : null);
      }

      if (clear_aadhaar_password === true) {
        updates.push('aadhaar_document_password = NULL');
      } else if (aadhaar_document_password !== undefined && aadhaar_document_password !== null && String(aadhaar_document_password).trim() !== '') {
        const encrypted = cryptoUtil.encrypt(String(aadhaar_document_password).trim());
        updates.push('aadhaar_document_password = ?');
        values.push(encrypted);
      }

      if (clear_pan_password === true) {
        updates.push('pan_document_password = NULL');
      } else if (pan_document_password !== undefined && pan_document_password !== null && String(pan_document_password).trim() !== '') {
        const encrypted = cryptoUtil.encrypt(String(pan_document_password).trim());
        updates.push('pan_document_password = ?');
        values.push(encrypted);
      }

      // If status was Rejected, update to Pending upon correction
      if (userRows[0].verification_status === 'Rejected') {
        updates.push("verification_status = 'Pending'");
      }

      if (updates.length > 0) {
        values.push(userId);
        await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
        await logActivity(userId, 'Updated KYC document details and passwords', req);
      }

      return res.json({ success: true, message: 'KYC document details updated successfully.' });
    } catch (err) {
      console.error('[Profile] updateKYCDetails error:', err);
      return res.status(500).json({ success: false, message: 'Failed to update KYC document details.' });
    }
  },

  // ── PUT /api/profile/bank-details ─────────────────────────────────────────
  async updateBankDetails(req, res) {
    try {
      const userId = req.user.id;
      const { account_holder_name, bank_name, account_number, ifsc_code, branch_name } = req.body;

      await db.query(
        `INSERT INTO bank_details (user_id, account_holder_name, bank_name, account_number, ifsc_code, branch_name)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           account_holder_name=VALUES(account_holder_name),
           bank_name=VALUES(bank_name),
           account_number=VALUES(account_number),
           ifsc_code=VALUES(ifsc_code),
           branch_name=VALUES(branch_name)`,
        [userId, account_holder_name||null, bank_name||null, account_number||null, ifsc_code||null, branch_name||null]
      );

      await logActivity(userId, 'Updated bank details', req);
      return res.json({ success: true, message: 'Bank details updated successfully.' });
    } catch (err) {
      console.error('[Profile] updateBankDetails error:', err);
      return res.status(500).json({ success: false, message: 'Failed to update bank details.' });
    }
  },

  // ── PUT /api/profile/emergency-contact ────────────────────────────────────
  async updateEmergencyContact(req, res) {
    try {
      const userId = req.user.id;
      const { contact_name, relationship, mobile_number, alternate_number } = req.body;

      await db.query(
        `INSERT INTO emergency_contacts (user_id, contact_name, relationship, mobile_number, alternate_number)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           contact_name=VALUES(contact_name),
           relationship=VALUES(relationship),
           mobile_number=VALUES(mobile_number),
           alternate_number=VALUES(alternate_number)`,
        [userId, contact_name||null, relationship||null, mobile_number||null, alternate_number||null]
      );

      await logActivity(userId, 'Updated emergency contact', req);
      return res.json({ success: true, message: 'Emergency contact updated successfully.' });
    } catch (err) {
      console.error('[Profile] updateEmergencyContact error:', err);
      return res.status(500).json({ success: false, message: 'Failed to update emergency contact.' });
    }
  },

  // ── PUT /api/profile/notification-preferences ─────────────────────────────
  async updateNotificationPreferences(req, res) {
    try {
      const userId = req.user.id;
      const {
        email_notifications, whatsapp_notifications,
        loan_alerts, employee_activity_alerts, system_alerts
      } = req.body;

      await db.query(
        `INSERT INTO notification_preferences
           (user_id, email_notifications, whatsapp_notifications, loan_alerts, employee_activity_alerts, system_alerts)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           email_notifications=VALUES(email_notifications),
           whatsapp_notifications=VALUES(whatsapp_notifications),
           loan_alerts=VALUES(loan_alerts),
           employee_activity_alerts=VALUES(employee_activity_alerts),
           system_alerts=VALUES(system_alerts)`,
        [userId,
          email_notifications ? 1 : 0,
          whatsapp_notifications ? 1 : 0,
          loan_alerts ? 1 : 0,
          employee_activity_alerts ? 1 : 0,
          system_alerts ? 1 : 0
        ]
      );

      await logActivity(userId, 'Updated notification preferences', req);
      return res.json({ success: true, message: 'Notification preferences saved.' });
    } catch (err) {
      console.error('[Profile] updateNotificationPreferences error:', err);
      return res.status(500).json({ success: false, message: 'Failed to update preferences.' });
    }
  },

  // ── GET /api/profile/admin/employees/:id ─────────────────────────────────
  async adminGetEmployeeProfile(req, res) {
    try {
      const employeeId = parseInt(req.params.id, 10);
      if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee ID.' });

      const [userRows] = await db.query('SELECT * FROM users WHERE id = ? AND role = ?', [employeeId, 'employee']);
      if (!userRows.length) return res.status(404).json({ success: false, message: 'Employee not found.' });

      const user = { ...userRows[0] };
      delete user.password;
      if (user.date_of_birth) {
        user.date_of_birth = normalizeDateOfBirth(user.date_of_birth);
      }
      user.aadhaar_password_configured = Boolean(user.aadhaar_document_password);
      user.pan_password_configured = Boolean(user.pan_document_password);
      delete user.aadhaar_document_password;
      delete user.pan_document_password;

      const [[bank]] = await db.query('SELECT * FROM bank_details WHERE user_id = ?', [employeeId]);
      const [[emergency]] = await db.query('SELECT * FROM emergency_contacts WHERE user_id = ?', [employeeId]);
      const [activityLogs] = await db.query(
        'SELECT * FROM user_activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 15',
        [employeeId]
      );
      const [loginHistory] = await db.query(
        'SELECT * FROM login_history WHERE user_id = ? ORDER BY login_time DESC LIMIT 10',
        [employeeId]
      );

      return res.json({
        success: true,
        data: { user, bank: bank || null, emergency: emergency || null, activityLogs, loginHistory }
      });
    } catch (err) {
      console.error('[Profile] adminGetEmployeeProfile error:', err);
      return res.status(500).json({ success: false, message: 'Failed to load employee profile.' });
    }
  },

  // ── GET /api/profile/admin/employees/:id/kyc-password/:docType ───────────
  async adminGetEmployeeKYCPassword(req, res) {
    try {
      const adminId = req.user.id;
      const employeeId = parseInt(req.params.id, 10);
      const docType = req.params.docType?.toLowerCase();

      if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee ID.' });
      if (!['aadhaar', 'pan'].includes(docType)) {
        return res.status(400).json({ success: false, message: "Invalid document type. Must be 'aadhaar' or 'pan'." });
      }

      const colName = docType === 'aadhaar' ? 'aadhaar_document_password' : 'pan_document_password';
      const [userRows] = await db.query(
        `SELECT id, name, ${colName} AS enc_password FROM users WHERE id = ? AND role = 'employee'`,
        [employeeId]
      );

      if (!userRows.length) return res.status(404).json({ success: false, message: 'Employee not found.' });

      const encPassword = userRows[0].enc_password;
      if (!encPassword) {
        return res.json({
          success: true,
          has_password: false,
          password: ''
        });
      }

      let decrypted = '';
      try {
        decrypted = cryptoUtil.decrypt(encPassword);
      } catch (decErr) {
        console.error('[Profile] adminGetEmployeeKYCPassword decryption failed:', decErr.message);
        return res.status(500).json({ success: false, message: 'Failed to decrypt document password.' });
      }

      // Audit log: record that admin viewed password without saving plaintext in log
      await logActivity(
        adminId,
        `Viewed ${docType.toUpperCase()} document password for employee ${userRows[0].name} (ID: ${employeeId})`,
        req
      );

      return res.json({
        success: true,
        has_password: true,
        password: decrypted
      });
    } catch (err) {
      console.error('[Profile] adminGetEmployeeKYCPassword error:', err);
      return res.status(500).json({ success: false, message: 'Failed to retrieve document password.' });
    }
  },

  // ── PUT /api/profile/admin/employees/:id/verify ───────────────────────────
  async adminVerifyEmployeeKYC(req, res) {
    try {
      const adminId = req.user.id;
      const employeeId = parseInt(req.params.id, 10);
      const { verification_status, verification_remarks } = req.body;

      const allowed = ['Pending', 'Approved', 'Rejected'];
      if (!allowed.includes(verification_status)) {
        return res.status(400).json({ success: false, message: 'Invalid verification status.' });
      }

      await db.query(
        'UPDATE users SET verification_status=?, verification_remarks=? WHERE id=?',
        [verification_status, verification_remarks || null, employeeId]
      );

      await logActivity(adminId, `KYC ${verification_status} for employee ID ${employeeId}`, req);
      return res.json({ success: true, message: `Employee KYC ${verification_status} successfully.` });
    } catch (err) {
      console.error('[Profile] adminVerifyEmployeeKYC error:', err);
      return res.status(500).json({ success: false, message: 'Failed to update verification status.' });
    }
  },

  // ── DELETE /api/profile/avatar ─────────────────────────────────────────────
  async removeAvatar(req, res) {
    try {
      const userId = req.user.id;
      const [userRows] = await db.query('SELECT profile_picture FROM users WHERE id = ?', [userId]);
      if (userRows[0]?.profile_picture && userRows[0].profile_picture.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, '..', userRows[0].profile_picture);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      await db.query('UPDATE users SET profile_picture=NULL WHERE id=?', [userId]);
      await logActivity(userId, 'Removed profile picture', req);
      return res.json({ success: true, message: 'Profile picture removed.' });
    } catch (err) {
      console.error('[Profile] removeAvatar error:', err);
      return res.status(500).json({ success: false, message: 'Failed to remove avatar.' });
    }
  }
};

module.exports = profileController;
