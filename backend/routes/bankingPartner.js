const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireAdmin, requireEmployee } = require('../middleware/auth');
const ctrl = require('../controllers/bankingPartnerController');

// ── Bank Logo Upload Setup ────────────────────────────────────────────────
const logosDir = path.join(__dirname, '..', 'uploads', 'bank_logos');
if (!fs.existsSync(logosDir)) {
  fs.mkdirSync(logosDir, { recursive: true });
}

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, logosDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `bank_${cleanName}_${Date.now()}${ext}`);
  }
});

const ALLOWED_LOGO_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
const ALLOWED_LOGO_MIMES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml'
];

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_LOGO_EXTS.includes(ext) || !ALLOWED_LOGO_MIMES.includes(file.mimetype)) {
      return cb(new Error('Only PNG, JPG, JPEG, WEBP, or SVG image files are allowed.'));
    }
    cb(null, true);
  }
});

// ── Admin Routes ──────────────────────────────────────────────────────────
router.get('/admin/summary',                       requireAdmin, ctrl.getAdminSummary);
router.get('/admin/portals',                       requireAdmin, ctrl.getAdminPortals);
router.post('/admin/portals',                      requireAdmin, ctrl.createPortal);
router.put('/admin/portals/:id',                   requireAdmin, ctrl.updatePortal);
router.patch('/admin/portals/:id/status',          requireAdmin, ctrl.updatePortalStatus);
router.delete('/admin/portals/:id',                requireAdmin, ctrl.deletePortal);

// Logo Upload
router.post('/admin/upload-logo', requireAdmin, (req, res, next) => {
  logoUpload.single('logo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File too large. Maximum 2MB allowed.' });
      }
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No logo file provided.' });
    }
    const publicUrl = `/uploads/bank_logos/${req.file.filename}`;
    return res.json({
      success: true,
      message: 'Logo uploaded successfully.',
      logo_url: publicUrl
    });
  });
});

// Employee Access Management
router.get('/admin/employees',                     requireAdmin, ctrl.getAdminEmployees);
router.get('/admin/employees/:id/permissions',     requireAdmin, ctrl.getEmployeeBankPermissions);
router.patch('/admin/employees/:id/portal-access', requireAdmin, ctrl.updateEmployeePortalAccess);
router.put('/admin/employees/:id/bank-permissions',requireAdmin, ctrl.updateEmployeeBankPermissions);
router.post('/admin/bulk-portal-access',           requireAdmin, ctrl.bulkUpdatePortalAccess);

// Audit Logs
router.get('/admin/audit-logs',                    requireAdmin, ctrl.getAuditLogs);

// ── Employee Routes ───────────────────────────────────────────────────────
router.get('/employee/status',                     requireEmployee, ctrl.getEmployeeStatus);
router.get('/employee/portals',                    requireEmployee, ctrl.getEmployeePortals);

module.exports = router;
