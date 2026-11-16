const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../config/db');
const {
  useR2,
  privateStorageDir,
  getRetentionConfig,
  deleteStoredFile,
} = require('../utils/communicationCleanup');
const socketService = require('../services/socketService');
let notificationService;
try {
  const NotificationServiceClass = require('../services/notificationService');
  notificationService = new NotificationServiceClass();
} catch (e) {
  notificationService = null;
}

// ── File Validation Constants ──────────────────────────────────────────────
const ALLOWED_MIME_BY_EXT = {
  '.pdf':  ['application/pdf'],
  '.jpg':  ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png':  ['image/png'],
  '.webp': ['image/webp'],
};

const FILE_SIGNATURES = [
  { ext: '.pdf',  bytes: [0x25, 0x50, 0x44, 0x46] },             // %PDF
  { ext: '.jpg',  bytes: [0xFF, 0xD8, 0xFF] },                    // JPEG/JFIF
  { ext: '.jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { ext: '.png',  bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { ext: '.webp', bytes: [0x52, 0x49, 0x46, 0x46] },              // RIFF (WEBP)
];

function verifyMagicBytes(filePath, ext) {
  const rule = FILE_SIGNATURES.find(r => r.ext === ext.toLowerCase());
  if (!rule) return false;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(rule.bytes.length);
    fs.readSync(fd, buf, 0, rule.bytes.length, 0);
    fs.closeSync(fd);
    return rule.bytes.every((b, i) => buf[i] === b);
  } catch {
    return false;
  }
}

// ── Helper: Audit Logging ──────────────────────────────────────────────────
async function logCommAudit(adminId, actionType, targetEmployeeId, details, req) {
  try {
    const ip = req?.ip || req?.connection?.remoteAddress || '127.0.0.1';
    await db.query(
      `INSERT INTO communication_audit_logs (admin_id, action_type, target_employee_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?)`,
      [adminId, actionType, targetEmployeeId, JSON.stringify(details || {}), ip]
    );
  } catch (err) {
    console.error('[CommAudit error]:', err.message);
  }
}

// ── Helper: Verify Employee Access ─────────────────────────────────────────
async function isEmployeeAuthorized(employeeId) {
  const [[emp]] = await db.query(
    `SELECT u.is_active, ca.has_access
     FROM users u
     LEFT JOIN employee_communication_access ca ON ca.employee_id = u.id
     WHERE u.id = ? AND u.role = 'employee'`,
    [employeeId]
  );
  if (!emp) return false;
  return emp.is_active === 1 && emp.has_access === 1;
}

// ── Helper: Get or Create Conversation ─────────────────────────────────────
async function getOrCreateConversation(employeeId) {
  const [[existing]] = await db.query(
    `SELECT id, employee_id, admin_unread_count, employee_unread_count, last_message_at, created_at
     FROM private_conversations WHERE employee_id = ?`,
    [employeeId]
  );
  if (existing) return existing;

  const [res] = await db.query(
    `INSERT INTO private_conversations (employee_id) VALUES (?)`,
    [employeeId]
  );

  return {
    id: res.insertId,
    employee_id: employeeId,
    admin_unread_count: 0,
    employee_unread_count: 0,
    last_message_at: null,
  };
}

// ── Helper: Get Company Group ID ───────────────────────────────────────────
async function getCompanyGroupId() {
  const [[grp]] = await db.query(`SELECT id FROM communication_groups WHERE name = 'Company Group' LIMIT 1`);
  if (grp) return grp.id;
  const [res] = await db.query(`
    INSERT INTO communication_groups (name, description, is_active)
    VALUES ('Company Group', 'Official company-wide collaboration group', 1)
  `);
  return res.insertId;
}

// ── Helper: Fetch Attachments Map for Messages ─────────────────────────────
async function fetchAttachmentsForMessages(messageIds) {
  if (!messageIds || messageIds.length === 0) return {};
  const [attachments] = await db.query(
    `SELECT a.id, a.message_id, a.original_name, a.mime_type, a.file_size,
            a.expires_at, TIMESTAMPDIFF(SECOND, NOW(), a.expires_at) AS remaining_seconds
     FROM private_message_attachments a
     WHERE a.message_id IN (?) AND a.expires_at > NOW()
     ORDER BY a.id ASC`,
    [messageIds]
  );

  const attachmentsMap = {};
  for (const att of attachments) {
    if (!attachmentsMap[att.message_id]) attachmentsMap[att.message_id] = [];
    attachmentsMap[att.message_id].push({
      id: att.id,
      name: att.original_name,
      mime_type: att.mime_type,
      size: Number(att.file_size),
      remaining_seconds: Math.max(0, att.remaining_seconds || 0),
      download_url: `/api/private-communication/attachments/${att.id}/download`,
      view_url: `/api/private-communication/attachments/${att.id}/view`,
    });
  }
  return attachmentsMap;
}

