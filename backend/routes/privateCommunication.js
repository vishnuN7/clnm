const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { requireAdmin, requireEmployee, requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/privateCommunicationController');
const { useR2, privateStorageDir } = require('../utils/communicationCleanup');

// ── Private Multer Storage Configuration ───────────────────────────────────
let uploadStorage;

if (useR2) {
  const multerS3 = require('multer-s3');
  const { S3Client } = require('@aws-sdk/client-s3');
  const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_KEY,
    },
  });

  uploadStorage = multerS3({
    s3: r2Client,
    bucket: process.env.R2_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const randomKey = `private_comm_${crypto.randomUUID()}${ext}`;
      cb(null, randomKey);
    },
  });
} else {
  uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, privateStorageDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const randomKey = `comm_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, randomKey);
    },
  });
}

const ALLOWED_EXTS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
];

const privateUpload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5,                   // Maximum 5 files per message
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext) || !ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(new Error('Only PDF, JPG, PNG, and WEBP files are allowed.'));
    }
    cb(null, true);
  },
});

// Middleware wrapper for multer error handling
function handleMulterUpload(req, res, next) {
  privateUpload.array('files', 5)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File is too large. Maximum 10MB per file allowed.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ success: false, message: 'Maximum 5 files allowed per upload.' });
      }
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}

// ── Shared Upload Endpoint ────────────────────────────────────────────────
router.post('/upload',                              requireAuth, handleMulterUpload, ctrl.handleAttachmentUpload);

// ── Company Group Chat Routes ─────────────────────────────────────────────
router.get('/group/messages',                       requireAuth, ctrl.getGroupMessages);
router.post('/group/messages',                      requireAuth, ctrl.sendGroupMessage);
router.post('/group/upload',                        requireAuth, handleMulterUpload, ctrl.handleAttachmentUpload);
router.post('/group/messages/:id/pin',              requireAuth, ctrl.toggleGroupPin);
router.get('/group/info',                           requireAuth, ctrl.getGroupInfo);

// ── Message Emoji Reactions ───────────────────────────────────────────────
router.post('/messages/:id/react',                  requireAuth, ctrl.toggleMessageReaction);

// ── Announcements Routes ──────────────────────────────────────────────────
router.post('/admin/announcements',                 requireAdmin, ctrl.createAdminAnnouncement);
router.get('/announcements',                        requireAuth, ctrl.getAnnouncements);
router.post('/announcements/:id/read',              requireEmployee, ctrl.acknowledgeAnnouncementRead);

// ── Search Route ──────────────────────────────────────────────────────────
router.get('/search',                               requireAuth, ctrl.searchMessages);

// ── Admin 1-on-1 & Access Control Routes ──────────────────────────────────
router.get('/admin/employees',                      requireAdmin, ctrl.getAdminEmployees);
router.patch('/admin/employees/:id/access',         requireAdmin, ctrl.updateEmployeeAccess);
router.post('/admin/bulk-access',                   requireAdmin, ctrl.bulkUpdateAccess);
router.get('/admin/conversations',                  requireAdmin, ctrl.getAdminConversations);
router.get('/admin/conversations/:id/messages',     requireAdmin, ctrl.getAdminConversationMessages);
router.post('/admin/conversations/:id/messages',    requireAdmin, ctrl.sendAdminMessage);
router.post('/admin/conversations/:id/upload',      requireAdmin, handleMulterUpload, ctrl.handleAttachmentUpload);
router.get('/admin/audit-logs',                     requireAdmin, ctrl.getAuditLogs);

// ── Employee 1-on-1 Messaging Routes ──────────────────────────────────────
router.get('/employee/status',                      requireEmployee, ctrl.getEmployeeStatus);
router.get('/employee/conversation',               requireEmployee, ctrl.getEmployeeConversation);
router.post('/employee/messages',                   requireEmployee, ctrl.sendEmployeeMessage);
router.post('/employee/upload',                     requireEmployee, handleMulterUpload, ctrl.handleAttachmentUpload);

// ── Secure Attachment View & Download (Admin or authorized Employee) ───────
router.get('/attachments/:id/view',                 requireAuth, ctrl.viewOrDownloadAttachment);
router.get('/attachments/:id/download',             requireAuth, ctrl.viewOrDownloadAttachment);

// ── Delivery Acknowledgement (Admin or authorized Employee) ────────────────
router.post('/delivery-ack',                         requireAuth, ctrl.acknowledgeDelivery);

module.exports = router;
