const db = require('../config/db');

// ── IST Date & Time Helper ───────────────────────────────────────────────────
// Returns current date in YYYY-MM-DD format using Asia/Kolkata timezone
function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// ── Callback date / period parser ─────────────────────────────────────────────
// Given a disposition + sub_disposition from Call Back Requested records,
// calculates concrete callback_date (YYYY-MM-DD) and callback_period.
// All dates are anchored to current IST date at call time.
function parseCallbackSchedule(subDisposition) {
  const sub = (subDisposition || '').toLowerCase().trim();

  // Get today in IST as a Date object (midnight IST)
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const todayIST = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate());

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function lastDayOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  let callbackDate = todayIST;
  let period = 'anytime';

  // Period mapping
  if (sub.includes('morning'))        period = 'morning';
  else if (sub.includes('afternoon')) period = 'afternoon';
  else if (sub.includes('evening'))   period = 'evening';

  // Day mapping (order matters — check more specific first)
  if (sub.includes('next week') || sub.includes('after 1 week') || sub.includes('after one week')) {
    callbackDate = addDays(todayIST, 7);
  } else if (sub.includes('after 2 days') || sub.includes('after two days')) {
    callbackDate = addDays(todayIST, 2);
  } else if (sub.includes('end of month')) {
    callbackDate = lastDayOfMonth(todayIST);
  } else if (sub.includes('tomorrow')) {
    callbackDate = addDays(todayIST, 1);
  } else if (sub.includes('today') || sub.includes('later today') || sub.includes('scheduled callback')) {
    callbackDate = todayIST;
  }

  return {
    callback_date: toYMD(callbackDate),
    callback_period: period
  };
}

// ── Callback dispositions set ─────────────────────────────────────────────────
const CALLBACK_DISPOSITIONS = new Set(['call back requested', 'callback requested']);

function isCallbackDisposition(disposition) {
  return CALLBACK_DISPOSITIONS.has((disposition || '').toLowerCase().trim());
}

// ── Centralized Callback Period Windows (Asia/Kolkata IST) ───────────────────
// Morning   = 09:00 onwards
// Afternoon = 12:00 onwards
// Evening   = 16:00 onwards
// Anytime   = 09:00 onwards
const CALLBACK_PERIOD_WINDOWS = {
  morning:   { start: '09:00', label: 'morning' },
  afternoon: { start: '12:00', label: 'afternoon' },
  evening:   { start: '16:00', label: 'evening' },
  anytime:   { start: '09:00', label: 'anytime' }
};

/**
 * Evaluates whether a notification is currently due for display.
 * Rules:
 * 1. Non-callback notifications are always active until expired.
 * 2. Completed / Cancelled callback reminders are EXCLUDED.
 * 3. Pending callback reminders are HIDDEN if:
 *    - callback_date > today (Future date e.g. Tomorrow)
 *    - callback_date == today AND current_time < callback_period_start_time
 * 4. Pending callback reminders are VISIBLE if:
 *    - callback_date < today (Overdue)
 *    - callback_date == today AND current_time >= callback_period_start_time (Due Today)
 */
function isNotificationDue(n) {
  if (n.type !== 'callback_reminder') {
    return true;
  }

  // If no reminder record attached, display as normal notification
  if (!n.reminder_id) {
    return true;
  }

  // Exclude completed or cancelled callback reminders
  if (n.reminder_status === 'completed' || n.reminder_status === 'cancelled') {
    return false;
  }

  // Evaluate scheduled pending callback reminder against current IST date & time
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const y = nowIST.getFullYear();
  const m = String(nowIST.getMonth() + 1).padStart(2, '0');
  const d = String(nowIST.getDate()).padStart(2, '0');
  const todayYMD = `${y}-${m}-${d}`;

  const hh = String(nowIST.getHours()).padStart(2, '0');
  const mm = String(nowIST.getMinutes()).padStart(2, '0');
  const currentHHMM = `${hh}:${mm}`;

  const cbDate = n.callback_date; // YYYY-MM-DD
  if (!cbDate) return true;

  // 1. Future date (e.g. Tomorrow) → HIDE
  if (cbDate > todayYMD) {
    return false;
  }

  // 2. Past date → OVERDUE (SHOW)
  if (cbDate < todayYMD) {
    return true;
  }

  // 3. Callback date is TODAY → check period start time
  const periodKey = (n.callback_period || 'anytime').toLowerCase().trim();
  const windowConfig = CALLBACK_PERIOD_WINDOWS[periodKey] || CALLBACK_PERIOD_WINDOWS.anytime;
  const startTime = windowConfig.start;

  if (currentHHMM < startTime) {
    return false;
  }

  return true;
}

