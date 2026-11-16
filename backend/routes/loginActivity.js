const express = require('express');
const router = express.Router();
const loginActivityController = require('../controllers/loginActivityController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Employee-accessible endpoints
router.post('/record-location', requireAuth, loginActivityController.recordLocation);
router.get('/my-status', requireAuth, loginActivityController.getMyStatus);
router.get('/my-history', requireAuth, loginActivityController.getMyHistory);

// Admin-accessible endpoints (strict Admin authorization enforced server-side)
router.get('/stats', requireAdmin, loginActivityController.getStats);
router.get('/alerts', requireAdmin, loginActivityController.getUnusualAlerts);
router.post('/alerts/:id/review', requireAdmin, loginActivityController.reviewAlert);
router.get('/records', requireAdmin, loginActivityController.getRecords);
router.get('/records/:id', requireAdmin, loginActivityController.getRecordById);
router.post('/records/:id/terminate', requireAdmin, loginActivityController.terminateSession);
router.get('/employee/:employeeId', requireAdmin, loginActivityController.getEmployeeHistory);
router.get('/export', requireAdmin, loginActivityController.exportRecords);
router.get('/audit-logs', requireAdmin, loginActivityController.getAuditLogs);

module.exports = router;
