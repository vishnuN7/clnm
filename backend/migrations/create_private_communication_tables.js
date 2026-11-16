require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../config/db');

async function migrate() {
  console.log('Starting Private Communication module migration...');
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. employee_communication_access (Admin-controlled employee permission)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS employee_communication_access (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL UNIQUE,
        has_access TINYINT(1) DEFAULT 0 NOT NULL,
        updated_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_comm_emp (employee_id),
        INDEX idx_comm_access (has_access),
        CONSTRAINT fk_eca_employee FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. private_conversations (1-to-1 between Admin and each Employee)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS private_conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL UNIQUE,
        admin_unread_count INT DEFAULT 0,
        employee_unread_count INT DEFAULT 0,
        last_message_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_pconv_emp (employee_id),
        INDEX idx_pconv_last_msg (last_message_at),
        CONSTRAINT fk_pconv_employee FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. private_messages (Temporary messages: text, attachment, or otp)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS private_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        sender_id INT NOT NULL,
        sender_role ENUM('admin', 'employee') NOT NULL,
        message_type ENUM('text', 'attachment', 'otp') DEFAULT 'text' NOT NULL,
        content TEXT NULL,
        otp_value VARCHAR(50) NULL,
        otp_case_reference VARCHAR(100) NULL,
        otp_purpose VARCHAR(255) NULL,
        is_delivered TINYINT(1) DEFAULT 0,
        delivered_at DATETIME NULL,
        is_read TINYINT(1) DEFAULT 0,
        read_at DATETIME NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pmsg_conv (conversation_id),
        INDEX idx_pmsg_expires (expires_at),
        INDEX idx_pmsg_type (message_type),
        INDEX idx_pmsg_delivered (is_delivered),
        INDEX idx_pmsg_created (created_at),
        CONSTRAINT fk_pmsg_conv FOREIGN KEY (conversation_id) REFERENCES private_conversations(id) ON DELETE CASCADE,
        CONSTRAINT fk_pmsg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. private_message_attachments (Multiple attachments per message)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS private_message_attachments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id INT NULL DEFAULT NULL,
        original_name VARCHAR(255) NOT NULL,
        storage_key VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size BIGINT NOT NULL,
        expires_at DATETIME NOT NULL,
        deleted_from_storage TINYINT(1) DEFAULT 0,
        storage_delete_failed TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_patt_msg (message_id),
        INDEX idx_patt_expires (expires_at),
        INDEX idx_patt_storage_status (deleted_from_storage, storage_delete_failed),
        CONSTRAINT fk_patt_msg FOREIGN KEY (message_id) REFERENCES private_messages(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. communication_cleanup_retries (Handles failed physical file deletions)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS communication_cleanup_retries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_path VARCHAR(500) NOT NULL,
        storage_key VARCHAR(255) NOT NULL,
        retry_count INT DEFAULT 0,
        last_error TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_retry_count (retry_count)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. communication_audit_logs (Audit trail for access grant/revocation)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS communication_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        target_employee_id INT NULL,
        details JSON NULL,
        ip_address VARCHAR(50) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cal_admin (admin_id),
        INDEX idx_cal_action (action_type),
        INDEX idx_cal_target (target_employee_id),
        INDEX idx_cal_created (created_at),
        CONSTRAINT fk_cal_admin FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.commit();
    console.log('✅ Private Communication database tables initialized successfully.');
  } catch (err) {
    await connection.rollback();
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = migrate;
