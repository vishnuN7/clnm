const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/notificationController');

// 1. Real-time Server-Sent Events (SSE) Stream
// Token passed via query string ?token=... or Authorization header
router.get('/stream', ctrl.stream);

// 2. All standard notification routes require authenticated user (Admin or Employee)
router.use(requireAuth);

// GET   /api/notifications                  - paginated notifications for current user (tab=all|unread|read)
router.get('/', ctrl.getNotifications);

// GET   /api/notifications/unread-count     - fast badge unread count
router.get('/unread-count', ctrl.getUnreadCount);

// PATCH /api/notifications/mark-all-read    - mark all notifications as read
router.patch('/mark-all-read', ctrl.markAllRead);
router.patch('/read-all', ctrl.markAllRead);

// PATCH /api/notifications/:id/read        - mark one notification as read
router.patch('/:id/read', ctrl.markRead);

// POST or PATCH /api/notifications/:id/delivered - acknowledge delivery of notification
router.post('/:id/delivered', ctrl.markDelivered);
router.patch('/:id/delivered', ctrl.markDelivered);

// DELETE /api/notifications/:id             - archive/delete a single notification
router.delete('/:id', ctrl.deleteNotification);

// PATCH /api/notifications/:id/dismiss      - dismiss callback reminder
router.patch('/:id/dismiss', ctrl.dismissReminder);

// GET / PUT /api/notifications/preferences  - user notification preferences (sound, browser, etc.)
router.get('/preferences', ctrl.getPreferences);
router.put('/preferences', ctrl.updatePreferences);

// 3. ADMIN ANNOUNCEMENT & COMPOSER ENDPOINTS (Require Admin)
router.post('/announcements', requireAdmin, ctrl.createAnnouncement);
router.get('/announcements/audit', requireAdmin, ctrl.getAnnouncementsAudit);
router.get('/announcements/:id/status', requireAdmin, ctrl.getAnnouncementStatus);
router.get('/recipients/employees', requireAdmin, ctrl.getEligibleEmployees);

module.exports = router;
