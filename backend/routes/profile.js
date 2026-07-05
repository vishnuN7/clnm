const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const profileController = require('../controllers/profileController');
const upload = require('../middleware/upload');

// ── Error handler helper ───────────────────────────────────────────────────
function handleUploadError(err, req, res) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: 'File too large. Maximum 5MB allowed.' });
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) return res.status(400).json({ success: false, message: err.message });
}

// ── Routes (all require auth) ──────────────────────────────────────────────
router.get('/',                            requireAuth, profileController.getProfile);
router.put('/personal-info',               requireAuth, profileController.updatePersonalInfo);
router.put('/account-settings',            requireAuth, profileController.updateAccountSettings);
router.put('/change-password',             requireAuth, profileController.changePassword);
router.put('/bank-details',                requireAuth, profileController.updateBankDetails);
router.put('/emergency-contact',           requireAuth, profileController.updateEmergencyContact);
router.put('/notification-preferences',   requireAuth, profileController.updateNotificationPreferences);
router.delete('/avatar',                   requireAuth, profileController.removeAvatar);

// Avatar upload — uses upload.profilePic (R2 in production, local in dev)
router.post('/upload-avatar', requireAuth, (req, res, next) => {
  upload.profilePic.single('avatar')(req, res, (err) => {
    if (err) return handleUploadError(err, req, res);
    next();
  });
}, profileController.uploadAvatar);

// KYC doc upload — uses upload.kyc (R2 in production, local in dev)
router.post('/upload-kyc', requireAuth, (req, res, next) => {
  upload.kyc.single('document')(req, res, (err) => {
    if (err) return handleUploadError(err, req, res);
    next();
  });
}, profileController.uploadKYCDoc);

// Admin-only employee view
router.get('/admin/employees/:id',          requireAdmin, profileController.adminGetEmployeeProfile);
router.put('/admin/employees/:id/verify',   requireAdmin, profileController.adminVerifyEmployeeKYC);

module.exports = router;
