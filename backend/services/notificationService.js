const db = require('../config/db');
const realtime = require('./notificationRealtime');

class NotificationService {
  /**
   * Core notification creation method.
   * Inserts into `notifications` and distributes to all intended recipients in `notification_recipients`.
   */
  async createNotification({
    type = 'general',
    title,
    message,
    senderId = null,
    senderRole = 'system',
    recipientRole = 'employee',
    audienceType = 'individual',
    recipients = [], // Array of user IDs (or empty if role-based)
    priority = 'normal',
    actionUrl = null,
    entityType = null,
    entityId = null,
    metadata = {}
  }) {
    if (!title || !message) {
      throw new Error('Title and message are required for notification creation.');
    }

    // 1. Resolve recipients
    let targetUserIds = [];

    if (recipientRole === 'admin') {
      const [admins] = await db.query("SELECT id FROM users WHERE role = 'admin' AND is_active = 1");
      targetUserIds = admins.map(a => a.id);
    } else if (audienceType === 'all') {
      const [employees] = await db.query("SELECT id FROM users WHERE role = 'employee' AND is_active = 1");
      targetUserIds = employees.map(e => e.id);
    } else if (Array.isArray(recipients) && recipients.length > 0) {
      // Validate that all recipients exist and are active
      const placeholders = recipients.map(() => '?').join(',');
      const [validUsers] = await db.query(
        `SELECT id FROM users WHERE id IN (${placeholders}) AND is_active = 1`,
        recipients
      );
      targetUserIds = validUsers.map(u => u.id);
    }

    if (targetUserIds.length === 0) {
      console.warn(`[NotificationService] No active recipients resolved for notification: "${title}" (role: ${recipientRole}, audience: ${audienceType})`);
      return null;
    }

    // 2. Insert into master `notifications` table
    const [notifResult] = await db.query(`
      INSERT INTO notifications (
        type, title, message, sender_id, sender_role, recipient_role,
        audience_type, priority, action_url, entity_type, entity_id,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      type,
      title,
      message,
      senderId,
      senderRole,
      recipientRole,
      audienceType,
      priority,
      actionUrl,
      entityType,
      entityId,
      JSON.stringify(metadata || {})
    ]);

    const notificationId = notifResult.insertId;

    // 3. Insert individual recipient tracking records
    const recipientValues = targetUserIds.map(uid => [
      notificationId,
      uid,
      recipientRole === 'admin' ? 'admin' : 'employee',
      0, // is_delivered
      null,
      0, // is_read
      null,
      0  // is_archived
    ]);

    for (const val of recipientValues) {
      await db.query(`
        INSERT IGNORE INTO notification_recipients (
          notification_id, user_id, role, is_delivered, delivered_at,
          is_read, read_at, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, val);
    }

    // 4. Backward-compatible sync to employee_notifications table for employee recipients
    if (recipientRole === 'employee' || recipientRole === 'all') {
      for (const empId of targetUserIds) {
        try {
          await db.query(`
            INSERT INTO employee_notifications (
              employee_id, type, title, message, body, link_url,
              priority, entity_type, entity_id, assignment_id, record_id, customer_id, loan_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            empId,
            type,
            title,
            message,
            message,
            actionUrl,
            priority,
            entityType,
            entityId,
            metadata.assignment_id || (entityType === 'assignment' ? entityId : null),
            metadata.record_id || (entityType === 'record' ? entityId : null),
            metadata.customer_id || (entityType === 'customer' ? entityId : null),
            metadata.loan_id || (entityType === 'loan' ? entityId : null)
          ]);
        } catch (legacyErr) {
          // Non-blocking fallback
          console.warn('[NotificationService] Legacy table sync notice:', legacyErr.message);
        }
      }
    }

    // 5. Construct broadcast payload
    const payload = {
      id: notificationId,
      type,
      title,
      message,
      sender_id: senderId,
      sender_role: senderRole,
      recipient_role: recipientRole,
      audience_type: audienceType,
      priority,
      action_url: actionUrl,
      link_url: actionUrl,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
      is_read: 0,
      is_delivered: 0,
      created_at: new Date().toISOString()
    };

    // 6. Push real-time event via SSE
    if (recipientRole === 'admin') {
      realtime.pushToAdmins('notification:new', payload);
    } else {
      realtime.pushToEmployees(audienceType === 'all' ? 'all' : targetUserIds, 'notification:new', payload);
    }

    console.log(`[NotificationService] Notification #${notificationId} created and dispatched to ${targetUserIds.length} recipient(s).`);
    return { notificationId, recipientCount: targetUserIds.length, payload };
  }

  /**
   * Helper: Triggered when employee completes and submits "My Assigned Records".
   * Meets all requirements for Phase 2:
   * Title: Assigned Records Submitted
   * Message: Employee [Employee Name] has completed and submitted their assigned customer records.
   * Includes employee name, record/file reference, timestamp, action link to details.
   */
  async notifyAdminSubmission({ employeeId, employeeName, assignmentId, fileId, fileName, recordCount }) {
    // Check duplicate submission within 3 minutes
    const [[dup]] = await db.query(`
      SELECT id FROM notifications
      WHERE type = 'employee_submission'
        AND entity_type = 'assignment'
        AND entity_id = ?
        AND created_at >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)
      LIMIT 1
    `, [assignmentId]);

    if (dup) {
      console.log(`[NotificationService] Duplicate submission notification suppressed for assignment #${assignmentId}`);
      return dup;
    }

    const title = 'Assigned Records Submitted';
    const fileLabel = fileName ? ` from "${fileName}"` : '';
    const countLabel = recordCount ? ` (${recordCount} records)` : '';
    const message = `Employee ${employeeName || 'Staff'} has completed and submitted their assigned customer records${countLabel}${fileLabel}.`;
    const actionUrl = `/admin/data-excel.html?fileId=${fileId || ''}&assignmentId=${assignmentId}`;

    return this.createNotification({
      type: 'employee_submission',
      title,
      message,
      senderId: employeeId,
      senderRole: 'employee',
      recipientRole: 'admin',
      audienceType: 'role',
      priority: 'important',
      actionUrl,
      entityType: 'assignment',
      entityId: assignmentId,
      metadata: {
        employee_id: employeeId,
        employee_name: employeeName,
        assignment_id: assignmentId,
        file_id: fileId,
        file_name: fileName,
        record_count: recordCount,
        submission_timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Triggered when employee adds a new customer
   */
  async notifyAdminCustomerCreated({ employeeId, employeeName, customerId, customerName, phone }) {
    const title = 'New Customer Added';
    const message = `Employee ${employeeName || 'Staff'} added new customer "${customerName || 'Customer'}" (${phone || ''}).`;
    const actionUrl = `/admin/customers.html?customerId=${customerId}`;

    return this.createNotification({
      type: 'customer_created',
      title,
      message,
      senderId: employeeId,
      senderRole: 'employee',
      recipientRole: 'admin',
      audienceType: 'role',
      priority: 'normal',
      actionUrl,
      entityType: 'customer',
      entityId: customerId,
      metadata: {
        employee_id: employeeId,
        employee_name: employeeName,
        customer_id: customerId,
        customer_name: customerName,
        phone
      }
    });
  }

  /**
   * Triggered when employee creates/submits a loan application
   */
  async notifyAdminLoanSubmitted({ employeeId, employeeName, loanId, loanNumber, amount, customerName }) {
    const title = 'New Loan Application';
    const amtStr = amount ? ` of ₹${Number(amount).toLocaleString('en-IN')}` : '';
    const message = `Employee ${employeeName || 'Staff'} submitted loan application #${loanNumber || loanId}${amtStr} for ${customerName || 'customer'}.`;
    const actionUrl = `/admin/loans.html?loanId=${loanId}`;

    return this.createNotification({
      type: 'loan_application_submitted',
      title,
      message,
      senderId: employeeId,
      senderRole: 'employee',
      recipientRole: 'admin',
      audienceType: 'role',
      priority: 'important',
      actionUrl,
      entityType: 'loan',
      entityId: loanId,
      metadata: {
        employee_id: employeeId,
        employee_name: employeeName,
        loan_id: loanId,
        loan_number: loanNumber,
        amount,
        customer_name: customerName
      }
    });
  }

  /**
   * Triggered when customer documents are uploaded
   */
  async notifyAdminDocumentUploaded({ employeeId, employeeName, customerId, customerName, docType, fileName }) {
    const title = 'Customer Document Uploaded';
    const message = `Employee ${employeeName || 'Staff'} uploaded ${docType || 'document'} ("${fileName || 'file'}") for ${customerName || 'customer'}.`;
    const actionUrl = `/admin/customers.html?customerId=${customerId}`;

    return this.createNotification({
      type: 'document_uploaded',
      title,
      message,
      senderId: employeeId,
      senderRole: 'employee',
      recipientRole: 'admin',
      audienceType: 'role',
      priority: 'normal',
      actionUrl,
      entityType: 'customer',
      entityId: customerId,
      metadata: {
        employee_id: employeeId,
        employee_name: employeeName,
        customer_id: customerId,
        customer_name: customerName,
        doc_type: docType,
        file_name: fileName
      }
    });
  }

  /**
   * Admin Announcement & Message Composer Handler (Phase 3)
   */
  async sendAdminAnnouncement({
    adminId,
    title,
    message,
    priority = 'normal',
    actionUrl = null,
    audience = 'all', // 'all' | 'selected' | 'individual'
    employeeIds = []
  }) {
    let finalAudience = audience;
    let recipients = employeeIds;

    if (audience === 'individual' && employeeIds.length === 1) {
      finalAudience = 'individual';
    } else if (audience === 'selected') {
      finalAudience = 'selected';
    } else {
      finalAudience = 'all';
    }

    const type = finalAudience === 'individual' ? 'admin_message' : 'admin_announcement';

    const result = await this.createNotification({
      type,
      title,
      message,
      senderId: adminId,
      senderRole: 'admin',
      recipientRole: 'employee',
      audienceType: finalAudience,
      recipients: finalAudience === 'all' ? [] : recipients,
      priority,
      actionUrl,
      entityType: 'announcement',
      metadata: {
        sent_by_admin_id: adminId,
        audience_scope: finalAudience,
        intended_count: finalAudience === 'all' ? 'all' : recipients.length
      }
    });

    return result;
  }

  /**
   * Get Announcement Status Audit (Phase 3 Delivery and Read Status)
   * Returns confirmed Sent, Delivered, and Read metrics with per-employee details.
   */
  async getAnnouncementStatus(notificationId) {
    const [[notif]] = await db.query(`
      SELECT n.*, u.name as sender_name
      FROM notifications n
      LEFT JOIN users u ON u.id = n.sender_id
      WHERE n.id = ?
    `, [notificationId]);

    if (!notif) return null;

    const [recipients] = await db.query(`
      SELECT nr.*, u.name as employee_name, u.email as employee_email, u.phone as employee_phone
      FROM notification_recipients nr
      JOIN users u ON u.id = nr.user_id
      WHERE nr.notification_id = ?
      ORDER BY nr.is_read DESC, nr.is_delivered DESC, u.name ASC
    `, [notificationId]);

    const totalSent = recipients.length;
    const deliveredCount = recipients.filter(r => r.is_delivered).length;
    const readCount = recipients.filter(r => r.is_read).length;

    return {
      notification: {
        id: notif.id,
        title: notif.title,
        message: notif.message,
        priority: notif.priority,
        type: notif.type,
        audience_type: notif.audience_type,
        action_url: notif.action_url,
        created_at: notif.created_at,
        sender_name: notif.sender_name
      },
      stats: {
        total_sent: totalSent,
        total_delivered: deliveredCount,
        total_read: readCount,
        delivery_rate: totalSent > 0 ? Math.round((deliveredCount / totalSent) * 100) : 0,
        read_rate: totalSent > 0 ? Math.round((readCount / totalSent) * 100) : 0
      },
      recipients: recipients.map(r => ({
        user_id: r.user_id,
        name: r.employee_name,
        email: r.employee_email,
        phone: r.employee_phone,
        is_delivered: Boolean(r.is_delivered),
        delivered_at: r.delivered_at,
        is_read: Boolean(r.is_read),
        read_at: r.read_at
      }))
    };
  }

  /**
   * Get list of announcements sent by Admin for audit log
   */
  async getAdminAnnouncementsList(adminId, limit = 50) {
    const [rows] = await db.query(`
      SELECT n.id, n.title, n.message, n.priority, n.audience_type, n.type, n.action_url, n.created_at,
             COUNT(nr.id) as total_sent,
             SUM(CASE WHEN nr.is_delivered = 1 THEN 1 ELSE 0 END) as total_delivered,
             SUM(CASE WHEN nr.is_read = 1 THEN 1 ELSE 0 END) as total_read
      FROM notifications n
      LEFT JOIN notification_recipients nr ON nr.notification_id = n.id
      WHERE n.sender_role = 'admin' AND n.type IN ('admin_announcement', 'admin_message')
      GROUP BY n.id
      ORDER BY n.created_at DESC
      LIMIT ?
    `, [limit]);

    return rows.map(r => ({
      id: r.id,
      title: r.title,
      message: r.message,
      priority: r.priority,
      audience_type: r.audience_type,
      type: r.type,
      action_url: r.action_url,
      created_at: r.created_at,
      total_sent: Number(r.total_sent || 0),
      total_delivered: Number(r.total_delivered || 0),
      total_read: Number(r.total_read || 0)
    }));
  }

  /**
   * Fetch paginated notifications for current user (Admin or Employee)
   * Supports tabs: 'all', 'unread', 'read'
   */
  async getUserNotifications(userId, { tab = 'all', page = 1, limit = 50, search = '' } = {}) {
    const offset = (Math.max(1, page) - 1) * limit;

    let whereClause = 'WHERE nr.user_id = ? AND nr.is_archived = 0';
    const params = [userId];

    if (tab === 'unread') {
      whereClause += ' AND nr.is_read = 0';
    } else if (tab === 'read') {
      whereClause += ' AND nr.is_read = 1';
    }

    if (search && search.trim()) {
      whereClause += ' AND (n.title LIKE ? OR n.message LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    // Fast total count
    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) as total
      FROM notification_recipients nr
      JOIN notifications n ON n.id = nr.notification_id
      ${whereClause}
    `, params);

    // Fast unread count
    const [[{ unreadCount }]] = await db.query(`
      SELECT COUNT(*) as unreadCount
      FROM notification_recipients nr
      WHERE nr.user_id = ? AND nr.is_read = 0 AND nr.is_archived = 0
    `, [userId]);

    // Query items
    const [rows] = await db.query(`
      SELECT n.id, n.type, n.title, n.message, n.priority, n.action_url,
             n.entity_type, n.entity_id, n.metadata, n.created_at,
             n.sender_id, n.sender_role,
             nr.is_delivered, nr.delivered_at, nr.is_read, nr.read_at,
             u.name as sender_name
      FROM notification_recipients nr
      JOIN notifications n ON n.id = nr.notification_id
      LEFT JOIN users u ON u.id = n.sender_id
      ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, Number(limit), Number(offset)]);

    const notifications = rows.map(r => ({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      body: r.message,
      priority: r.priority || 'normal',
      action_url: r.action_url,
      link_url: r.action_url,
      linkUrl: r.action_url,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {}),
      created_at: r.created_at,
      createdAt: r.created_at,
      sender_id: r.sender_id,
      sender_role: r.sender_role,
      sender_name: r.sender_name || (r.sender_role === 'admin' ? 'Dixit Lending Admin' : 'System'),
      is_delivered: Boolean(r.is_delivered),
      delivered_at: r.delivered_at,
      is_read: Boolean(r.is_read) ? 1 : 0,
      isRead: Boolean(r.is_read),
      read_at: r.read_at,
      readAt: r.read_at
    }));

    return {
      notifications,
      total,
      unreadCount,
      unread_count: unreadCount,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Fast unread count for current user
   */
  async getUnreadCount(userId) {
    const [[{ unreadCount }]] = await db.query(`
      SELECT COUNT(*) as unreadCount
      FROM notification_recipients
      WHERE user_id = ? AND is_read = 0 AND is_archived = 0
    `, [userId]);

    return Number(unreadCount || 0);
  }

  /**
   * Mark single notification as read
   */
  async markRead(userId, notificationId) {
    await db.query(`
      UPDATE notification_recipients
      SET is_read = 1, read_at = NOW(), is_delivered = 1, delivered_at = COALESCE(delivered_at, NOW()), updated_at = NOW()
      WHERE user_id = ? AND notification_id = ?
    `, [userId, notificationId]);

    // Also update legacy table if present
    await db.query(`
      UPDATE employee_notifications
      SET is_read = 1, read_at = NOW(), status = 'read', updated_at = NOW()
      WHERE employee_id = ? AND (id = ? OR link_url LIKE ?)
    `, [userId, notificationId, `%${notificationId}%`]).catch(() => {});

    const unreadCount = await this.getUnreadCount(userId);

    // Notify user's other browser tabs via real-time bus
    realtime.pushToUser(userId, 'notification:read', {
      notificationId: Number(notificationId),
      unreadCount
    });

    return { success: true, unreadCount };
  }

  /**
   * Mark all notifications as read for current user
   */
  async markAllRead(userId) {
    await db.query(`
      UPDATE notification_recipients
      SET is_read = 1, read_at = NOW(), is_delivered = 1, delivered_at = COALESCE(delivered_at, NOW()), updated_at = NOW()
      WHERE user_id = ? AND is_read = 0 AND is_archived = 0
    `, [userId]);

    // Legacy table sync
    await db.query(`
      UPDATE employee_notifications
      SET is_read = 1, read_at = NOW(), status = 'read', updated_at = NOW()
      WHERE employee_id = ? AND is_read = 0
    `, [userId]).catch(() => {});

    // Notify user's tabs
    realtime.pushToUser(userId, 'notification:read_all', { unreadCount: 0 });

    return { success: true, unreadCount: 0 };
  }

  /**
   * Acknowledge delivery of a notification (Confirmed Real-time Delivery)
   */
  async markDelivered(userId, notificationId) {
    await db.query(`
      UPDATE notification_recipients
      SET is_delivered = 1, delivered_at = COALESCE(delivered_at, NOW()), updated_at = NOW()
      WHERE user_id = ? AND notification_id = ? AND is_delivered = 0
    `, [userId, notificationId]);

    // Push delivery event to Admin so admin tracker updates live
    const [[recip]] = await db.query(`
      SELECT nr.*, n.sender_id, n.sender_role, u.name as employee_name
      FROM notification_recipients nr
      JOIN notifications n ON n.id = nr.notification_id
      JOIN users u ON u.id = nr.user_id
      WHERE nr.user_id = ? AND nr.notification_id = ?
    `, [userId, notificationId]);

    if (recip && recip.sender_role === 'admin' && recip.sender_id) {
      realtime.pushToUser(recip.sender_id, 'notification:delivery_ack', {
        notificationId: Number(notificationId),
        userId: Number(userId),
        employeeName: recip.employee_name,
        deliveredAt: recip.delivered_at || new Date().toISOString()
      });
    }

    return { success: true };
  }

  /**
   * Soft-delete / Archive notification for current user
   */
  async archiveNotification(userId, notificationId) {
    await db.query(`
      UPDATE notification_recipients
      SET is_archived = 1, archived_at = NOW(), updated_at = NOW()
      WHERE user_id = ? AND notification_id = ?
    `, [userId, notificationId]);

    const unreadCount = await this.getUnreadCount(userId);

    realtime.pushToUser(userId, 'notification:archived', {
      notificationId: Number(notificationId),
      unreadCount
    });

    return { success: true, unreadCount };
  }

  /**
   * Get user notification preferences
   */
  async getPreferences(userId) {
    const [[prefs]] = await db.query('SELECT * FROM notification_preferences WHERE user_id = ?', [userId]);
    if (!prefs) {
      return {
        user_id: userId,
        sound_enabled: 1,
        browser_notifications_enabled: 0,
        announcement_alerts: 1,
        task_alerts: 1,
        loan_alerts: 1,
        employee_activity_alerts: 1,
        system_alerts: 1
      };
    }
    return prefs;
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(userId, data) {
    await db.query(`
      INSERT INTO notification_preferences (
        user_id, sound_enabled, browser_notifications_enabled,
        announcement_alerts, task_alerts, loan_alerts,
        employee_activity_alerts, system_alerts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        sound_enabled = VALUES(sound_enabled),
        browser_notifications_enabled = VALUES(browser_notifications_enabled),
        announcement_alerts = VALUES(announcement_alerts),
        task_alerts = VALUES(task_alerts),
        loan_alerts = VALUES(loan_alerts),
        employee_activity_alerts = VALUES(employee_activity_alerts),
        system_alerts = VALUES(system_alerts)
    `, [
      userId,
      data.sound_enabled !== undefined ? (data.sound_enabled ? 1 : 0) : 1,
      data.browser_notifications_enabled !== undefined ? (data.browser_notifications_enabled ? 1 : 0) : 0,
      data.announcement_alerts !== undefined ? (data.announcement_alerts ? 1 : 0) : 1,
      data.task_alerts !== undefined ? (data.task_alerts ? 1 : 0) : 1,
      data.loan_alerts !== undefined ? (data.loan_alerts ? 1 : 0) : 1,
      data.employee_activity_alerts !== undefined ? (data.employee_activity_alerts ? 1 : 0) : 1,
      data.system_alerts !== undefined ? (data.system_alerts ? 1 : 0) : 1
    ]);

    return this.getPreferences(userId);
  }
}

module.exports = new NotificationService();
