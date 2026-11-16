const path = require('path');
const fs = require('fs');
const db = require('../config/db');

// ── Storage Configuration ──────────────────────────────────────────────────
const useR2 = process.env.NODE_ENV === 'production' &&
              process.env.R2_ACCOUNT_ID &&
              process.env.R2_ACCESS_KEY_ID &&
              process.env.R2_SECRET_KEY &&
              process.env.R2_BUCKET_NAME;

let r2Client;
if (useR2) {
  const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_KEY,
    },
  });
}

// Private directory on disk (NEVER served statically)
const privateStorageDir = path.join(__dirname, '..', 'uploads', 'private_communication');
if (!useR2 && !fs.existsSync(privateStorageDir)) {
  fs.mkdirSync(privateStorageDir, { recursive: true });
}

/**
 * Returns current authoritative retention configuration in milliseconds
 */
function getRetentionConfig() {
  const msgHours = parseFloat(process.env.COMM_MESSAGE_RETENTION_HOURS || '24');
  const otpMins = parseFloat(process.env.COMM_OTP_RETENTION_MINUTES || '15');

  return {
    messageRetentionMs: Math.max(1000, msgHours * 60 * 60 * 1000),
    otpRetentionMs: Math.max(1000, otpMins * 60 * 1000),
    messageRetentionHours: msgHours,
    otpRetentionMinutes: otpMins,
  };
}

/**
 * Physically removes an attachment from storage (Disk or R2)
 */
async function deleteStoredFile(storageKey, filePath) {
  if (useR2) {
    try {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      await r2Client.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: storageKey,
      }));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Process expired messages and attachments:
 * 1. Find all messages with expires_at <= NOW()
 * 2. Physically remove attached files from storage
 * 3. Log any deletion failures into cleanup retry queue
 * 4. Permanently delete message & attachment DB records
 * 5. Recalculate conversation unread counters
 */
async function processExpiredMessages() {
  try {
    // 1. Fetch expired messages with any attachments
    const [expiredMessages] = await db.query(
      `SELECT m.id, m.conversation_id, m.message_type
       FROM private_messages m
       WHERE m.expires_at <= NOW()`
    );

    if (expiredMessages.length === 0) {
      // Nothing expired, but still run retry queue for previously failed deletions
      await retryFailedDeletions();
      return { processedCount: 0, attachmentsDeleted: 0 };
    }

    const expiredMessageIds = expiredMessages.map(m => m.id);

    // 2. Fetch attachments belonging to expired messages
    const [attachments] = await db.query(
      `SELECT id, message_id, storage_key, file_path
       FROM private_message_attachments
       WHERE message_id IN (?)`,
      [expiredMessageIds]
    );

    let deletedFiles = 0;
    for (const att of attachments) {
      const result = await deleteStoredFile(att.storage_key, att.file_path);
      if (!result.success) {
        // Enqueue into retry queue
        console.warn(`[Cleanup] Storage deletion failed for attachment #${att.id}, queuing retry: ${result.error}`);
        await db.query(
          `INSERT INTO communication_cleanup_retries (file_path, storage_key, last_error)
           VALUES (?, ?, ?)`,
          [att.file_path, att.storage_key, result.error]
        ).catch(() => {});
      } else {
        deletedFiles++;
      }
    }

    // 3. Delete expired messages from database (cascade deletes attachments)
    await db.query(
      `DELETE FROM private_messages WHERE id IN (?)`,
      [expiredMessageIds]
    );

    // 4. Recalculate unread counts and update conversation stats
    const conversationIds = [...new Set(expiredMessages.map(m => m.conversation_id).filter(Boolean))];
    for (const convId of conversationIds) {
      // Count remaining unread for admin
      const [[adminUnread]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM private_messages
         WHERE conversation_id = ? AND sender_role = 'employee' AND is_read = 0 AND expires_at > NOW()`,
        [convId]
      );

      // Count remaining unread for employee
      const [[empUnread]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM private_messages
         WHERE conversation_id = ? AND sender_role = 'admin' AND is_read = 0 AND expires_at > NOW()`,
        [convId]
      );

      // Get latest remaining unexpired message time
      const [[latestMsg]] = await db.query(
        `SELECT MAX(created_at) AS last_msg FROM private_messages
         WHERE conversation_id = ? AND expires_at > NOW()`,
        [convId]
      );

      await db.query(
        `UPDATE private_conversations
         SET admin_unread_count = ?, employee_unread_count = ?, last_message_at = ?
         WHERE id = ?`,
        [adminUnread.cnt || 0, empUnread.cnt || 0, latestMsg.last_msg || null, convId]
      );
    }

    // 4b. Purge expired announcements (24h retention)
    await db.query('DELETE FROM communication_announcements WHERE expires_at <= NOW()').catch(() => {});

    // 5. Run retry queue for any previous failed deletions
    await retryFailedDeletions();

    return {
      processedCount: expiredMessages.length,
      attachmentsDeleted: deletedFiles,
    };
  } catch (err) {
    console.error('[PrivateCommunication Cleanup error]:', err.message);
    return { error: err.message };
  }
}

/**
 * Retries failed physical file deletions from the retry queue
 */
async function retryFailedDeletions() {
  try {
    const [retries] = await db.query(
      `SELECT id, file_path, storage_key, retry_count
       FROM communication_cleanup_retries
       WHERE retry_count < 5
       LIMIT 20`
    );

    for (const r of retries) {
      const result = await deleteStoredFile(r.storage_key, r.file_path);
      if (result.success) {
        await db.query(`DELETE FROM communication_cleanup_retries WHERE id = ?`, [r.id]);
        console.log(`[Cleanup Retry] Successfully deleted retry file #${r.id} (${r.storage_key})`);
      } else {
        await db.query(
          `UPDATE communication_cleanup_retries
           SET retry_count = retry_count + 1, last_error = ?
           WHERE id = ?`,
          [result.error, r.id]
        );
      }
    }
  } catch (err) {
    // Non-fatal, suppress error logging loop
  }
}

module.exports = {
  useR2,
  privateStorageDir,
  getRetentionConfig,
  deleteStoredFile,
  processExpiredMessages,
  retryFailedDeletions,
};
