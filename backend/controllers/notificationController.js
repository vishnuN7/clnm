const notifService = require('../services/notificationService');
const realtime = require('../services/notificationRealtime');
const db = require('../config/db');

// --- SSE Real-time Stream Handler ---
exports.stream = (req, res) => {
  return realtime.handleSSEStream(req, res);
};

// --- GET Notifications for Current User (Admin or Employee) ---
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { tab = 'all', page = 1, limit = 50, search = '' } = req.query;

    const data = await notifService.getUserNotifications(userId, {
      tab,
      page: Number(page),
      limit: Number(limit),
      search
    });

    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    console.error('[Notifications] getNotifications error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
};

// --- Fast Unread Count ---
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await notifService.getUnreadCount(userId);
    res.json({ success: true, count, unreadCount: count });
  } catch (err) {
    console.error('[Notifications] getUnreadCount error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch unread count.' });
  }
};

// --- Mark Single Notification Read ---
exports.markRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await notifService.markRead(userId, Number(id));
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Notifications] markRead error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to mark notification as read.' });
  }
};

// --- Mark All Notifications Read ---
exports.markAllRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await notifService.markAllRead(userId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Notifications] markAllRead error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to mark all as read.' });
  }
};

// --- Acknowledge Real-Time Delivery ---
exports.markDelivered = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await notifService.markDelivered(userId, Number(id));
    res.json({ success: true, message: 'Delivery confirmed.' });
  } catch (err) {
    console.error('[Notifications] markDelivered error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to confirm delivery.' });
  }
};

// --- Archive / Delete Single Notification ---
exports.deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await notifService.archiveNotification(userId, Number(id));
    res.json({ success: true, message: 'Notification archived.', ...result });
  } catch (err) {
    console.error('[Notifications] deleteNotification error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete notification.' });
  }
};

// --- Dismiss Callback Reminder (Preserving Callback Workflow) ---
exports.dismissReminder = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifId = Number(req.params.id);

    // Update callback reminder status
    await db.query(`
      UPDATE callback_reminders
      SET status = 'completed', updated_at = NOW()
      WHERE employee_id = ? AND notification_id = ?
    `, [userId, notifId]);

    // Mark notification read
    await notifService.markRead(userId, notifId);

    res.json({ success: true, message: 'Callback reminder completed.' });
  } catch (err) {
    console.error('[Notifications] dismissReminder error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to dismiss callback reminder.' });
  }
};

// --- Get Notification Preferences ---
exports.getPreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const prefs = await notifService.getPreferences(userId);
    res.json({ success: true, preferences: prefs });
  } catch (err) {
    console.error('[Notifications] getPreferences error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load preferences.' });
  }
};

// --- Update Notification Preferences ---
exports.updatePreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const updated = await notifService.updatePreferences(userId, req.body || {});
    res.json({ success: true, preferences: updated, message: 'Preferences updated.' });
  } catch (err) {
    console.error('[Notifications] updatePreferences error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update preferences.' });
  }
};

// ==========================================
// ADMIN ANNOUNCEMENT & COMPOSER ENDPOINTS
// ==========================================

// --- Send Announcement (Admin Only) ---
exports.createAnnouncement = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { title, message, priority = 'normal', actionUrl = null, audience = 'all', employeeIds = [] } = req.body;

    if (!title || !title.trim() || !message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Announcement title and message body are required.' });
    }

    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    const cleanPriority = ['normal', 'important', 'urgent'].includes(priority) ? priority : 'normal';

    const result = await notifService.sendAdminAnnouncement({
      adminId,
      title: cleanTitle,
      message: cleanMessage,
      priority: cleanPriority,
      actionUrl: actionUrl ? String(actionUrl).trim() : null,
      audience,
      employeeIds: Array.isArray(employeeIds) ? employeeIds.map(Number) : []
    });

    if (!result) {
      return res.status(400).json({ success: false, message: 'No active recipients found for announcement.' });
    }

    res.status(201).json({
      success: true,
      message: `Announcement successfully dispatched to ${result.recipientCount} employee(s).`,
      notificationId: result.notificationId,
      recipientCount: result.recipientCount
    });
  } catch (err) {
    console.error('[Notifications] createAnnouncement error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to dispatch announcement.' });
  }
};

// --- Announcement Delivery & Read Audit Log (Admin Only) ---
exports.getAnnouncementsAudit = async (req, res) => {
  try {
    const adminId = req.user.id;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const list = await notifService.getAdminAnnouncementsList(adminId, limit);
    res.json({ success: true, announcements: list });
  } catch (err) {
    console.error('[Notifications] getAnnouncementsAudit error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch announcement audit.' });
  }
};

// --- Single Announcement Status Details (Admin Only) ---
exports.getAnnouncementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = await notifService.getAnnouncementStatus(Number(id));
    if (!status) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }
    res.json({ success: true, ...status });
  } catch (err) {
    console.error('[Notifications] getAnnouncementStatus error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch announcement status.' });
  }
};

