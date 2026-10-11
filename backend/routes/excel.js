const express = require('express');
const router  = express.Router();
const { requireAdmin, requireEmployee, requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/excelController');

// ── Admin Routes ───────────────────────────────────────────────────────────
router.post(  '/validate-file',           requireAdmin,    ctrl.uploadMiddleware, ctrl.validateFile);
router.post(  '/upload',                  requireAdmin,    ctrl.uploadMiddleware, ctrl.uploadFile);
router.get(   '/files',                   requireAdmin,    ctrl.getFiles);
router.get(   '/files/:id',               requireAdmin,    ctrl.getFile);
router.post(  '/files/:id/assign',        requireAdmin,    ctrl.assignEmployees);
router.get(   '/files/:id/records',       requireAdmin,    ctrl.getFileRecords);
router.patch( '/files/:id/status',        requireAdmin,    ctrl.updateFileStatus);
router.delete('/files/:id',               requireAdmin,    ctrl.deleteFile);
router.get(   '/files/:id/export',        requireAdmin,    ctrl.exportFile);
router.get(   '/employees-list',          requireAdmin,    ctrl.getEmployeesList);
router.get(   '/audit',                   requireAdmin,    ctrl.getAudit);

// ── Employee Routes ────────────────────────────────────────────────────────
router.get(  '/my-assignments',                          requireEmployee, ctrl.getMyAssignments);
router.get(  '/search-records',                          requireAuth,     ctrl.searchAssignedRecords);
router.get(  '/assigned-records/search',                 requireAuth,     ctrl.searchAssignedRecords);
router.get(  '/assignments/:assignmentId/records',       requireEmployee, ctrl.getAssignmentRecords);
router.post( '/assignments/:assignmentId/submit',        requireEmployee, ctrl.submitAssignment);

// ── Shared: Disposition Usage Aggregation ──────────────────────────────────
router.get(  '/disposition-usage',                        requireAuth,     ctrl.getDispositionUsage);

// ── Shared: Update a single record (employee ownership checked in controller)
router.patch('/records/:recordId',                       requireAuth,     ctrl.updateRecord);

module.exports = router;