// ── Helper: Fetch Reactions Map for Messages ───────────────────────────────
async function fetchReactionsForMessages(messageIds, currentUserId) {
  if (!messageIds || messageIds.length === 0) return {};
  const [reactions] = await db.query(
    `SELECT r.message_id, r.user_id, r.emoji, u.name AS user_name
     FROM communication_message_reactions r
     JOIN users u ON u.id = r.user_id
     WHERE r.message_id IN (?)
     ORDER BY r.created_at ASC`,
    [messageIds]
  );

  const reactionsMap = {};
  for (const r of reactions) {
    if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = {};
    if (!reactionsMap[r.message_id][r.emoji]) {
      reactionsMap[r.message_id][r.emoji] = {
        emoji: r.emoji,
        count: 0,
        users: [],
        hasReacted: false,
      };
    }
    reactionsMap[r.message_id][r.emoji].count += 1;
    reactionsMap[r.message_id][r.emoji].users.push({ id: r.user_id, name: r.user_name });
    if (r.user_id === currentUserId) {
      reactionsMap[r.message_id][r.emoji].hasReacted = true;
    }
  }

  // Format into arrays
  const formatted = {};
  for (const msgId in reactionsMap) {
    formatted[msgId] = Object.values(reactionsMap[msgId]);
  }
  return formatted;
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ACCESS CONTROLLERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/private-communication/admin/employees
 * List all employees with communication access status
 */
exports.getAdminEmployees = async (req, res) => {
  try {
    const [employees] = await db.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.is_active,
        COALESCE(ca.has_access, 0) AS has_access,
        ca.updated_at AS access_updated_at,
        c.id AS conversation_id,
        c.admin_unread_count,
        c.employee_unread_count,
        c.last_message_at
      FROM users u
      LEFT JOIN employee_communication_access ca ON ca.employee_id = u.id
      LEFT JOIN private_conversations c ON c.employee_id = u.id
      WHERE u.role = 'employee'
      ORDER BY u.name ASC
    `);

    const formatted = employees.map(emp => ({
      id: emp.id,
      name: emp.name,
      email: emp.email,
      is_active: emp.is_active === 1,
      has_access: emp.has_access === 1,
      access_updated_at: emp.access_updated_at,
      conversation_id: emp.conversation_id,
      unread_count: emp.admin_unread_count || 0,
      last_message_at: emp.last_message_at,
      is_online: socketService.isUserOnline(emp.id),
    }));

    return res.json({ success: true, employees: formatted });
  } catch (err) {
    console.error('[Comm getAdminEmployees error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve employee access list.' });
  }
};

/**
 * PATCH /api/private-communication/admin/employees/:id/access
 * Grant or revoke communication access for a single employee
 */
exports.updateEmployeeAccess = async (req, res) => {
  try {
    const adminId = req.user.id;
    const employeeId = parseInt(req.params.id, 10);
    const { has_access } = req.body;

    if (!employeeId || typeof has_access !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Invalid employee ID or access state.' });
    }

    const [[emp]] = await db.query(
      `SELECT id, name, email, is_active FROM users WHERE id = ? AND role = 'employee'`,
      [employeeId]
    );

    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const accessVal = has_access ? 1 : 0;
    await db.query(`
      INSERT INTO employee_communication_access (employee_id, has_access, updated_by)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE has_access = VALUES(has_access), updated_by = VALUES(updated_by)
    `, [employeeId, accessVal, adminId]);

    await logCommAudit(
      adminId,
      has_access ? 'GRANT_ACCESS' : 'REVOKE_ACCESS',
      employeeId,
      { employee_email: emp.email, employee_name: emp.name },
      req
    );

    return res.json({
      success: true,
      message: `Communication access ${has_access ? 'granted to' : 'revoked from'} ${emp.name}.`,
      employee: {
        id: emp.id,
        name: emp.name,
        has_access,
      },
    });
  } catch (err) {
    console.error('[Comm updateEmployeeAccess error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to update employee access.' });
  }
};

/**
 * POST /api/private-communication/admin/bulk-access
 * Bulk grant or revoke communication access
 */
exports.bulkUpdateAccess = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { employee_ids, has_access } = req.body;

    if (!Array.isArray(employee_ids) || employee_ids.length === 0 || typeof has_access !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Invalid request: employee_ids array and has_access boolean are required.' });
    }

    const accessVal = has_access ? 1 : 0;
    for (const empId of employee_ids) {
      await db.query(`
        INSERT INTO employee_communication_access (employee_id, has_access, updated_by)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE has_access = VALUES(has_access), updated_by = VALUES(updated_by)
      `, [empId, accessVal, adminId]);
    }

    await logCommAudit(
      adminId,
      has_access ? 'BULK_GRANT_ACCESS' : 'BULK_REVOKE_ACCESS',
      null,
      { employee_count: employee_ids.length, employee_ids },
      req
    );

    return res.json({
      success: true,
      message: `Successfully updated communication access for ${employee_ids.length} employees.`,
    });
  } catch (err) {
    console.error('[Comm bulkUpdateAccess error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to bulk update access.' });
  }
};

/**
 * GET /api/private-communication/admin/conversations
 * Retrieve all active conversations for the Admin sidebar
 */
exports.getAdminConversations = async (req, res) => {
  try {
    const [conversations] = await db.query(`
      SELECT
        c.id,
        c.employee_id,
        c.admin_unread_count,
        c.employee_unread_count,
        c.last_message_at,
        u.name AS employee_name,
        u.email AS employee_email,
        u.is_active AS employee_is_active,
        COALESCE(ca.has_access, 0) AS has_access,
        (
          SELECT m.content
          FROM private_messages m
          WHERE m.conversation_id = c.id AND m.expires_at > NOW()
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_message_preview,
        (
          SELECT m.message_type
          FROM private_messages m
          WHERE m.conversation_id = c.id AND m.expires_at > NOW()
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_message_type,
        (
          SELECT m.sender_role
          FROM private_messages m
          WHERE m.conversation_id = c.id AND m.expires_at > NOW()
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_sender_role
      FROM private_conversations c
      JOIN users u ON u.id = c.employee_id
      LEFT JOIN employee_communication_access ca ON ca.employee_id = u.id
      ORDER BY
        (c.admin_unread_count > 0) DESC,
        c.last_message_at DESC,
        u.name ASC
    `);

    const formatted = conversations.map(c => ({
      id: c.id,
      employee_id: c.employee_id,
      employee_name: c.employee_name,
      employee_email: c.employee_email,
      employee_is_active: c.employee_is_active === 1,
      has_access: c.has_access === 1,
      unread_count: c.admin_unread_count || 0,
      last_message_at: c.last_message_at,
      last_message_preview: c.last_message_type === 'otp' ? '🔐 Verification OTP' : (c.last_message_preview || (c.last_message_type === 'attachment' ? '📎 Attachment' : 'No messages yet')),
      last_sender_role: c.last_sender_role,
      is_online: socketService.isUserOnline(c.employee_id),
    }));

    return res.json({ success: true, conversations: formatted });
  } catch (err) {
    console.error('[Comm getAdminConversations error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve conversations.' });
  }
};

/**
 * GET /api/private-communication/admin/conversations/:id/messages
 * Retrieve unexpired messages for an active conversation
 */
exports.getAdminConversationMessages = async (req, res) => {
  try {
    const adminId = req.user.id;
    const conversationId = parseInt(req.params.id, 10);
    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'Invalid conversation ID.' });
    }

    const [[conv]] = await db.query(
      `SELECT c.id, c.employee_id, u.name AS employee_name, u.email AS employee_email,
              u.is_active, ca.has_access
       FROM private_conversations c
       JOIN users u ON u.id = c.employee_id
       LEFT JOIN employee_communication_access ca ON ca.employee_id = u.id
       WHERE c.id = ?`,
      [conversationId]
    );

    if (!conv) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    if (conv.has_access !== 1 || conv.is_active !== 1) {
      return res.status(403).json({
        success: false,
        message: 'This employee does not currently have permission for Private Communication.',
      });
    }

    // Mark unread employee messages as read and delivered
    await db.query(
      `UPDATE private_messages
       SET is_read = 1, read_at = NOW(), is_delivered = 1, delivered_at = COALESCE(delivered_at, NOW())
       WHERE conversation_id = ? AND sender_role = 'employee' AND is_read = 0 AND expires_at > NOW()`,
      [conversationId]
    );
    await db.query(
      `UPDATE private_messages
       SET is_delivered = 1, delivered_at = COALESCE(delivered_at, NOW())
       WHERE conversation_id = ? AND sender_role = 'employee' AND is_delivered = 0 AND expires_at > NOW()`,
      [conversationId]
    );
    await db.query(
      `UPDATE private_conversations SET admin_unread_count = 0 WHERE id = ?`,
      [conversationId]
    );

    // Notify employee that admin read their messages
    socketService.emit1on1MessageRead(conversationId, 'admin', adminId);

    // Retrieve unexpired messages
    const [messages] = await db.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.sender_role, m.message_type,
              m.content, m.otp_value, m.otp_case_reference, m.otp_purpose,
              m.reply_to_id, m.is_pinned, m.is_edited, m.edited_at,
              m.is_delivered, m.delivered_at,
              m.is_read, m.read_at, m.expires_at, m.created_at,
              TIMESTAMPDIFF(SECOND, NOW(), m.expires_at) AS remaining_seconds,
              u.name AS sender_name,
              rm.content AS reply_content,
              ru.name AS reply_sender_name
       FROM private_messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN private_messages rm ON rm.id = m.reply_to_id
       LEFT JOIN users ru ON ru.id = rm.sender_id
       WHERE m.conversation_id = ? AND m.expires_at > NOW()
       ORDER BY m.created_at ASC`,
      [conversationId]
    );

    const messageIds = messages.map(m => m.id);
    const attachmentsMap = await fetchAttachmentsForMessages(messageIds);
    const reactionsMap = await fetchReactionsForMessages(messageIds, adminId);

    const formattedMessages = messages.map(m => {
      const isMyMessage = m.sender_role === 'admin';
      let status = 'sent';
      if (isMyMessage) {
        if (m.is_read === 1) status = 'read';
        else if (m.is_delivered === 1) status = 'delivered';
      } else {
        status = m.is_delivered === 1 ? 'delivered' : 'sent';
      }
      return {
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        sender_role: m.sender_role,
        sender_name: m.sender_name,
        message_type: m.message_type,
        content: m.content || '',
        otp_value: m.otp_value,
        otp_case_reference: m.otp_case_reference,
        otp_purpose: m.otp_purpose,
        reply_to_id: m.reply_to_id,
        reply_preview: m.reply_to_id ? {
          id: m.reply_to_id,
          sender_name: m.reply_sender_name,
          content: m.reply_content,
        } : null,
        is_pinned: m.is_pinned === 1,
        is_edited: m.is_edited === 1,
        edited_at: m.edited_at,
        is_delivered: m.is_delivered === 1,
        delivered_at: m.delivered_at,
        is_read: m.is_read === 1,
        read_at: m.read_at,
        status,
        created_at: m.created_at,
        expires_at: m.expires_at,
        remaining_seconds: Math.max(0, m.remaining_seconds || 0),
        attachments: attachmentsMap[m.id] || [],
        reactions: reactionsMap[m.id] || [],
      };
    });

    return res.json({
      success: true,
      conversation: {
        id: conv.id,
        employee_id: conv.employee_id,
        employee_name: conv.employee_name,
        employee_email: conv.employee_email,
        is_online: socketService.isUserOnline(conv.employee_id),
      },
      messages: formattedMessages,
    });
  } catch (err) {
    console.error('[Comm getAdminConversationMessages error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve messages.' });
  }
};

/**
 * POST /api/private-communication/admin/conversations/:id/messages
 * Send message or OTP from Admin to an Employee
 */
exports.sendAdminMessage = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const adminId = req.user.id;
    const conversationId = parseInt(req.params.id, 10);
    const { message_type, content, otp_value, otp_case_reference, otp_purpose, attachment_ids, reply_to_id } = req.body;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'Invalid conversation ID.' });
    }

    const [[conv]] = await connection.query(
      `SELECT c.id, c.employee_id, ca.has_access, u.is_active, u.name AS employee_name
       FROM private_conversations c
       JOIN users u ON u.id = c.employee_id
       LEFT JOIN employee_communication_access ca ON ca.employee_id = u.id
       WHERE c.id = ?`,
      [conversationId]
    );

    if (!conv || conv.has_access !== 1 || conv.is_active !== 1) {
      return res.status(403).json({
        success: false,
        message: 'Cannot send message: Employee does not have active communication access.',
      });
    }

    const type = message_type === 'otp' ? 'otp' : (message_type === 'attachment' ? 'attachment' : 'text');
    const retention = getRetentionConfig();

    let expiresAtSql;
    let expiresAtParam;

    if (type === 'otp') {
      if (!otp_value || !String(otp_value).trim()) {
        return res.status(400).json({ success: false, message: 'OTP value is required.' });
      }
      expiresAtSql = `DATE_ADD(NOW(), INTERVAL ? SECOND)`;
      expiresAtParam = Math.floor(retention.otpRetentionMs / 1000);
    } else {
      expiresAtSql = `DATE_ADD(NOW(), INTERVAL ? SECOND)`;
      expiresAtParam = Math.floor(retention.messageRetentionMs / 1000);
    }

    await connection.beginTransaction();

    const [msgRes] = await connection.query(
      `INSERT INTO private_messages
         (conversation_id, sender_id, sender_role, message_type, content, reply_to_id, otp_value, otp_case_reference, otp_purpose, expires_at)
       VALUES (?, ?, 'admin', ?, ?, ?, ?, ?, ?, ${expiresAtSql})`,
      [
        conversationId,
        adminId,
        type,
        content ? String(content).trim() : null,
        reply_to_id ? parseInt(reply_to_id, 10) : null,
        type === 'otp' ? String(otp_value).trim() : null,
        otp_case_reference ? String(otp_case_reference).trim() : null,
        otp_purpose ? String(otp_purpose).trim() : null,
        expiresAtParam,
      ]
    );

    const messageId = msgRes.insertId;

    if (Array.isArray(attachment_ids) && attachment_ids.length > 0) {
      await connection.query(
        `UPDATE private_message_attachments
         SET message_id = ?, expires_at = (SELECT expires_at FROM private_messages WHERE id = ?)
         WHERE id IN (?) AND (message_id IS NULL OR message_id = 0)`,
        [messageId, messageId, attachment_ids]
      );
    }

    await connection.query(
      `UPDATE private_conversations
       SET employee_unread_count = employee_unread_count + 1, last_message_at = NOW()
       WHERE id = ?`,
      [conversationId]
    );

    await connection.commit();

    // Fetch created message for broadcast
    const [[newMsg]] = await db.query(
      `SELECT m.*, u.name AS sender_name FROM private_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
      [messageId]
    );
    const attachmentsMap = await fetchAttachmentsForMessages([messageId]);

    const formatted = {
      id: newMsg.id,
      conversation_id: newMsg.conversation_id,
      sender_id: newMsg.sender_id,
      sender_role: 'admin',
      sender_name: newMsg.sender_name,
      message_type: newMsg.message_type,
      content: newMsg.content || '',
      otp_value: newMsg.otp_value,
      otp_case_reference: newMsg.otp_case_reference,
      otp_purpose: newMsg.otp_purpose,
      reply_to_id: newMsg.reply_to_id,
      is_pinned: false,
      is_edited: false,
      is_delivered: false,
      is_read: false,
      status: 'sent',
      created_at: newMsg.created_at,
      expires_at: newMsg.expires_at,
      attachments: attachmentsMap[messageId] || [],
      reactions: [],
    };

    // Real-time broadcast to conversation and recipient user room
    socketService.emit1on1Message(conversationId, formatted, conv.employee_id);

    // In-app notification for the employee
    if (notificationService) {
      notificationService.createNotification({
        type: type === 'otp' ? 'security' : 'message',
        title: type === 'otp' ? '🔐 Verification OTP from Admin' : '💬 New Message from Admin',
        message: type === 'otp' ? `OTP for case: ${otp_case_reference || 'Verification'}` : (content ? content.slice(0, 100) : 'Sent you an attachment'),
        senderId: adminId,
        senderRole: 'admin',
        recipientRole: 'employee',
        audienceType: 'individual',
        recipients: [conv.employee_id],
        priority: type === 'otp' ? 'urgent' : 'normal',
        actionUrl: '/employee/private-communication.html',
      }).catch(err => console.warn('[Notification error]:', err.message));
    }

    return res.status(201).json({
      success: true,
      message: 'Message sent successfully.',
      message_id: messageId,
      data: formatted,
    });
  } catch (err) {
    await connection.rollback();
    console.error('[Comm sendAdminMessage error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to send message.' });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/private-communication/admin/audit-logs
 * Retrieve access modification audit logs
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM communication_audit_logs`);

    const [logs] = await db.query(`
      SELECT
        l.id,
        l.admin_id,
        u_admin.name AS admin_name,
        u_admin.email AS admin_email,
        l.action_type,
        l.target_employee_id,
        u_emp.name AS target_employee_name,
        u_emp.email AS target_employee_email,
        l.details,
        l.ip_address,
        l.created_at
      FROM communication_audit_logs l
      JOIN users u_admin ON u_admin.id = l.admin_id
      LEFT JOIN users u_emp ON u_emp.id = l.target_employee_id
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    return res.json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[Comm getAuditLogs error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve audit logs.' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE MESSAGING ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/private-communication/employee/status
 * Check if current employee has access to Private Communication
 */
exports.getEmployeeStatus = async (req, res) => {
  try {
    const employeeId = req.user.id;
    const authorized = await isEmployeeAuthorized(employeeId);

    let unreadCount = 0;
    if (authorized) {
      const [[conv]] = await db.query(
        'SELECT employee_unread_count FROM private_conversations WHERE employee_id = ?',
        [employeeId]
      );
      unreadCount = conv?.employee_unread_count || 0;
    }

    return res.json({
      success: true,
      has_access: authorized,
      unread_count: unreadCount,
    });
  } catch (err) {
    console.error('[Comm getEmployeeStatus error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to check communication status.' });
  }
};

/**
 * GET /api/private-communication/employee/conversation
 * Retrieve unexpired messages for the authenticated employee
 */
exports.getEmployeeConversation = async (req, res) => {
  try {
    const employeeId = req.user.id;
    const authorized = await isEmployeeAuthorized(employeeId);

    if (!authorized) {
      return res.status(403).json({
        success: false,
        message: 'You do not currently have permission to access Private Communication. Please contact your administrator.',
      });
    }

    const conv = await getOrCreateConversation(employeeId);

    // Mark admin messages as read and delivered
    await db.query(
      `UPDATE private_messages
       SET is_read = 1, read_at = NOW(), is_delivered = 1, delivered_at = COALESCE(delivered_at, NOW())
       WHERE conversation_id = ? AND sender_role = 'admin' AND is_read = 0 AND expires_at > NOW()`,
      [conv.id]
    );
    await db.query(
      `UPDATE private_messages
       SET is_delivered = 1, delivered_at = COALESCE(delivered_at, NOW())
       WHERE conversation_id = ? AND sender_role = 'admin' AND is_delivered = 0 AND expires_at > NOW()`,
      [conv.id]
    );
    await db.query(
      `UPDATE private_conversations SET employee_unread_count = 0 WHERE id = ?`,
      [conv.id]
    );

    // Notify admin in real-time
    socketService.emit1on1MessageRead(conv.id, 'employee', employeeId);

    const [messages] = await db.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.sender_role, m.message_type,
              m.content, m.otp_value, m.otp_case_reference, m.otp_purpose,
              m.reply_to_id, m.is_pinned, m.is_edited, m.edited_at,
              m.is_delivered, m.delivered_at,
              m.is_read, m.read_at, m.expires_at, m.created_at,
              TIMESTAMPDIFF(SECOND, NOW(), m.expires_at) AS remaining_seconds,
              u.name AS sender_name,
              rm.content AS reply_content,
              ru.name AS reply_sender_name
       FROM private_messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN private_messages rm ON rm.id = m.reply_to_id
       LEFT JOIN users ru ON ru.id = rm.sender_id
       WHERE m.conversation_id = ? AND m.expires_at > NOW()
       ORDER BY m.created_at ASC`,
      [conv.id]
    );

    const messageIds = messages.map(m => m.id);
    const attachmentsMap = await fetchAttachmentsForMessages(messageIds);
    const reactionsMap = await fetchReactionsForMessages(messageIds, employeeId);

    const formattedMessages = messages.map(m => {
      const isMyMessage = m.sender_role === 'employee';
      let status = 'sent';
      if (isMyMessage) {
        if (m.is_read === 1) status = 'read';
        else if (m.is_delivered === 1) status = 'delivered';
      } else {
        status = m.is_delivered === 1 ? 'delivered' : 'sent';
      }
      return {
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        sender_role: m.sender_role,
        sender_name: m.sender_name,
        message_type: m.message_type,
        content: m.content || '',
        otp_value: m.otp_value,
        otp_case_reference: m.otp_case_reference,
        otp_purpose: m.otp_purpose,
        reply_to_id: m.reply_to_id,
        reply_preview: m.reply_to_id ? {
          id: m.reply_to_id,
          sender_name: m.reply_sender_name,
          content: m.reply_content,
        } : null,
        is_pinned: m.is_pinned === 1,
        is_edited: m.is_edited === 1,
        edited_at: m.edited_at,
        is_delivered: m.is_delivered === 1,
        delivered_at: m.delivered_at,
        is_read: m.is_read === 1,
        read_at: m.read_at,
        status,
        created_at: m.created_at,
        expires_at: m.expires_at,
        remaining_seconds: Math.max(0, m.remaining_seconds || 0),
        attachments: attachmentsMap[m.id] || [],
        reactions: reactionsMap[m.id] || [],
      };
    });

    return res.json({
      success: true,
      conversation: {
        id: conv.id,
        employee_id: employeeId,
      },
      messages: formattedMessages,
    });
  } catch (err) {
    console.error('[Comm getEmployeeConversation error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve conversation.' });
  }
};