// ── GET NOTIFICATIONS (Current Authenticated Employee) ─────────────────────────
exports.getNotifications = async (req, res) => {
  try {
    const empId = req.user.id;

    // 1. Auto-mark expired notifications in database (authoritative lifecycle tracking)
    await db.query(`
      UPDATE employee_notifications
      SET status = 'expired', updated_at = NOW()
      WHERE employee_id = ?
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
        AND status != 'expired'
    `, [empId]).catch(() => {});

    // 2. Fetch active, non-expired notifications for this employee only
    const [rows] = await db.query(
      `SELECT n.*,
              COALESCE(n.message, n.body) AS message_text,
              cr.id         AS reminder_id,
              cr.record_id  AS reminder_record_id,
              cr.assignment_id AS reminder_assignment_id,
              cr.phone_number AS reminder_phone,
              DATE_FORMAT(cr.callback_date, '%Y-%m-%d') AS callback_date,
              cr.callback_period,
              cr.status     AS reminder_status
       FROM employee_notifications n
       LEFT JOIN callback_reminders cr ON cr.notification_id = n.id
       WHERE n.employee_id = ?
         AND (n.expires_at IS NULL OR n.expires_at > NOW())
         AND (n.status IS NULL OR n.status != 'expired')
       ORDER BY n.created_at DESC
       LIMIT 100`,
      [empId]
    );

    // 3. Filter out callback reminders that are not due yet, and format properties
    const activeNotifications = rows.filter(isNotificationDue).map(n => {
      const isRead = Boolean(n.is_read);
      const text = n.message || n.body || n.message_text || '';
      return {
        id: n.id,
        employee_id: n.employee_id,
        employeeId: n.employee_id,
        type: n.type || 'general',
        title: n.title || 'Notification',
        message: text,
        body: text,
        link_url: n.link_url || null,
        linkUrl: n.link_url || null,
        priority: n.priority || 'normal',
        is_read: isRead ? 1 : 0,
        isRead: isRead,
        status: n.status || (isRead ? 'read' : 'active'),
        created_at: n.created_at,
        createdAt: n.created_at,
        expires_at: n.expires_at,
        expiresAt: n.expires_at,
        read_at: n.read_at || null,
        readAt: n.read_at || null,
        entity_type: n.entity_type || n.reference_type || null,
        entity_id: n.entity_id || n.reference_id || null,
        assignment_id: n.assignment_id || (n.reference_type === 'assignment' ? n.reference_id : null) || n.reminder_assignment_id || null,
        record_id: n.record_id || (n.reference_type === 'record' ? n.reference_id : null) || n.reminder_record_id || null,
        customer_id: n.customer_id || null,
        loan_id: n.loan_id || null,
        reference_type: n.reference_type || null,
        reference_id: n.reference_id || null,
        // Callback reminder metadata
        reminder_id: n.reminder_id || null,
        reminder_record_id: n.reminder_record_id || null,
        reminder_assignment_id: n.reminder_assignment_id || null,
        reminder_phone: n.reminder_phone || null,
        callback_date: n.callback_date || null,
        callback_period: n.callback_period || null,
        reminder_status: n.reminder_status || null
      };
    });

    const unreadCount = activeNotifications.filter(n => !n.isRead).length;

    res.json({
      success: true,
      notifications: activeNotifications,
      unreadCount,
      unread_count: unreadCount,
      count: unreadCount
    });
  } catch (err) {
    console.error('[Notifications] getNotifications error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
};

// ── GET UNREAD COUNT (Fast badge count) ────────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
  try {
    const empId = req.user.id;

    const [rows] = await db.query(
      `SELECT n.*,
              cr.id         AS reminder_id,
              DATE_FORMAT(cr.callback_date, '%Y-%m-%d') AS callback_date,
              cr.callback_period,
              cr.status     AS reminder_status
       FROM employee_notifications n
       LEFT JOIN callback_reminders cr ON cr.notification_id = n.id
       WHERE n.employee_id = ?
         AND n.is_read = 0
         AND (n.expires_at IS NULL OR n.expires_at > NOW())
         AND (n.status IS NULL OR n.status != 'expired')`,
      [empId]
    );

    const count = rows.filter(isNotificationDue).length;
    res.json({ success: true, count, unreadCount: count });
  } catch (err) {
    console.error('[Notifications] getUnreadCount error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch unread count.' });
  }
};

