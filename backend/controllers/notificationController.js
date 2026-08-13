const db = require('../config/db');

// ── IST date helper ───────────────────────────────────────────────────────────
// Returns current date in YYYY-MM-DD format using Asia/Kolkata timezone
function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// ── Callback date / period parser ─────────────────────────────────────────────
// Given a disposition + sub_disposition from Call Back Requested records,
// calculates the concrete callback_date (YYYY-MM-DD) and callback_period.
// All dates are anchored to the current IST date at the time of calling.
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
  if (sub.includes('morning'))   period = 'morning';
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
  // If just a time period with no explicit day → today
  // (morning, afternoon, evening, other)

  return {
    callback_date: toYMD(callbackDate),
    callback_period: period
  };
}

// ── Callback dispositions set ─────────────────────────────────────────────────
const CALLBACK_DISPOSITIONS = new Set(['Call Back Requested', 'call back requested']);

function isCallbackDisposition(disposition) {
  return CALLBACK_DISPOSITIONS.has((disposition || '').trim()) ||
         (disposition || '').toLowerCase().trim() === 'call back requested';
}

// ── Centralized Callback Period Windows (Asia/Kolkata IST) ───────────────────
// Configured start times for each callback window:
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
 * 1. Non-callback notifications (work_assigned, general) are always active.
 * 2. Completed / Cancelled callback reminders are EXCLUDED.
 * 3. Pending callback reminders are HIDDEN if:
 *    - callback_date > today (Future date e.g. Tomorrow)
 *    - callback_date == today AND current_time < callback_period_start_time
 * 4. Pending callback reminders are VISIBLE if:
 *    - callback_date < today (Overdue)
 *    - callback_date == today AND current_time >= callback_period_start_time (Due Today)
 */
function isNotificationDue(n) {
  // Non-callback notifications are always visible
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

  // If current time is before window start time → HIDE until start time arrives
  if (currentHHMM < startTime) {
    return false;
  }

  // Current time is inside or past the window start time → DUE TODAY (SHOW)
  return true;
}