// --- Get Active Employees for Announcement Composer (Admin Only) ---
exports.getEligibleEmployees = async (req, res) => {
  try {
    const [employees] = await db.query(`
      SELECT id, name, email, phone, designation, department
      FROM users
      WHERE role = 'employee' AND is_active = 1
      ORDER BY name ASC
    `);
    res.json({ success: true, employees });
  } catch (err) {
    console.error('[Notifications] getEligibleEmployees error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch employees list.' });
  }
};

// ==========================================
// BACKWARD-COMPATIBLE LEGACY HELPERS
// ==========================================
exports.createNotification = async function(data) {
  try {
    return notifService.createNotification({
      type: data.type || 'general',
      title: data.title,
      message: data.message || data.body || '',
      recipientRole: 'employee',
      audienceType: 'individual',
      recipients: [data.employeeId],
      priority: data.priority || 'normal',
      actionUrl: data.linkUrl || null,
      entityType: data.referenceType || (data.assignmentId ? 'assignment' : (data.recordId ? 'record' : null)),
      entityId: data.referenceId || data.assignmentId || data.recordId || null,
      metadata: data
    });
  } catch (e) {
    console.error('[Legacy createNotification error]', e.message);
    return null;
  }
};

exports.createLoanNotification = async function(data) {
  try {
    return notifService.createNotification({
      type: 'loan',
      title: data.title || 'Loan Application Update',
      message: data.message || '',
      recipientRole: 'employee',
      audienceType: 'individual',
      recipients: [data.employeeId],
      priority: data.priority || 'normal',
      actionUrl: `/employee/loans.html?loanId=${data.loanId}`,
      entityType: 'loan',
      entityId: data.loanId,
      metadata: data
    });
  } catch (e) {
    console.error('[Legacy createLoanNotification error]', e.message);
    return null;
  }
};

exports.createWorkAssignedNotification = async function({ employeeId, assignmentId, fileName, totalRecords }) {
  try {
    const cleanName = fileName ? String(fileName).replace(/\\/g, '/') : 'Workbook';
    return notifService.createNotification({
      type: 'assignment',
      title: 'New Assignment',
      message: `"${cleanName}" has been assigned to you. Assignment #${assignmentId || ''} · ${totalRecords || 0} records`,
      recipientRole: 'employee',
      audienceType: 'individual',
      recipients: [employeeId],
      priority: 'normal',
      actionUrl: `/employee/data-excel.html?assignmentId=${encodeURIComponent(assignmentId)}`,
      entityType: 'assignment',
      entityId: assignmentId,
      metadata: { assignmentId, totalRecords, fileName: cleanName }
    });
  } catch (e) {
    console.error('[Legacy createWorkAssignedNotification error]', e.message);
    return null;
  }
};

exports.createAssignmentUpdatedNotification = async function() { return null; };
exports.createAssignmentExpiringNotification = async function() { return null; };
exports.checkExpiringAssignments = async function() { return null; };

// ── Callback Reminder: upsert a notification for call-back/follow-up dispositions ──
exports.upsertCallbackReminder = async function({ employeeId, assignmentId, recordId, phoneNumber, disposition, subDisposition }) {
  try {
    const callbackDispositions = ['Call Back Requested', 'Call Later', 'Follow Up Required'];
    if (!disposition || !callbackDispositions.includes(disposition)) return null;

    return notifService.createNotification({
      type: 'callback_reminder',
      title: 'Callback Reminder',
      message: `Callback scheduled for ${phoneNumber || 'a contact'} · ${disposition}${subDisposition ? ' — ' + subDisposition : ''} (Assignment #${assignmentId})`,
      recipientRole: 'employee',
      audienceType: 'individual',
      recipients: [employeeId],
      priority: 'normal',
      actionUrl: `/employee/data-excel.html?assignmentId=${encodeURIComponent(assignmentId)}&recordId=${encodeURIComponent(recordId)}`,
      entityType: 'record',
      entityId: recordId,
      metadata: { assignmentId, recordId, phoneNumber, disposition, subDisposition }
    });
  } catch (e) {
    console.warn('[upsertCallbackReminder] non-critical error:', e.message);
    return null;
  }
};

// ── Record Updated Notification (admin → employee) ─────────────────────────
exports.createRecordUpdatedNotification = async function({ employeeId, assignmentId, phoneNumber }) {
  try {
    return notifService.createNotification({
      type: 'record_updated',
      title: 'Record Updated',
      message: `A record for ${phoneNumber || 'a contact'} in Assignment #${assignmentId} was updated by Admin.`,
      recipientRole: 'employee',
      audienceType: 'individual',
      recipients: [employeeId],
      priority: 'low',
      actionUrl: `/employee/data-excel.html?assignmentId=${encodeURIComponent(assignmentId)}`,
      entityType: 'assignment',
      entityId: assignmentId,
      metadata: { assignmentId, phoneNumber }
    });
  } catch (e) {
    console.warn('[createRecordUpdatedNotification] non-critical error:', e.message);
    return null;
  }
};