// ── MARK ONE READ ─────────────────────────────────────────────────────────────
exports.markRead = async (req, res) => {
  try {
    const empId = req.user.id;
    const { id } = req.params;

    const [[notif]] = await db.query(
      'SELECT id FROM employee_notifications WHERE id = ? AND employee_id = ?',
      [id, empId]
    );
    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification not found or access denied.' });
    }

    await db.query(
      `UPDATE employee_notifications
       SET is_read = 1,
           read_at = NOW(),
           status = CASE WHEN status = 'active' THEN 'read' ELSE status END,
           updated_at = NOW()
       WHERE id = ? AND employee_id = ?`,
      [id, empId]
    );

    const [remainRows] = await db.query(
      `SELECT COUNT(*) as unread_count
       FROM employee_notifications
       WHERE employee_id = ?
         AND is_read = 0
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (status IS NULL OR status != 'expired')`,
      [empId]
    );
    const unreadCount = remainRows[0]?.unread_count || 0;

    res.json({ success: true, message: 'Notification marked as read.', unreadCount, unread_count: unreadCount, count: unreadCount });
  } catch (err) {
    console.error('[Notifications] markRead error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to mark notification as read.' });
  }
};

// ── MARK ALL READ ─────────────────────────────────────────────────────────────
exports.markAllRead = async (req, res) => {
  try {
    const empId = req.user.id;

    await db.query(
      `UPDATE employee_notifications
       SET is_read = 1,
           read_at = NOW(),
           status = CASE WHEN status = 'active' THEN 'read' ELSE status END,
           updated_at = NOW()
       WHERE employee_id = ?
         AND is_read = 0
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (status IS NULL OR status != 'expired')`,
      [empId]
    );

    res.json({ success: true, message: 'All active notifications marked as read.', unreadCount: 0, unread_count: 0, count: 0 });
  } catch (err) {
    console.error('[Notifications] markAllRead error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to mark all as read.' });
  }
};

// ── DISMISS / COMPLETE A CALLBACK REMINDER ────────────────────────────────────
exports.dismissReminder = async (req, res) => {
  try {
    const empId = req.user.id;
    const { id } = req.params; // notification id

    const [[notif]] = await db.query(
      'SELECT id FROM employee_notifications WHERE id = ? AND employee_id = ?',
      [id, empId]
    );
    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification not found or access denied.' });
    }

    // Mark notification read
    await db.query(
      `UPDATE employee_notifications
       SET is_read = 1,
           read_at = NOW(),
           status = 'read',
           updated_at = NOW()
       WHERE id = ? AND employee_id = ?`,
      [id, empId]
    );

    // Mark associated callback reminder completed
    await db.query(
      "UPDATE callback_reminders SET status = 'completed', updated_at = NOW() WHERE notification_id = ? AND employee_id = ?",
      [id, empId]
    );

    res.json({ success: true, message: 'Callback reminder dismissed.' });
  } catch (err) {
    console.error('[Notifications] dismissReminder error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to dismiss reminder.' });
  }
};

// ── DELETE SINGLE NOTIFICATION (Owner Only) ───────────────────────────────────
exports.deleteNotification = async (req, res) => {
  try {
    const empId = req.user.id;
    const { id } = req.params;

    const [[notif]] = await db.query(
      'SELECT id FROM employee_notifications WHERE id = ? AND employee_id = ?',
      [id, empId]
    );
    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification not found or access denied.' });
    }

    // Unlink from callback_reminders if linked (SET NULL)
    await db.query(
      'UPDATE callback_reminders SET notification_id = NULL WHERE notification_id = ? AND employee_id = ?',
      [id, empId]
    );

    // Permanently delete notification
    await db.query(
      'DELETE FROM employee_notifications WHERE id = ? AND employee_id = ?',
      [id, empId]
    );

    res.json({ success: true, message: 'Notification deleted successfully.' });
  } catch (err) {
    console.error('[Notifications] deleteNotification error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete notification.' });
  }
};