/**
 * POST /api/private-communication/employee/messages
 * Send message from Employee to Admin
 */
exports.sendEmployeeMessage = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const employeeId = req.user.id;
    const authorized = await isEmployeeAuthorized(employeeId);

    if (!authorized) {
      return res.status(403).json({
        success: false,
        message: 'You do not currently have permission to send private messages. Please contact your administrator.',
      });
    }

    const { content, attachment_ids, reply_to_id } = req.body;
    if ((!content || !String(content).trim()) && (!Array.isArray(attachment_ids) || attachment_ids.length === 0)) {
      return res.status(400).json({ success: false, message: 'Message content or attachment is required.' });
    }

    const conv = await getOrCreateConversation(employeeId);
    const retention = getRetentionConfig();
    const type = Array.isArray(attachment_ids) && attachment_ids.length > 0 && (!content || !String(content).trim())
      ? 'attachment'
      : 'text';

    await connection.beginTransaction();

    const [msgRes] = await connection.query(
      `INSERT INTO private_messages
         (conversation_id, sender_id, sender_role, message_type, content, reply_to_id, expires_at)
       VALUES (?, ?, 'employee', ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [
        conv.id,
        employeeId,
        type,
        content ? String(content).trim() : null,
        reply_to_id ? parseInt(reply_to_id, 10) : null,
        Math.floor(retention.messageRetentionMs / 1000),
      ]
    );

    const messageId = msgRes.insertId;

    if (Array.isArray(attachment_ids) && attachment_ids.length > 0) {
      await connection.query(
        `UPDATE private_message_attachments
         SET message_id = ?, expires_at = (SELECT expires_at FROM private_messages WHERE id = ?)
         WHERE id IN (?) AND (message_id IS NULL OR message_id = 0)`,
        [messageId, messageId, attachment_ids]
      );
    }

    await connection.query(
      `UPDATE private_conversations
       SET admin_unread_count = admin_unread_count + 1, last_message_at = NOW()
       WHERE id = ?`,
      [conv.id]
    );

    await connection.commit();

    // Fetch created message
    const [[newMsg]] = await db.query(
      `SELECT m.*, u.name AS sender_name FROM private_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
      [messageId]
    );
    const attachmentsMap = await fetchAttachmentsForMessages([messageId]);

    const formatted = {
      id: newMsg.id,
      conversation_id: newMsg.conversation_id,
      sender_id: newMsg.sender_id,
      sender_role: 'employee',
      sender_name: newMsg.sender_name,
      message_type: newMsg.message_type,
      content: newMsg.content || '',
      reply_to_id: newMsg.reply_to_id,
      is_pinned: false,
      is_edited: false,
      is_delivered: false,
      is_read: false,
      status: 'sent',
      created_at: newMsg.created_at,
      expires_at: newMsg.expires_at,
      attachments: attachmentsMap[messageId] || [],
      reactions: [],
    };

    // Emit real-time event to conversation and to all active admins
    const [admins] = await db.query(`SELECT id FROM users WHERE role = 'admin' AND is_active = 1`);
    for (const a of admins) {
      socketService.emit1on1Message(conv.id, formatted, a.id);
    }

    // Topbar notification bell for Admins
    if (notificationService) {
      notificationService.createNotification({
        type: 'message',
        title: `💬 New Message from ${newMsg.sender_name}`,
        message: content ? content.slice(0, 100) : 'Sent an attachment',
        senderId: employeeId,
        senderRole: 'employee',
        recipientRole: 'admin',
        audienceType: 'all',
        priority: 'normal',
        actionUrl: '/admin/private-communication.html',
      }).catch(err => console.warn('[Notification error]:', err.message));
    }

    return res.status(201).json({
      success: true,
      message: 'Message sent successfully.',
      message_id: messageId,
      data: formatted,
    });
  } catch (err) {
    await connection.rollback();
    console.error('[Comm sendEmployeeMessage error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to send message.' });
  } finally {
    connection.release();
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// COMPANY GROUP CHAT CONTROLLERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/private-communication/group/messages
 * Retrieve unexpired Company Group messages
 */
exports.getGroupMessages = async (req, res) => {
  try {
    const user = req.user;
    if (user.role === 'employee') {
      const authorized = await isEmployeeAuthorized(user.id);
      if (!authorized) {
        return res.status(403).json({ success: false, message: 'Access denied to Company Group.' });
      }
    }

    const groupId = await getCompanyGroupId();

    const [messages] = await db.query(
      `SELECT m.id, m.group_id, m.sender_id, m.sender_role, m.message_type,
              m.content, m.reply_to_id, m.is_pinned, m.pinned_by, m.pinned_at,
              m.is_edited, m.edited_at, m.expires_at, m.created_at,
              TIMESTAMPDIFF(SECOND, NOW(), m.expires_at) AS remaining_seconds,
              u.name AS sender_name,
              pu.name AS pinned_by_name,
              rm.content AS reply_content,
              ru.name AS reply_sender_name
       FROM private_messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN users pu ON pu.id = m.pinned_by
       LEFT JOIN private_messages rm ON rm.id = m.reply_to_id
       LEFT JOIN users ru ON ru.id = rm.sender_id
       WHERE m.group_id = ? AND m.expires_at > NOW()
       ORDER BY m.created_at ASC`,
      [groupId]
    );

    const messageIds = messages.map(m => m.id);
    const attachmentsMap = await fetchAttachmentsForMessages(messageIds);
    const reactionsMap = await fetchReactionsForMessages(messageIds, user.id);

    // Fetch read count per message in group
    let readCountMap = {};
    if (messageIds.length > 0) {
      const [reads] = await db.query(
        `SELECT message_id, COUNT(*) AS read_count
         FROM communication_group_reads
         WHERE message_id IN (?) AND is_read = 1
         GROUP BY message_id`,
        [messageIds]
      );
      for (const r of reads) {
        readCountMap[r.message_id] = r.read_count;
      }
    }

    // Auto-mark unread messages as read for this user
    if (messageIds.length > 0) {
      for (const mid of messageIds) {
        await db.query(`
          INSERT INTO communication_group_reads (message_id, user_id, is_delivered, is_read, read_at)
          VALUES (?, ?, 1, 1, NOW())
          ON DUPLICATE KEY UPDATE is_read = 1, read_at = COALESCE(read_at, NOW()), is_delivered = 1
        `, [mid, user.id]).catch(() => {});
      }
    }

    const formatted = messages.map(m => ({
      id: m.id,
      group_id: m.group_id,
      sender_id: m.sender_id,
      sender_role: m.sender_role,
      sender_name: m.sender_name,
      message_type: m.message_type,
      content: m.content || '',
      reply_to_id: m.reply_to_id,
      reply_preview: m.reply_to_id ? {
        id: m.reply_to_id,
        sender_name: m.reply_sender_name,
        content: m.reply_content,
      } : null,
      is_pinned: m.is_pinned === 1,
      pinned_by_name: m.pinned_by_name,
      pinned_at: m.pinned_at,
      is_edited: m.is_edited === 1,
      edited_at: m.edited_at,
      created_at: m.created_at,
      expires_at: m.expires_at,
      remaining_seconds: Math.max(0, m.remaining_seconds || 0),
      read_count: readCountMap[m.id] || 0,
      attachments: attachmentsMap[m.id] || [],
      reactions: reactionsMap[m.id] || [],
    }));

    return res.json({
      success: true,
      messages: formatted,
    });
  } catch (err) {
    console.error('[Comm getGroupMessages error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve group messages.' });
  }
};

