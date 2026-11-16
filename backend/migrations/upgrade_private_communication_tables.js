require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../config/db');

async function upgradeMigration() {
  console.log('Starting Private Communication upgrade migration (Group, Announcements, Reactions, Pinned)...');
  const connection = await db.getConnection();

  try {
    // 1. communication_groups
    await connection.query(`
      CREATE TABLE IF NOT EXISTS communication_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description VARCHAR(255) NULL,
        created_by INT NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed default Company Group if not existing
    const [[existingGroup]] = await connection.query(`SELECT id FROM communication_groups WHERE name = 'Company Group'`);
    if (!existingGroup) {
      await connection.query(`
        INSERT INTO communication_groups (name, description, is_active)
        VALUES ('Company Group', 'Official company-wide collaboration group for all active Admins and Employees', 1)
      `);
      console.log('Seeded "Company Group"');
    }

    // 2. Update private_messages to support group messages, replies, pins, edits
    // Check nullability of conversation_id
    const [convCol] = await connection.query(`SHOW COLUMNS FROM private_messages LIKE 'conversation_id'`);
    if (convCol.length > 0 && convCol[0].Null === 'NO') {
      try {
        await connection.query(`ALTER TABLE private_messages MODIFY COLUMN conversation_id INT NULL`);
        console.log('Made conversation_id nullable in private_messages');
      } catch (e) {
        console.warn('Note modifying conversation_id:', e.message);
      }
    }

    // Check & add group_id
    const [grpCol] = await connection.query(`SHOW COLUMNS FROM private_messages LIKE 'group_id'`);
    if (grpCol.length === 0) {
      await connection.query(`
        ALTER TABLE private_messages
        ADD COLUMN group_id INT NULL AFTER conversation_id,
        ADD INDEX idx_pmsg_group (group_id)
      `);
      try {
        await connection.query(`
          ALTER TABLE private_messages
          ADD CONSTRAINT fk_pmsg_group FOREIGN KEY (group_id) REFERENCES communication_groups(id) ON DELETE CASCADE
        `);
      } catch (_) {}
      console.log('Added group_id to private_messages');
    }

    // Check & add reply_to_id
    const [replyCol] = await connection.query(`SHOW COLUMNS FROM private_messages LIKE 'reply_to_id'`);
    if (replyCol.length === 0) {
      await connection.query(`
        ALTER TABLE private_messages
        ADD COLUMN reply_to_id INT NULL AFTER content,
        ADD INDEX idx_pmsg_reply (reply_to_id)
      `);
      try {
        await connection.query(`
          ALTER TABLE private_messages
          ADD CONSTRAINT fk_pmsg_reply FOREIGN KEY (reply_to_id) REFERENCES private_messages(id) ON DELETE SET NULL
        `);
      } catch (_) {}
      console.log('Added reply_to_id to private_messages');
    }

    // Check & add is_pinned, pinned_by, pinned_at
    const [pinCol] = await connection.query(`SHOW COLUMNS FROM private_messages LIKE 'is_pinned'`);
    if (pinCol.length === 0) {
      await connection.query(`
        ALTER TABLE private_messages
        ADD COLUMN is_pinned TINYINT(1) DEFAULT 0 AFTER reply_to_id,
        ADD COLUMN pinned_by INT NULL AFTER is_pinned,
        ADD COLUMN pinned_at DATETIME NULL AFTER pinned_by
      `);
      console.log('Added pinning columns to private_messages');
    }

    // Check & add is_edited, edited_at
    const [editCol] = await connection.query(`SHOW COLUMNS FROM private_messages LIKE 'is_edited'`);
    if (editCol.length === 0) {
      await connection.query(`
        ALTER TABLE private_messages
        ADD COLUMN is_edited TINYINT(1) DEFAULT 0 AFTER pinned_at,
        ADD COLUMN edited_at DATETIME NULL AFTER is_edited
      `);
      console.log('Added editing columns to private_messages');
    }

    // 3. communication_group_reads (per-member read receipts for group messages)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS communication_group_reads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id INT NOT NULL,
        user_id INT NOT NULL,
        is_delivered TINYINT(1) DEFAULT 1,
        delivered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_read TINYINT(1) DEFAULT 0,
        read_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_cgr_msg_user (message_id, user_id),
        INDEX idx_cgr_user (user_id),
        INDEX idx_cgr_read (is_read),
        CONSTRAINT fk_cgr_msg FOREIGN KEY (message_id) REFERENCES private_messages(id) ON DELETE CASCADE,
        CONSTRAINT fk_cgr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. communication_message_reactions (emoji reactions on messages)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS communication_message_reactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id INT NOT NULL,
        user_id INT NOT NULL,
        emoji VARCHAR(32) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_react_user_msg (message_id, user_id),
        INDEX idx_cmr_msg (message_id),
        CONSTRAINT fk_cmr_msg FOREIGN KEY (message_id) REFERENCES private_messages(id) ON DELETE CASCADE,
        CONSTRAINT fk_cmr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. communication_announcements (Admin Announcements)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS communication_announcements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        priority ENUM('Normal', 'Important', 'Urgent') DEFAULT 'Normal' NOT NULL,
        target_type ENUM('all', 'selected') DEFAULT 'all' NOT NULL,
        sender_id INT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ca_expires (expires_at),
        INDEX idx_ca_priority (priority),
        CONSTRAINT fk_ca_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. communication_announcement_recipients (tracking delivery & read per employee)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS communication_announcement_recipients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        announcement_id INT NOT NULL,
        employee_id INT NOT NULL,
        is_delivered TINYINT(1) DEFAULT 1,
        delivered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_read TINYINT(1) DEFAULT 0,
        read_at DATETIME NULL,
        UNIQUE KEY uniq_ca_recip (announcement_id, employee_id),
        INDEX idx_car_emp (employee_id),
        INDEX idx_car_read (is_read),
        CONSTRAINT fk_car_anno FOREIGN KEY (announcement_id) REFERENCES communication_announcements(id) ON DELETE CASCADE,
        CONSTRAINT fk_car_emp FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('✅ Private Communication upgrade migration completed successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  upgradeMigration().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = upgradeMigration;