// ── UNIFIED INTERNAL NOTIFICATION CREATION WITH DUPLICATE PREVENTION ──────────
/**
 * Creates or updates an employee notification with 24-hour expiration and duplicate prevention.
 */
async function createOrUpdateNotification({
  employeeId,
  type = 'general',
  title,
  message,
  linkUrl = null,
  priority = 'normal',
  assignmentId = null,
  recordId = null,
  customerId = null,
  loanId = null,
  referenceType = null,
  referenceId = null,
  expiresInHours = 24
}) {
  if (!employeeId || !title || !message) return null;

  try {
    // Determine authoritative entity reference
    const refType = referenceType || (assignmentId ? 'assignment' : (recordId ? 'record' : (customerId ? 'customer' : (loanId ? 'loan' : null))));
    const refId   = referenceId || assignmentId || recordId || customerId || loanId || null;

    // Check for an existing unread notification for the same employee, type, and reference
    let existingQuery = `
      SELECT id FROM employee_notifications
      WHERE employee_id = ? AND type = ? AND is_read = 0 AND (expires_at IS NULL OR expires_at > NOW())
    `;
    const queryParams = [employeeId, type];

    if (refType && refId) {
      existingQuery += ` AND ((reference_type = ? AND reference_id = ?) OR (assignment_id = ? AND record_id <=> ?))`;
      queryParams.push(refType, refId, assignmentId || null, recordId || null);
    } else {
      existingQuery += ` AND title = ?`;
      queryParams.push(title);
    }

    existingQuery += ` ORDER BY id DESC LIMIT 1`;

    const [[existing]] = await db.query(existingQuery, queryParams);

    if (existing) {
      // Re-use and update existing active unread notification (resets 24h expiration)
      await db.query(
        `UPDATE employee_notifications
         SET title = ?, message = ?, body = ?, link_url = ?, priority = ?,
             assignment_id = ?, record_id = ?, customer_id = ?, loan_id = ?,
             reference_type = ?, reference_id = ?,
             expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR),
             updated_at = NOW()
         WHERE id = ?`,
        [
          title, message, message, linkUrl, priority,
          assignmentId || null, recordId || null, customerId || null, loanId || null,
          refType, refId,
          expiresInHours,
          existing.id
        ]
      );
      return existing.id;
    } else {
      // Insert fresh active notification with exact 24h expiration
      const [insertRes] = await db.query(
        `INSERT INTO employee_notifications
           (employee_id, type, title, message, body, link_url, priority,
            assignment_id, record_id, customer_id, loan_id,
            reference_type, reference_id, is_read, status,
            expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active',
                 DATE_ADD(NOW(), INTERVAL ? HOUR), NOW(), NOW())`,
        [
          employeeId, type, title, message, message, linkUrl, priority,
          assignmentId || null, recordId || null, customerId || null, loanId || null,
          refType, refId,
          expiresInHours
        ]
      );
      return insertRes.insertId;
    }
  } catch (err) {
    console.error('[Notifications] createOrUpdateNotification error:', err.message);
    return null;
  }
}
exports.createNotification = createOrUpdateNotification;

// ── INTERNAL: WORK / ASSIGNMENT ASSIGNED ───────────────────────────────────────
exports.createWorkAssignedNotification = async ({ employeeId, assignmentId, fileName, totalRecords, assignedByName }) => {
  const title = 'New Assignment';
  const cleanName = fileName ? String(fileName).replace(/\\/g, '/') : 'Workbook';
  const message = `"${cleanName}" has been assigned to you. Assignment #${assignmentId || ''} · ${totalRecords || 0} records`;
  const linkUrl = assignmentId
    ? `/employee/data-excel.html?assignmentId=${encodeURIComponent(assignmentId)}`
    : '/employee/data-excel.html';

  return createOrUpdateNotification({
    employeeId,
    type: 'assignment',
    title,
    message,
    linkUrl,
    priority: 'normal',
    assignmentId: assignmentId || null,
    referenceType: 'assignment',
    referenceId: assignmentId || null,
    expiresInHours: 24
  });
};