// ── Get Notifications ─────────────────────────────────────────────────────────
exports.getNotifications = async (req, res) => {
  try {
    const empId = req.user.id;

    const [rows] = await db.query(
      `SELECT n.*,
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
       ORDER BY n.created_at DESC
       LIMIT 100`,
      [empId]
    );

    // Filter out notifications that are not due yet or are completed callbacks
    const activeNotifications = rows.filter(isNotificationDue);

    res.json({ success: true, notifications: activeNotifications });
  } catch (err) {
    console.error('[Notifications] getNotifications:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
};

// ── Get Unread Count ──────────────────────────────────────────────────────────
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
       WHERE n.employee_id = ? AND n.is_read = 0`,
      [empId]
    );

    const count = rows.filter(isNotificationDue).length;
    res.json({ success: true, count });
  } catch (err) {
    console.error('[Notifications] getUnreadCount:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch unread count.' });
  }
};

// ── Mark One as Read ──────────────────────────────────────────────────────────
exports.markRead = async (req, res) => {
  try {
    const empId = req.user.id;
    const { id } = req.params;

    const [[notif]] = await db.query(
      'SELECT id FROM employee_notifications WHERE id = ? AND employee_id = ?',
      [id, empId]
    );
    if (!notif) return res.status(404).json({ success: false, message: 'Notification not found.' });

    await db.query(
      'UPDATE employee_notifications SET is_read = 1, updated_at = NOW() WHERE id = ? AND employee_id = ?',
      [id, empId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Notifications] markRead:', err.message);
    res.status(500).json({ success: false, message: 'Failed to mark notification as read.' });
  }
};

// ── Mark All as Read ──────────────────────────────────────────────────────────
exports.markAllRead = async (req, res) => {
  try {
    const empId = req.user.id;
    await db.query(
      'UPDATE employee_notifications SET is_read = 1, updated_at = NOW() WHERE employee_id = ?',
      [empId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Notifications] markAllRead:', err.message);
    res.status(500).json({ success: false, message: 'Failed to mark all as read.' });
  }
};

// ── Dismiss / Complete a Callback Reminder ────────────────────────────────────
exports.dismissReminder = async (req, res) => {
  try {
    const empId = req.user.id;
    const { id } = req.params; // notification id

    const [[notif]] = await db.query(
      'SELECT id FROM employee_notifications WHERE id = ? AND employee_id = ?',
      [id, empId]
    );
    if (!notif) return res.status(404).json({ success: false, message: 'Notification not found.' });

    // Mark notification read
    await db.query(
      'UPDATE employee_notifications SET is_read = 1, updated_at = NOW() WHERE id = ?',
      [id]
    );

    // Mark associated reminder completed
    await db.query(
      "UPDATE callback_reminders SET status = 'completed', updated_at = NOW() WHERE notification_id = ? AND employee_id = ?",
      [id, empId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[Notifications] dismissReminder:', err.message);
    res.status(500).json({ success: false, message: 'Failed to dismiss reminder.' });
  }
};

// ── Delete Single Notification ────────────────────────────────────────────────
exports.deleteNotification = async (req, res) => {
  try {
    const empId = req.user.id;
    const { id } = req.params;

    // Verify ownership (only owner can delete)
    const [[notif]] = await db.query(
      'SELECT id FROM employee_notifications WHERE id = ? AND employee_id = ?',
      [id, empId]
    );

    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification not found or access denied.' });
    }

    // Unlink notification_id from callback_reminders if linked (SET NULL)
    // The underlying customer record & callback reminder remain intact!
    await db.query(
      'UPDATE callback_reminders SET notification_id = NULL WHERE notification_id = ? AND employee_id = ?',
      [id, empId]
    );

    // Permanently delete notification from DB
    await db.query(
      'DELETE FROM employee_notifications WHERE id = ? AND employee_id = ?',
      [id, empId]
    );

    res.json({ success: true, message: 'Notification deleted successfully.' });
  } catch (err) {
    console.error('[Notifications] deleteNotification:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete notification.' });
  }
};

// ── Internal: Create/Update Callback Reminder ────────────────────────────────
// Called from excelController.updateRecord when disposition = Call Back Requested.
// Prevents duplicates per (employee_id, record_id).
exports.upsertCallbackReminder = async ({ employeeId, assignmentId, recordId, phoneNumber, disposition, subDisposition }) => {
  try {
    if (!isCallbackDisposition(disposition)) {
      // Cancel any existing pending reminder for this record
      await db.query(
        "UPDATE callback_reminders SET status = 'cancelled', updated_at = NOW() WHERE employee_id = ? AND record_id = ? AND status = 'pending'",
        [employeeId, recordId]
      );
      // Update the linked notification to indicate cancellation
      const [pendingReminders] = await db.query(
        "SELECT notification_id FROM callback_reminders WHERE employee_id = ? AND record_id = ? AND status = 'cancelled'",
        [employeeId, recordId]
      );
      for (const r of pendingReminders) {
        if (r.notification_id) {
          await db.query(
            "UPDATE employee_notifications SET title = 'Callback Cancelled', is_read = 0, updated_at = NOW() WHERE id = ?",
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

      // Update linked notification if it exists
      let notifId = existing.notification_id;
      if (notifId) {
        const [[nCheck]] = await db.query('SELECT id FROM employee_notifications WHERE id = ? AND employee_id = ?', [notifId, employeeId]);
        if (nCheck) {
          await db.query(
            `UPDATE employee_notifications
             SET title = 'Customer Callback Reminder', body = ?, is_read = 0, updated_at = NOW()
             WHERE id = ? AND employee_id = ?`,
            [notifBody, notifId, employeeId]
          );
        } else {
          notifId = null;
        }
      }

      if (!notifId) {
        // Search for existing notification with same phone in body before inserting new
        const [[existingNotif]] = await db.query(
          `SELECT id FROM employee_notifications
           WHERE employee_id = ? AND type = 'callback_reminder' AND body LIKE ?
           ORDER BY id DESC LIMIT 1`,
          [employeeId, `%${phoneNumber}%`]
        );

        if (existingNotif) {
          notifId = existingNotif.id;
          await db.query(
            `UPDATE employee_notifications SET title = 'Customer Callback Reminder', body = ?, is_read = 0, updated_at = NOW() WHERE id = ?`,
            [notifBody, notifId]
          );
        } else {
          const linkUrl = `/employee/data-excel.html`;
          const [notifResult] = await db.query(
            `INSERT INTO employee_notifications (employee_id, type, title, body, link_url, is_read)
             VALUES (?, 'callback_reminder', 'Customer Callback Reminder', ?, ?, 0)`,
            [employeeId, notifBody, linkUrl]
          );
          notifId = notifResult.insertId;
        }
        await db.query('UPDATE callback_reminders SET notification_id = ? WHERE id = ?', [notifId, existing.id]);
      }
    } else {
      // Create or reuse notification first
      let notifId = null;
      const [[existingNotif]] = await db.query(
        `SELECT id FROM employee_notifications
         WHERE employee_id = ? AND type = 'callback_reminder' AND body LIKE ? AND is_read = 0
         ORDER BY id DESC LIMIT 1`,
        [employeeId, `%${phoneNumber}%`]
      );

      if (existingNotif) {
        notifId = existingNotif.id;
        await db.query(
          `UPDATE employee_notifications SET title = 'Customer Callback Reminder', body = ?, updated_at = NOW() WHERE id = ?`,
          [notifBody, notifId]
        );
      } else {
        const linkUrl = `/employee/data-excel.html`;
        const [notifResult] = await db.query(
          `INSERT INTO employee_notifications (employee_id, type, title, body, link_url, is_read)
           VALUES (?, 'callback_reminder', 'Customer Callback Reminder', ?, ?, 0)`,
          [employeeId, notifBody, linkUrl]
        );
        notifId = notifResult.insertId;
      }

      // Create reminder
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
    console.error('[Notifications] upsertCallbackReminder:', err.message);
  }
};

// ── Internal: Create Work Assigned Notification ───────────────────────────────
// Called from excelController.assignEmployees for each newly assigned employee.
// Prevents duplicate notifications if admin re-assigns or saves multiple times.
exports.createWorkAssignedNotification = async ({ employeeId, fileName, assignedByName }) => {
  try {
    const body = `${assignedByName || 'Admin'} assigned you a new workbook: ${fileName}`;

    const [[existing]] = await db.query(
      `SELECT id FROM employee_notifications
       WHERE employee_id = ? AND type = 'work_assigned' AND body = ? AND is_read = 0
       ORDER BY id DESC LIMIT 1`,
      [employeeId, body]
    );

    if (existing) {
      await db.query(
        'UPDATE employee_notifications SET updated_at = NOW() WHERE id = ?',
        [existing.id]
      );
    } else {
      await db.query(
        `INSERT INTO employee_notifications (employee_id, type, title, body, link_url, is_read)
         VALUES (?, 'work_assigned', 'New Work Assigned', ?, '/employee/data-excel.html', 0)`,
        [employeeId, body]
      );
    }
  } catch (err) {
    console.error('[Notifications] createWorkAssignedNotification:', err.message);
  }
};
