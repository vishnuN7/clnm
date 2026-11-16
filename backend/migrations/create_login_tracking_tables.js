/**
 * Migration: Create Login Tracking & Device Location Tables
 * - login_activities: Records individual login sessions, device metadata, GPS coordinates, permission & capture statuses
 * - location_audit_logs: Audit trail of Admin views/exports of sensitive location data
 */
const db = require('../config/db');

module.exports = async function createLoginTrackingTables() {
  console.log('[Migration] Initializing Login Tracking & Device Location Tables...');

  try {
    // 1. Create login_activities table
    await db.query(`
      CREATE TABLE IF NOT EXISTS login_activities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        session_id VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45) NULL,
        device_type VARCHAR(50) DEFAULT 'Desktop',
        operating_system VARCHAR(100) DEFAULT 'Unknown',
        browser VARCHAR(100) DEFAULT 'Unknown',
        user_agent TEXT NULL,
        latitude DECIMAL(10, 7) NULL,
        longitude DECIMAL(10, 7) NULL,
        accuracy DECIMAL(10, 2) NULL,
        permission_status ENUM('granted', 'denied', 'prompt', 'unsupported') NOT NULL DEFAULT 'prompt',
        capture_status ENUM('captured', 'permission_denied', 'unavailable', 'timeout', 'error', 'pending') NOT NULL DEFAULT 'pending',
        location_city VARCHAR(100) NULL,
        location_region VARCHAR(100) NULL,
        location_country VARCHAR(100) NULL,
        error_message TEXT NULL,
        captured_at TIMESTAMP NULL,
        login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        logout_at TIMESTAMP NULL,
        session_status ENUM('Active', 'Logged Out', 'Expired') NOT NULL DEFAULT 'Active',
        is_unusual TINYINT(1) NOT NULL DEFAULT 0,
        unusual_reason VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_la_employee_id (employee_id),
        INDEX idx_la_session_id (session_id),
        INDEX idx_la_login_at (login_at),
        INDEX idx_la_capture_status (capture_status),
        INDEX idx_la_permission_status (permission_status),
        INDEX idx_la_session_status (session_status),
        INDEX idx_la_is_unusual (is_unusual),
        FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Table login_activities verified / created.');

    // 2. Create location_audit_logs table
    await db.query(`
      CREATE TABLE IF NOT EXISTS location_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NOT NULL,
        admin_name VARCHAR(100) NULL,
        target_activity_id INT NULL,
        target_employee_id INT NULL,
        action VARCHAR(50) NOT NULL,
        ip_address VARCHAR(45) NULL,
        details TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_lal_admin (admin_id),
        INDEX idx_lal_employee (target_employee_id),
        INDEX idx_lal_activity (target_activity_id),
        INDEX idx_lal_created (created_at),
        FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (target_employee_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (target_activity_id) REFERENCES login_activities(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Table location_audit_logs verified / created.');

    // 3. Backfill from existing attendance_logs if login_activities is empty.
    //    Skipped (not fatal) when attendance_logs does not exist yet.
    const [existing] = await db.query('SELECT COUNT(*) AS count FROM login_activities');
    const [attTable] = await db.query(
      "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_logs' LIMIT 1"
    );
    if (existing[0].count === 0 && attTable.length === 0) {
      console.warn('[Migration] attendance_logs table not found - skipping login_activities backfill.');
    } else if (existing[0].count === 0) {
      console.log('[Migration] Backfilling login_activities from attendance_logs...');
      // Sample recent records from attendance_logs
      const [logs] = await db.query(`
        SELECT id, employee_id, login_time, logout_time, session_status, ip_address, device, browser, os,
               location_city, location_region, location_country, latitude, longitude
        FROM attendance_logs
        ORDER BY id ASC
      `);

      for (const log of logs) {
        const sessId = 'legacy-att-' + log.id;
        const sessStatus = log.session_status === 'Active Session' ? 'Active' : 'Logged Out';
        let captureStatus = 'pending';
        let permStatus = 'prompt';
        let capturedAt = null;

        if (log.latitude != null && log.longitude != null) {
          captureStatus = 'captured';
          permStatus = 'granted';
          capturedAt = log.login_time;
        }

        await db.query(`
          INSERT INTO login_activities
            (employee_id, session_id, ip_address, device_type, operating_system, browser,
             latitude, longitude, accuracy, permission_status, capture_status,
             location_city, location_region, location_country, captured_at, login_at, logout_at, session_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          log.employee_id,
          sessId,
          log.ip_address || '127.0.0.1',
          log.device || 'Desktop',
          log.os || 'Windows',
          log.browser || 'Chrome',
          log.latitude,
          log.longitude,
          log.latitude ? 15.0 : null,
          permStatus,
          captureStatus,
          log.location_city,
          log.location_region,
          log.location_country,
          capturedAt,
          log.login_time,
          log.logout_time,
          sessStatus
        ]);
      }
      console.log(`✅ Backfilled ${logs.length} records into login_activities.`);
    }

    console.log('[Migration] Login Tracking tables successfully initialized.');
  } catch (err) {
    console.error('[Migration] Failed to create login tracking tables:', err);
    throw err;
  }
};