// ── INTERNAL: ASSIGNMENT UPDATED ──────────────────────────────────────────────
exports.createAssignmentUpdatedNotification = async ({ fileId, status }) => {
  try {
    const [assignments] = await db.query(
      `SELECT ea.id, ea.employee_id, ef.original_name
       FROM excel_assignments ea
       JOIN excel_files ef ON ef.id = ea.file_id
       WHERE ea.file_id = ? AND ea.status != 'Closed'`,
      [fileId]
    );

    for (const a of assignments) {
      const title = 'Assignment Updated';
      const message = `Assignment #${a.id} ("${a.original_name}") was updated to ${status}.`;
      const linkUrl = `/employee/data-excel.html?assignmentId=${encodeURIComponent(a.id)}`;

      await createOrUpdateNotification({
        employeeId: a.employee_id,
        type: 'assignment_updated',
        title,
        message,
        linkUrl,
        priority: 'normal',
        assignmentId: a.id,
        referenceType: 'assignment',
        referenceId: a.id,
        expiresInHours: 24
      });
    }
  } catch (err) {
    console.error('[Notifications] createAssignmentUpdatedNotification error:', err.message);
  }
};

// ── INTERNAL: RECORD ACTION / RECORD UPDATED ──────────────────────────────────
exports.createRecordActionNotification = async ({ employeeId, assignmentId, recordId, phoneNumber, reason }) => {
  const title = 'Record Requires Action';
  const phoneText = phoneNumber ? `Customer ${phoneNumber}` : `Record #${recordId}`;
  const message = `${phoneText} is awaiting disposition in Assignment #${assignmentId}.${reason ? ' (' + reason + ')' : ''}`;
  const linkUrl = `/employee/data-excel.html?assignmentId=${encodeURIComponent(assignmentId)}&recordId=${encodeURIComponent(recordId)}`;

  return createOrUpdateNotification({
    employeeId,
    type: 'record',
    title,
    message,
    linkUrl,
    priority: 'important',
    assignmentId,
    recordId,
    referenceType: 'record',
    referenceId: recordId,
    expiresInHours: 24
  });
};

exports.createRecordUpdatedNotification = async ({ employeeId, assignmentId, phoneNumber, recordId }) => {
  const title = 'Record Updated';
  const message = `A customer record${phoneNumber ? ` (${phoneNumber})` : ''} in Assignment #${assignmentId} was updated.`;
  const linkUrl = recordId
    ? `/employee/data-excel.html?assignmentId=${encodeURIComponent(assignmentId)}&recordId=${encodeURIComponent(recordId)}`
    : `/employee/data-excel.html?assignmentId=${encodeURIComponent(assignmentId)}`;

  return createOrUpdateNotification({
    employeeId,
    type: 'record_updated',
    title,
    message,
    linkUrl,
    priority: 'normal',
    assignmentId,
    recordId: recordId || null,
    referenceType: 'record',
    referenceId: recordId || null,
    expiresInHours: 24
  });
};

// ── INTERNAL: CUSTOMER NOTIFICATION ───────────────────────────────────────────
exports.createCustomerNotification = async ({ employeeId, customerId, customerName, type = 'customer', title = 'Customer Update', message, priority = 'normal' }) => {
  const linkUrl = `/employee/my-customers.html?customerId=${encodeURIComponent(customerId)}`;
  return createOrUpdateNotification({
    employeeId,
    type,
    title,
    message,
    linkUrl,
    priority,
    customerId,
    referenceType: 'customer',
    referenceId: customerId,
    expiresInHours: 24
  });
};

// ── INTERNAL: LOAN NOTIFICATION ───────────────────────────────────────────────
exports.createLoanNotification = async ({ employeeId, loanId, customerName, status, notes, type = 'loan', title, message, priority = 'normal' }) => {
  const notifTitle = title || `Loan Application ${status || 'Update'}`;
  const notifMsg = message || `Loan #LN-${loanId}${customerName ? ' (' + customerName + ')' : ''} status updated to ${status || 'Pending'}.${notes ? ' Remark: ' + notes : ''}`;
  const linkUrl = `/employee/loans.html?loanId=${encodeURIComponent(loanId)}`;

  return createOrUpdateNotification({
    employeeId,
    type,
    title: notifTitle,
    message: notifMsg,
    linkUrl,
    priority,
    loanId,
    referenceType: 'loan',
    referenceId: loanId,
    expiresInHours: 24
  });
};

