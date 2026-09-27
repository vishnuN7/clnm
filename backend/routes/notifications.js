const express = require('express');
const router = express.Router();
const { requireEmployee } = require('../middleware/auth');
const ctrl = require('../controllers/notificationController');

// All notification routes require employee JWT
router.use(requireEmployee);

// GET  /api/notifications          — all notifications for current employee
router.get('/', ctrl.getNotifications);

// GET  /api/notifications/unread-count  — fast unread badge count
router.get('/unread-count', ctrl.getUnreadCount);

// PATCH /api/notifications/mark-all-read or /read-all — mark every notification read
router.patch('/mark-all-read', ctrl.markAllRead);
router.patch('/read-all', ctrl.markAllRead);

// PATCH /api/notifications/:id/read    — mark one notification read
router.patch('/:id/read', ctrl.markRead);

// PATCH /api/notifications/:id/dismiss — complete/dismiss a callback reminder
router.patch('/:id/dismiss', ctrl.dismissReminder);

// DELETE /api/notifications/:id — delete a single notification permanently
router.delete('/:id', ctrl.deleteNotification);

module.exports = router;
