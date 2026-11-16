const db = require('../config/db');

module.exports = async function createCentralizedNotificationTables() {
  console.log('[Migration] Initializing Centralized Notification Tables...');

  try {
    // 1. Create master notifications table
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50) NOT NULL DEFAULT 'general',
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        sender_id INT NULL,
        sender_role ENUM('admin', 'employee', 'system') NOT NULL DEFAULT 'system',
        recipient_role ENUM('admin', 'employee', 'all') NOT NULL DEFAULT 'employee',
        audience_type ENUM('all', 'selected', 'individual', 'role') NOT NULL DEFAULT 'individual',
        priority ENUM('normal', 'important', 'urgent') NOT NULL DEFAULT 'normal',
        action_url VARCHAR(500) NULL,
        entity_type VARCHAR(50) NULL,
        entity_id INT NULL,
        metadata JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_notif_created (created_at),
        INDEX idx_notif_type (type),
        INDEX idx_notif_entity (entity_type, entity_id),
        INDEX idx_notif_sender (sender_id),
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 2. Create recipient tracking table for confirmed delivery and read status
    await db.query(`
      CREATE TABLE IF NOT EXISTS notification_recipients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        notification_id INT NOT NULL,
        user_id INT NOT NULL,
        role ENUM('admin', 'employee') NOT NULL DEFAULT 'employee',
        is_delivered TINYINT(1) NOT NULL DEFAULT 0,
        delivered_at TIMESTAMP NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        read_at TIMESTAMP NULL,
        is_archived TINYINT(1) NOT NULL DEFAULT 0,
        archived_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_notif_user (notification_id, user_id),
        INDEX idx_recip_user_read (user_id, is_read, is_archived),
        INDEX idx_recip_notif_deliv (notification_id, is_delivered),
        INDEX idx_recip_notif_read (notification_id, is_read),
        FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 3. Ensure notification_preferences columns
    await db.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id INT PRIMARY KEY,
        email_notifications TINYINT(1) DEFAULT 1,
        whatsapp_notifications TINYINT(1) DEFAULT 1,
        loan_alerts TINYINT(1) DEFAULT 1,
        employee_activity_alerts TINYINT(1) DEFAULT 1,
        system_alerts TINYINT(1) DEFAULT 1,
        sound_enabled TINYINT(1) DEFAULT 1,
        browser_notifications_enabled TINYINT(1) DEFAULT 0,
        announcement_alerts TINYINT(1) DEFAULT 1,
        task_alerts TINYINT(1) DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [prefCols] = await db.query('DESCRIBE notification_preferences');
    const prefFields = prefCols.map(c => c.Field);
    if (!prefFields.includes('sound_enabled')) {
      await db.query('ALTER TABLE notification_preferences ADD COLUMN sound_enabled TINYINT(1) NOT NULL DEFAULT 1');
    }
    if (!prefFields.includes('browser_notifications_enabled')) {
      await db.query('ALTER TABLE notification_preferences ADD COLUMN browser_notifications_enabled TINYINT(1) NOT NULL DEFAULT 0');
    }
    if (!prefFields.includes('announcement_alerts')) {
      await db.query('ALTER TABLE notification_preferences ADD COLUMN announcement_alerts TINYINT(1) NOT NULL DEFAULT 1');
    }
    if (!prefFields.includes('task_alerts')) {
      await db.query('ALTER TABLE notification_preferences ADD COLUMN task_alerts TINYINT(1) NOT NULL DEFAULT 1');
    }

    // 4. One-time legacy migration from employee_notifications to centralized tables
    const [[{ count }]] = await db.query('SELECT COUNT(*) as count FROM notifications');
    if (count === 0) {
      const [oldRows] = await db.query(`
        SELECT en.*, u.role as user_role
        FROM employee_notifications en
        JOIN users u ON u.id = en.employee_id
        WHERE en.status IS NULL OR en.status != 'expired'
      `);

      for (const row of oldRows) {
        const text = row.message || row.body || '';
        const [res] = await db.query(`
          INSERT INTO notifications (
            type, title, message, sender_id, sender_role, recipient_role,
            audience_type, priority, action_url, entity_type, entity_id,
            metadata, created_at, updated_at
          ) VALUES (?, ?, ?, NULL, 'system', 'employee', 'individual', ?, ?, ?, ?, ?, ?, ?)
        `, [
          row.type || 'general',
          row.title || 'Notification',
          text,
          row.priority || 'normal',
          row.link_url || null,
          row.entity_type || row.reference_type || null,
          row.entity_id || row.reference_id || row.assignment_id || null,
          JSON.stringify({ legacy_id: row.id, assignment_id: row.assignment_id, record_id: row.record_id, customer_id: row.customer_id, loan_id: row.loan_id }),
          row.created_at || new Date(),
          row.updated_at || new Date()
        ]);

        const notifId = res.insertId;
        const isRead = Boolean(row.is_read);

        await db.query(`
          INSERT IGNORE INTO notification_recipients (
            notification_id, user_id, role, is_delivered, delivered_at,
            is_read, read_at, is_archived, created_at, updated_at
          ) VALUES (?, ?, 'employee', 1, ?, ?, ?, 0, ?, ?)
        `, [
          notifId,
          row.employee_id,
          row.created_at || new Date(),
          isRead ? 1 : 0,
          row.read_at || (isRead ? row.created_at : null),
          row.created_at || new Date(),
          row.updated_at || new Date()
        ]);
      }
      console.log(`[Migration] Migrated ${oldRows.length} legacy notifications to centralized tables.`);
    }

    console.log('[Migration] Centralized Notification Tables ensured successfully.');
  } catch (err) {
    console.error('[Migration] Failed to create centralized notification tables:', err.message);
    throw err;
  }
};