// ── INTERNAL: ASSIGNMENT EXPIRATION NOTIFICATIONS ─────────────────────────────
exports.createAssignmentExpiringNotification = async ({ employeeId, assignmentId, fileName, hoursRemaining, recordsRemaining }) => {
  const title = 'Assignment Expiring Soon';
  const cleanName = fileName ? String(fileName).replace(/\\/g, '/') : 'Workbook';
  const remainingText = recordsRemaining !== undefined ? ` · ${recordsRemaining} records remaining` : '';
  const message = `"${cleanName}" expires in ${hoursRemaining} hour${hoursRemaining === 1 ? '' : 's'}.${remainingText}`;
  const linkUrl = `/employee/data-excel.html?assignmentId=${encodeURIComponent(assignmentId)}`;

  return createOrUpdateNotification({
    employeeId,
    type: 'assignment_expiring',
    title,
    message,
    linkUrl,
    priority: 'urgent',
    assignmentId,
    referenceType: 'assignment',
    referenceId: assignmentId,
    expiresInHours: 24
  });
};

exports.createAssignmentExpiredNotification = async ({ employeeId, assignmentId, fileName }) => {
  const title = 'Assignment Expired';
  const cleanName = fileName ? String(fileName).replace(/\\/g, '/') : 'Workbook';
  const message = `"${cleanName}" (Assignment #${assignmentId}) has reached the 30-day limit and is no longer accessible.`;
  const linkUrl = '/employee/data-excel.html';

  return createOrUpdateNotification({
    employeeId,
    type: 'assignment_expired',
    title,
    message,
    linkUrl,
    priority: 'important',
    assignmentId,
    referenceType: 'assignment',
    referenceId: assignmentId,
    expiresInHours: 24
  });
};