/**
 * POST /api/private-communication/group/messages
 * Send message to Company Group
 */
exports.sendGroupMessage = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const user = req.user;
    if (user.role === 'employee') {
      const authorized = await isEmployeeAuthorized(user.id);
      if (!authorized) {
        return res.status(403).json({ success: false, message: 'You do not currently have access to Company Group.' });
      }
    }

    const { content, attachment_ids, reply_to_id } = req.body;
    if ((!content || !String(content).trim()) && (!Array.isArray(attachment_ids) || attachment_ids.length === 0)) {
      return res.status(400).json({ success: false, message: 'Message content or attachment is required.' });
    }

    const groupId = await getCompanyGroupId();
    const retention = getRetentionConfig();
    const type = Array.isArray(attachment_ids) && attachment_ids.length > 0 && (!content || !String(content).trim())
      ? 'attachment'
      : 'text';

    await connection.beginTransaction();

    const [msgRes] = await connection.query(
      `INSERT INTO private_messages
         (group_id, sender_id, sender_role, message_type, content, reply_to_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [
        groupId,
        user.id,
        user.role,
        type,
        content ? String(content).trim() : null,
        reply_to_id ? parseInt(reply_to_id, 10) : null,
        Math.floor(retention.messageRetentionMs / 1000), // 24 hours strict
      ]
    );

    const messageId = msgRes.insertId;

    if (Array.isArray(attachment_ids) && attachment_ids.length > 0) {
      await connection.query(
        `UPDATE private_message_attachments
         SET message_id = ?, expires_at = (SELECT expires_at FROM private_messages WHERE id = ?)
         WHERE id IN (?) AND (message_id IS NULL OR message_id = 0)`,
        [messageId, messageId, attachment_ids]
      );
    }

    // Sender automatically reads their own message
    await connection.query(`
      INSERT INTO communication_group_reads (message_id, user_id, is_delivered, is_read, read_at)
      VALUES (?, ?, 1, 1, NOW())
    `, [messageId, user.id]);

    await connection.commit();

    // Fetch full message details for broadcasting
    const [[newMsg]] = await db.query(
      `SELECT m.*, u.name AS sender_name,
              rm.content AS reply_content, ru.name AS reply_sender_name
       FROM private_messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN private_messages rm ON rm.id = m.reply_to_id
       LEFT JOIN users ru ON ru.id = rm.sender_id
       WHERE m.id = ?`,
      [messageId]
    );
    const attachmentsMap = await fetchAttachmentsForMessages([messageId]);

    const formatted = {
      id: newMsg.id,
      group_id: newMsg.group_id,
      sender_id: newMsg.sender_id,
      sender_role: newMsg.sender_role,
      sender_name: newMsg.sender_name,
      message_type: newMsg.message_type,
      content: newMsg.content || '',
      reply_to_id: newMsg.reply_to_id,
      reply_preview: newMsg.reply_to_id ? {
        id: newMsg.reply_to_id,
        sender_name: newMsg.reply_sender_name,
        content: newMsg.reply_content,
      } : null,
      is_pinned: false,
      pinned_by_name: null,
      pinned_at: null,
      is_edited: false,
      edited_at: null,
      created_at: newMsg.created_at,
      expires_at: newMsg.expires_at,
      read_count: 1,
      attachments: attachmentsMap[messageId] || [],
      reactions: [],
    };

    // Real-time broadcast to all Company Group members
    socketService.emitGroupMessage(formatted);

    // Check for @mentions in text
    if (content && notificationService) {
      const mentionMatches = content.match(/@([a-zA-Z0-9._]+)/g) || [];
      const mentionedTokens = mentionMatches.map(m => m.slice(1).toLowerCase());

      if (mentionedTokens.length > 0) {
        const [activeUsers] = await db.query(`
          SELECT id, name, role FROM users
          WHERE is_active = 1 AND id != ?
        `, [user.id]);

        for (const u of activeUsers) {
          const uFirstName = u.name.split(' ')[0].toLowerCase();
          const uFullName = u.name.toLowerCase().replace(/\s+/g, '');
          if (mentionedTokens.includes(uFirstName) || mentionedTokens.includes(uFullName) || (u.role === 'admin' && mentionedTokens.includes('admin')) || mentionedTokens.includes('all')) {
            notificationService.createNotification({
              type: 'mention',
              title: `📢 ${user.name} mentioned you in Company Group`,
              message: content.length > 100 ? content.slice(0, 97) + '...' : content,
              senderId: user.id,
              senderRole: user.role,
              recipientRole: u.role,
              audienceType: 'individual',
              recipients: [u.id],
              priority: 'normal',
              actionUrl: u.role === 'admin' ? '/admin/private-communication.html' : '/employee/private-communication.html',
            }).catch(() => {});
          }
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Group message sent.',
      data: formatted,
    });
  } catch (err) {
    await connection.rollback();
    console.error('[Comm sendGroupMessage error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to send group message.' });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/private-communication/messages/:id/react
 * Toggle emoji reaction on a group or individual message
 */
exports.toggleMessageReaction = async (req, res) => {
  try {
    const user = req.user;
    const messageId = parseInt(req.params.id, 10);
    const { emoji } = req.body;

    if (!messageId || !emoji || !String(emoji).trim()) {
      return res.status(400).json({ success: false, message: 'Message ID and emoji are required.' });
    }

    const [[msg]] = await db.query(
      `SELECT id, group_id, conversation_id, expires_at FROM private_messages WHERE id = ?`,
      [messageId]
    );

    if (!msg || new Date(msg.expires_at) <= new Date()) {
      return res.status(404).json({ success: false, message: 'Message not found or expired.' });
    }

    // Check if user already reacted with this exact emoji
    const [[existing]] = await db.query(
      `SELECT id, emoji FROM communication_message_reactions WHERE message_id = ? AND user_id = ?`,
      [messageId, user.id]
    );

    if (existing && existing.emoji === emoji) {
      // Toggle off
      await db.query(`DELETE FROM communication_message_reactions WHERE id = ?`, [existing.id]);
    } else if (existing) {
      // Switch emoji
      await db.query(`UPDATE communication_message_reactions SET emoji = ? WHERE id = ?`, [emoji, existing.id]);
    } else {
      // Add reaction
      await db.query(`INSERT INTO communication_message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)`, [messageId, user.id, emoji]);
    }

    // Retrieve updated reactions
    const reactionsMap = await fetchReactionsForMessages([messageId], user.id);
    const updatedReactions = reactionsMap[messageId] || [];

    socketService.emitMessageReaction({
      messageId,
      groupId: msg.group_id,
      conversationId: msg.conversation_id,
      reactions: updatedReactions,
    });

    return res.json({
      success: true,
      reactions: updatedReactions,
    });
  } catch (err) {
    console.error('[Comm toggleMessageReaction error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to update reaction.' });
  }
};

/**
 * POST /api/private-communication/group/messages/:id/pin
 * Toggle pinned status for a group message
 */
exports.toggleGroupPin = async (req, res) => {
  try {
    const user = req.user;
    const messageId = parseInt(req.params.id, 10);

    const [[msg]] = await db.query(
      `SELECT id, group_id, is_pinned, expires_at FROM private_messages WHERE id = ? AND group_id IS NOT NULL`,
      [messageId]
    );

    if (!msg || new Date(msg.expires_at) <= new Date()) {
      return res.status(404).json({ success: false, message: 'Group message not found or expired.' });
    }

    const newPinned = msg.is_pinned === 1 ? 0 : 1;
    await db.query(`
      UPDATE private_messages
      SET is_pinned = ?, pinned_by = ?, pinned_at = ?
      WHERE id = ?
    `, [newPinned, newPinned ? user.id : null, newPinned ? new Date() : null, messageId]);

    socketService.emitGroupPin({
      messageId,
      isPinned: newPinned === 1,
      pinnedByName: newPinned ? user.name : null,
      pinnedAt: newPinned ? new Date().toISOString() : null,
    });

    return res.json({
      success: true,
      is_pinned: newPinned === 1,
      message: newPinned ? 'Message pinned to group header.' : 'Message unpinned.',
    });
  } catch (err) {
    console.error('[Comm toggleGroupPin error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to pin/unpin message.' });
  }
};

/**
 * GET /api/private-communication/group/info
 * Get group metadata, total members, and member list with online status
 */
exports.getGroupInfo = async (req, res) => {
  try {
    const groupId = await getCompanyGroupId();
    const [[group]] = await db.query(`SELECT id, name, description, created_at FROM communication_groups WHERE id = ?`, [groupId]);

    // Active Admins
    const [admins] = await db.query(`
      SELECT id, name, email, role, is_active, last_active_at
      FROM users WHERE role = 'admin' AND is_active = 1
      ORDER BY name ASC
    `);

    // Authorized Active Employees
    const [employees] = await db.query(`
      SELECT u.id, u.name, u.email, u.role, u.is_active, u.last_active_at
      FROM users u
      JOIN employee_communication_access ca ON ca.employee_id = u.id AND ca.has_access = 1
      WHERE u.role = 'employee' AND u.is_active = 1
      ORDER BY u.name ASC
    `);

    const allMembers = [...admins, ...employees].map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      is_active: m.is_active === 1,
      is_online: socketService.isUserOnline(m.id),
      last_active_at: m.last_active_at,
    }));

    return res.json({
      success: true,
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        total_members: allMembers.length,
        online_members: allMembers.filter(m => m.is_online).length,
      },
      members: allMembers,
    });
  } catch (err) {
    console.error('[Comm getGroupInfo error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve group information.' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ANNOUNCEMENTS CONTROLLERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/private-communication/admin/announcements
 * Create an official Admin Announcement
 */
exports.createAdminAnnouncement = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const adminId = req.user.id;
    const { title, content, priority, target_type, selected_employee_ids } = req.body;

    if (!title || !String(title).trim() || !content || !String(content).trim()) {
      return res.status(400).json({ success: false, message: 'Title and content are required.' });
    }

    const prio = ['Normal', 'Important', 'Urgent'].includes(priority) ? priority : 'Normal';
    const target = target_type === 'selected' ? 'selected' : 'all';

    // 24 hours retention
    const retention = getRetentionConfig();
    const expirySeconds = Math.floor(retention.messageRetentionMs / 1000);

    await connection.beginTransaction();

    const [annoRes] = await connection.query(`
      INSERT INTO communication_announcements (title, content, priority, target_type, sender_id, expires_at)
      VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
    `, [title.trim(), content.trim(), prio, target, adminId, expirySeconds]);

    const announcementId = annoRes.insertId;

    // Resolve target employee IDs
    let targetEmpIds = [];
    if (target === 'all') {
      const [emps] = await connection.query(`
        SELECT u.id FROM users u
        WHERE u.role = 'employee' AND u.is_active = 1
      `);
      targetEmpIds = emps.map(e => e.id);
    } else if (Array.isArray(selected_employee_ids) && selected_employee_ids.length > 0) {
      const [emps] = await connection.query(`
        SELECT u.id FROM users u
        WHERE u.role = 'employee' AND u.is_active = 1 AND u.id IN (?)
      `, [selected_employee_ids]);
      targetEmpIds = emps.map(e => e.id);
    }

    for (const eid of targetEmpIds) {
      await connection.query(`
        INSERT INTO communication_announcement_recipients (announcement_id, employee_id, is_delivered)
        VALUES (?, ?, 1)
      `, [announcementId, eid]);
    }

    await connection.commit();

    // Fetch created announcement
    const [[createdAnno]] = await db.query(`
      SELECT a.*, u.name AS sender_name
      FROM communication_announcements a
      JOIN users u ON u.id = a.sender_id
      WHERE a.id = ?
    `, [announcementId]);

    const payload = {
      id: createdAnno.id,
      title: createdAnno.title,
      content: createdAnno.content,
      priority: createdAnno.priority,
      target_type: createdAnno.target_type,
      sender_name: createdAnno.sender_name,
      total_recipients: targetEmpIds.length,
      created_at: createdAnno.created_at,
      expires_at: createdAnno.expires_at,
    };

    // Real-time broadcast
    socketService.emitAnnouncement(payload, targetEmpIds);

    // Create Notification Bell alerts for Important or Urgent announcements
    if (notificationService && (prio === 'Urgent' || prio === 'Important')) {
      notificationService.createNotification({
        type: 'announcement',
        title: `📢 ${prio.toUpperCase()} Announcement: ${title.trim()}`,
        message: content.trim().slice(0, 120),
        senderId: adminId,
        senderRole: 'admin',
        recipientRole: 'employee',
        audienceType: target === 'all' ? 'all' : 'selected',
        recipients: targetEmpIds,
        priority: prio.toLowerCase(),
        actionUrl: '/employee/private-communication.html',
      }).catch(err => console.warn('[Announcement notification error]:', err.message));
    }

    return res.status(201).json({
      success: true,
      message: 'Announcement posted successfully.',
      announcement: payload,
    });
  } catch (err) {
    await connection.rollback();
    console.error('[Comm createAdminAnnouncement error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to create announcement.' });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/private-communication/announcements
 * Retrieve unexpired announcements
 */
exports.getAnnouncements = async (req, res) => {
  try {
    const user = req.user;

    if (user.role === 'admin') {
      const [annos] = await db.query(`
        SELECT
          a.id, a.title, a.content, a.priority, a.target_type, a.created_at, a.expires_at,
          TIMESTAMPDIFF(SECOND, NOW(), a.expires_at) AS remaining_seconds,
          u.name AS sender_name,
          COUNT(r.id) AS total_recipients,
          SUM(CASE WHEN r.is_read = 1 THEN 1 ELSE 0 END) AS read_count
        FROM communication_announcements a
        JOIN users u ON u.id = a.sender_id
        LEFT JOIN communication_announcement_recipients r ON r.announcement_id = a.id
        WHERE a.expires_at > NOW()
        GROUP BY a.id
        ORDER BY a.created_at DESC
      `);

      return res.json({
        success: true,
        announcements: annos.map(a => ({
          ...a,
          read_count: Number(a.read_count || 0),
          total_recipients: Number(a.total_recipients || 0),
          remaining_seconds: Math.max(0, a.remaining_seconds || 0),
        })),
      });
    } else if (user.role === 'employee') {
      const [annos] = await db.query(`
        SELECT
          a.id, a.title, a.content, a.priority, a.target_type, a.created_at, a.expires_at,
          TIMESTAMPDIFF(SECOND, NOW(), a.expires_at) AS remaining_seconds,
          u.name AS sender_name,
          COALESCE(r.is_read, 0) AS is_read,
          r.read_at
        FROM communication_announcements a
        JOIN users u ON u.id = a.sender_id
        JOIN communication_announcement_recipients r ON r.announcement_id = a.id AND r.employee_id = ?
        WHERE a.expires_at > NOW()
        ORDER BY (a.priority = 'Urgent') DESC, (a.priority = 'Important') DESC, a.created_at DESC
      `, [user.id]);

      return res.json({
        success: true,
        announcements: annos.map(a => ({
          ...a,
          is_read: a.is_read === 1,
          remaining_seconds: Math.max(0, a.remaining_seconds || 0),
        })),
      });
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized role.' });
    }
  } catch (err) {
    console.error('[Comm getAnnouncements error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve announcements.' });
  }
};

/**
 * POST /api/private-communication/announcements/:id/read
 * Mark announcement as read by employee
 */
exports.acknowledgeAnnouncementRead = async (req, res) => {
  try {
    const user = req.user;
    const annoId = parseInt(req.params.id, 10);

    if (user.role !== 'employee') {
      return res.status(403).json({ success: false, message: 'Only employees acknowledge announcement reads.' });
    }

    await db.query(`
      UPDATE communication_announcement_recipients
      SET is_read = 1, read_at = NOW()
      WHERE announcement_id = ? AND employee_id = ?
    `, [annoId, user.id]);

    return res.json({ success: true, message: 'Announcement marked as read.' });
  } catch (err) {
    console.error('[Comm acknowledgeAnnouncementRead error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to acknowledge announcement read.' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// SEARCH CONTROLLER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/private-communication/search
 * Search across unexpired messages respecting 24-hour retention
 */
exports.searchMessages = async (req, res) => {
  try {
    const user = req.user;
    const query = String(req.query.q || '').trim();
    const channel = req.query.channel; // 'group' or 'conversation'
    const conversationId = parseInt(req.query.conversation_id, 10);

    if (!query) {
      return res.json({ success: true, results: [] });
    }

    const likeQuery = `%${query}%`;
    let sql = `
      SELECT m.id, m.group_id, m.conversation_id, m.sender_id, m.sender_role,
             m.message_type, m.content, m.created_at, m.expires_at,
             u.name AS sender_name
      FROM private_messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN private_message_attachments a ON a.message_id = m.id
      WHERE m.expires_at > NOW()
        AND (m.content LIKE ? OR a.original_name LIKE ?)
    `;
    const params = [likeQuery, likeQuery];

    if (channel === 'group') {
      const groupId = await getCompanyGroupId();
      sql += ` AND m.group_id = ?`;
      params.push(groupId);
    } else if (channel === 'conversation' && conversationId) {
      if (user.role === 'employee') {
        const conv = await getOrCreateConversation(user.id);
        sql += ` AND m.conversation_id = ?`;
        params.push(conv.id);
      } else {
        sql += ` AND m.conversation_id = ?`;
        params.push(conversationId);
      }
    } else if (user.role === 'employee') {
      const conv = await getOrCreateConversation(user.id);
      const groupId = await getCompanyGroupId();
      sql += ` AND (m.conversation_id = ? OR m.group_id = ?)`;
      params.push(conv.id, groupId);
    }

    sql += ` GROUP BY m.id ORDER BY m.created_at DESC LIMIT 30`;

    const [results] = await db.query(sql, params);
    return res.json({ success: true, results });
  } catch (err) {
    console.error('[Comm searchMessages error]:', err);
    return res.status(500).json({ success: false, message: 'Search failed.' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// ATTACHMENT UPLOAD & VIEW CONTROLLERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/private-communication/upload
 * Stage file attachments for subsequent message linking
 */
exports.handleAttachmentUpload = async (req, res) => {
  try {
    const user = req.user;
    if (user.role === 'employee') {
      const authorized = await isEmployeeAuthorized(user.id);
      if (!authorized) {
        return res.status(403).json({ success: false, message: 'You do not have access to Private Communication.' });
      }
    }

    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files were uploaded.' });
    }

    const retention = getRetentionConfig();
    const expirySeconds = Math.floor(retention.messageRetentionMs / 1000); // 24 hours
    const stagedAttachments = [];

    for (const f of files) {
      const ext = path.extname(f.originalname).toLowerCase();
      const mime = f.mimetype;
      const size = f.size;

      // Validate MIME against extension
      const expectedMimes = ALLOWED_MIME_BY_EXT[ext] || [];
      if (!expectedMimes.includes(mime)) {
        if (!useR2 && f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
        return res.status(400).json({
          success: false,
          message: `MIME type mismatch for "${f.originalname}". Detected ${mime}, expected ${expectedMimes.join('/')}.`,
        });
      }

      // Validate Magic Bytes for local storage
      if (!useR2 && f.path) {
        const isValidSignature = verifyMagicBytes(f.path, ext);
        if (!isValidSignature) {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
          return res.status(400).json({
            success: false,
            message: `File "${f.originalname}" has invalid content headers. Upload rejected.`,
          });
        }
      }

      const storageKey = useR2 ? f.key : f.filename;
      const filePath = useR2 ? f.location || f.key : path.relative(path.join(__dirname, '..'), f.path);

      const [insertRes] = await db.query(
        `INSERT INTO private_message_attachments
           (message_id, original_name, storage_key, file_path, mime_type, file_size, expires_at)
         VALUES (NULL, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
        [f.originalname, storageKey, filePath, mime, size, expirySeconds]
      );

      stagedAttachments.push({
        id: insertRes.insertId,
        name: f.originalname,
        size,
        mime_type: mime,
        view_url: `/api/private-communication/attachments/${insertRes.insertId}/view`,
        download_url: `/api/private-communication/attachments/${insertRes.insertId}/download`,
      });
    }

    return res.status(201).json({
      success: true,
      message: `${files.length} attachment(s) uploaded successfully.`,
      attachments: stagedAttachments,
    });
  } catch (err) {
    console.error('[Comm handleAttachmentUpload error]:', err);
    return res.status(500).json({ success: false, message: 'Attachment upload failed.' });
  }
};

/**
 * GET /api/private-communication/attachments/:id/view
 * GET /api/private-communication/attachments/:id/download
 * Secure streaming of private attachments with strict 24-hour enforcement
 */
exports.viewOrDownloadAttachment = async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.id, 10);
    const isDownload = req.path.endsWith('/download');

    if (!attachmentId) {
      return res.status(400).json({ success: false, message: 'Invalid attachment ID.' });
    }

    // 1. Fetch attachment and verify message expiry
    const [[att]] = await db.query(
      `SELECT a.id, a.message_id, a.original_name, a.storage_key, a.file_path, a.mime_type,
              a.file_size, a.expires_at, m.conversation_id, m.group_id, c.employee_id
       FROM private_message_attachments a
       LEFT JOIN private_messages m ON m.id = a.message_id
       LEFT JOIN private_conversations c ON c.id = m.conversation_id
       WHERE a.id = ?`,
      [attachmentId]
    );

    if (!att) {
      return res.status(404).json({ success: false, message: 'Attachment not found.' });
    }

    // 2. Reject expired attachments immediately at API layer
    const now = new Date();
    if (new Date(att.expires_at) <= now) {
      return res.status(410).json({
        success: false,
        message: 'This attachment has expired and is no longer available.',
      });
    }

    // 3. Authorization check
    const user = req.user;
    if (user.role === 'admin') {
      // Admin is authorized
    } else if (user.role === 'employee') {
      const authorized = await isEmployeeAuthorized(user.id);
      if (!authorized) {
        return res.status(403).json({ success: false, message: 'Your communication access has been revoked.' });
      }

      // If it's a group attachment -> authorized
      // If it's a 1-on-1 attachment -> must belong to this employee
      if (att.group_id) {
        // Authorized for group members
      } else if (att.employee_id && att.employee_id !== user.id) {
        return res.status(403).json({ success: false, message: 'Access denied to this attachment.' });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized role.' });
    }

    // 4. Stream file from private storage
    const sanitizedFilename = att.original_name.replace(/["\r\n]/g, '_');
    const dispositionType = isDownload ? 'attachment' : 'inline';

    res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${dispositionType}; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(att.original_name)}`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (useR2) {
      const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_KEY,
        },
      });
      const cmd = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: att.storage_key,
      });
      const obj = await s3.send(cmd);
      return obj.Body.pipe(res);
    }

    // Local Disk
    const fullPath = path.isAbsolute(att.file_path) ? att.file_path : path.join(__dirname, '..', att.file_path);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'Attachment file is missing from storage.' });
    }

    const stream = fs.createReadStream(fullPath);
    stream.on('error', (streamErr) => {
      console.error('[Stream error]:', streamErr.message);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'File read error.' });
    });
    stream.pipe(res);
  } catch (err) {
    console.error('[Comm viewOrDownloadAttachment error]:', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Failed to access attachment.' });
    }
  }
};

/**
 * POST /api/private-communication/delivery-ack
 * Mark incoming messages as delivered to the authenticated recipient
 */
exports.acknowledgeDelivery = async (req, res) => {
  try {
    const user = req.user;
    const { message_ids, conversation_id } = req.body || {};

    if (user.role === 'admin') {
      let sql = `UPDATE private_messages
                 SET is_delivered = 1, delivered_at = COALESCE(delivered_at, NOW())
                 WHERE sender_role = 'employee' AND is_delivered = 0 AND expires_at > NOW()`;
      const params = [];

      if (Array.isArray(message_ids) && message_ids.length > 0) {
        sql += ` AND id IN (?)`;
        params.push(message_ids);
      } else if (conversation_id) {
        sql += ` AND conversation_id = ?`;
        params.push(conversation_id);
      }

      const [result] = await db.query(sql, params);
      return res.json({ success: true, message: 'Delivery acknowledged.', affected: result.affectedRows });
    } else if (user.role === 'employee') {
      const authorized = await isEmployeeAuthorized(user.id);
      if (!authorized) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      const conv = await getOrCreateConversation(user.id);
      let sql = `UPDATE private_messages
                 SET is_delivered = 1, delivered_at = COALESCE(delivered_at, NOW())
                 WHERE conversation_id = ? AND sender_role = 'admin' AND is_delivered = 0 AND expires_at > NOW()`;
      const params = [conv.id];

      if (Array.isArray(message_ids) && message_ids.length > 0) {
        sql += ` AND id IN (?)`;
        params.push(message_ids);
      }

      const [result] = await db.query(sql, params);
      return res.json({ success: true, message: 'Delivery acknowledged.', affected: result.affectedRows });
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized role.' });
    }
  } catch (err) {
    console.error('[Comm acknowledgeDelivery error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to acknowledge delivery.' });
  }
};