// ── INTERNAL: CREATE / UPDATE CALLBACK REMINDER ───────────────────────────────
exports.upsertCallbackReminder = async ({ employeeId, assignmentId, recordId, phoneNumber, disposition, subDisposition }) => {
  try {
    if (!isCallbackDisposition(disposition)) {
      // Cancel any existing pending reminder for this record
      await db.query(
        "UPDATE callback_reminders SET status = 'cancelled', updated_at = NOW() WHERE employee_id = ? AND record_id = ? AND status = 'pending'",
        [employeeId, recordId]
      );
      // Update linked notification to indicate cancellation
      const [pendingReminders] = await db.query(
        "SELECT notification_id FROM callback_reminders WHERE employee_id = ? AND record_id = ? AND status = 'cancelled'",
        [employeeId, recordId]
      );
      for (const r of pendingReminders) {
        if (r.notification_id) {
          await db.query(
            "UPDATE employee_notifications SET title = 'Callback Cancelled', status = 'read', is_read = 1, updated_at = NOW() WHERE id = ?",
            [r.notification_id]
          );
        }
      }
      return;
    }

    const { callback_date, callback_period } = parseCallbackSchedule(subDisposition);
    const periodLabel = callback_period === 'morning' ? 'morning'
      : callback_period === 'afternoon' ? 'afternoon'
      : callback_period === 'evening' ? 'evening'
      : '';
    const notifBody = `Call back customer ${phoneNumber}${periodLabel ? ' this ' + periodLabel : ''}.`;
    const linkUrl = `/employee/data-excel.html?assignmentId=${encodeURIComponent(assignmentId)}&recordId=${encodeURIComponent(recordId)}`;

    // Check if reminder already exists for this employee + record
    const [[existing]] = await db.query(
      'SELECT id, notification_id FROM callback_reminders WHERE employee_id = ? AND record_id = ?',
      [employeeId, recordId]
    );

    if (existing) {
      // Update existing reminder
      await db.query(
        `UPDATE callback_reminders
         SET callback_date = ?, callback_period = ?, assignment_id = ?,
             phone_number = ?, status = 'pending', updated_at = NOW()
         WHERE id = ?`,
        [callback_date, callback_period, assignmentId, phoneNumber, existing.id]
      );

      let notifId = existing.notification_id;
      if (notifId) {
        const [[nCheck]] = await db.query('SELECT id FROM employee_notifications WHERE id = ? AND employee_id = ?', [notifId, employeeId]);
        if (nCheck) {
          await db.query(
            `UPDATE employee_notifications
             SET title = 'Customer Callback Reminder', message = ?, body = ?,
                 link_url = ?, priority = 'important',
                 assignment_id = ?, record_id = ?,
                 is_read = 0, status = 'active',
                 expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR),
                 updated_at = NOW()
             WHERE id = ? AND employee_id = ?`,
            [notifBody, notifBody, linkUrl, assignmentId, recordId, notifId, employeeId]
          );
        } else {
          notifId = null;
        }
      }

      if (!notifId) {
        notifId = await createOrUpdateNotification({
          employeeId,
          type: 'callback_reminder',
          title: 'Customer Callback Reminder',
          message: notifBody,
          linkUrl,
          priority: 'important',
          assignmentId,
          recordId,
          referenceType: 'record',
          referenceId: recordId,
          expiresInHours: 24
        });
        await db.query('UPDATE callback_reminders SET notification_id = ? WHERE id = ?', [notifId, existing.id]);
      }
    } else {
      const notifId = await createOrUpdateNotification({
        employeeId,
        type: 'callback_reminder',
        title: 'Customer Callback Reminder',
        message: notifBody,
        linkUrl,
        priority: 'important',
        assignmentId,
        recordId,
        referenceType: 'record',
        referenceId: recordId,
        expiresInHours: 24
      });

      await db.query(
        `INSERT INTO callback_reminders
           (employee_id, assignment_id, record_id, phone_number, callback_date, callback_period, notification_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
         ON DUPLICATE KEY UPDATE
           callback_date = VALUES(callback_date),
           callback_period = VALUES(callback_period),
           assignment_id = VALUES(assignment_id),
           phone_number = VALUES(phone_number),
           notification_id = VALUES(notification_id),
           status = 'pending',
           updated_at = NOW()`,
        [employeeId, assignmentId, recordId, phoneNumber, callback_date, callback_period, notifId]
      );
    }
  } catch (err) {
    console.error('[Notifications] upsertCallbackReminder error:', err.message);
  }
};

// ── PERIODIC CHECK FOR EXPIRING / EXPIRED ASSIGNMENTS ─────────────────────────
exports.checkExpiringAssignments = async () => {
  try {
    // 1. Assignments expiring in the next 24 hours
    const [expiring] = await db.query(`
      SELECT ea.id as assignment_id, ea.employee_id, ea.expires_at, ef.original_name, ef.total_records,
             (SELECT COUNT(*) FROM excel_records er WHERE er.file_id = ea.file_id AND er.updated_by = ea.employee_id AND er.status = 'Completed') as completed_count
      FROM excel_assignments ea
      JOIN excel_files ef ON ef.id = ea.file_id
      WHERE ea.lifecycle_status = 'Active'
        AND ea.expires_at IS NOT NULL
        AND ea.expires_at > NOW()
        AND ea.expires_at <= DATE_ADD(NOW(), INTERVAL 24 HOUR)
    `);

    for (const a of expiring) {
      const msLeft = new Date(a.expires_at).getTime() - Date.now();
      const hoursLeft = Math.max(1, Math.round(msLeft / (1000 * 3600)));
      const pendingRecords = Math.max(0, (a.total_records || 0) - (a.completed_count || 0));

      await exports.createAssignmentExpiringNotification({
        employeeId: a.employee_id,
        assignmentId: a.assignment_id,
        fileName: a.original_name,
        hoursRemaining: hoursLeft,
        recordsRemaining: pendingRecords
      });
    }

    // 2. Mark expired notifications
    await db.query(`
      UPDATE employee_notifications
      SET status = 'expired', updated_at = NOW()
      WHERE expires_at IS NOT NULL
        AND expires_at <= NOW()
        AND status != 'expired'
    `);
  } catch (err) {
    console.error('[Notifications] checkExpiringAssignments error:', err.message);
  }
};
