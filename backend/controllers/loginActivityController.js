const db = require('../config/db');
const XLSX = require('xlsx');

/**
 * Calculate Haversine distance between two coordinates in kilometers.
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);
  if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) return null;

  const R = 6371; // Earth's radius in km
  const dLat = (nLat2 - nLat1) * Math.PI / 180;
  const dLon = (nLon2 - nLon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(nLat1 * Math.PI / 180) * Math.cos(nLat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Format IP address for clean presentation (distinguishing local loopback from remote addresses).
 */
function normalizeIp(ip) {
  if (!ip) return 'Unknown';
  const clean = ip.trim();
  if (clean === '::1' || clean === '127.0.0.1' || clean === '::ffff:127.0.0.1') {
    return '127.0.0.1 (Localhost)';
  }
  // Strip IPv6 prefix if IPv4-mapped
  if (clean.startsWith('::ffff:')) {
    return clean.replace('::ffff:', '');
  }
  return clean;
}

/**
 * Format Indian date for filenames (e.g., 15-Nov-2026)
 */
function formatFilenameDate(date = new Date()) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = String(date.getDate()).padStart(2, '0');
  const m = months[date.getMonth()];
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

/**
 * Log Admin access to sensitive employee location data for privacy and compliance audit trail.
 */
async function logLocationAudit(adminId, adminName, action, targetActivityId, targetEmployeeId, ip, details) {
  try {
    await db.query(`
      INSERT INTO location_audit_logs 
        (admin_id, admin_name, target_activity_id, target_employee_id, action, ip_address, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `, [adminId, adminName || 'Admin', targetActivityId || null, targetEmployeeId || null, action, ip || null, details || null]);
  } catch (err) {
    console.warn('[Audit Log] Failed to insert audit log:', err.message);
  }
}

/**
 * Routine to sweep and expire stale active sessions (> 24 hours old)
 */
async function sweepExpiredSessions() {
  try {
    await db.query(`
      UPDATE login_activities
      SET session_status = 'Expired'
      WHERE session_status = 'Active' AND logout_at IS NULL AND login_at < NOW() - INTERVAL 24 HOUR
    `);
  } catch (err) {
    console.warn('[Session Sweep] Failed to expire stale sessions:', err.message);
  }
}

const loginActivityController = {
  /**
   * POST /api/login-activity/record-location
   * Records or updates browser GPS coordinates and permission status for current employee session.
   */
  async recordLocation(req, res) {
    try {
      const employeeId = req.user.id;
      const {
        activity_id,
        session_id,
        latitude,
        longitude,
        accuracy,
        permission_status,
        capture_status,
        error_message,
        device_type,
        operating_system,
        browser,
        location_source
      } = req.body;

      const permStatus = ['granted', 'denied', 'prompt', 'unsupported'].includes(permission_status)
        ? permission_status
        : 'prompt';

      const capStatus = ['captured', 'permission_denied', 'unavailable', 'timeout', 'error', 'pending'].includes(capture_status)
        ? capture_status
        : 'pending';

      const validLat = (latitude != null && !isNaN(Number(latitude)) && Number(latitude) >= -90 && Number(latitude) <= 90)
        ? Number(latitude)
        : null;

      const validLon = (longitude != null && !isNaN(Number(longitude)) && Number(longitude) >= -180 && Number(longitude) <= 180)
        ? Number(longitude)
        : null;

      const validAcc = (accuracy != null && !isNaN(Number(accuracy)) && Number(accuracy) >= 0)
        ? Number(accuracy)
        : null;

      const locSource = ['browser_verified', 'approximate_network', 'test_fixture', 'legacy_backfill', 'unavailable'].includes(location_source)
        ? location_source
        : (capStatus === 'captured' && validLat != null ? 'browser_verified' : 'unavailable');

      // Locate or establish active activity record for this employee
      let targetId = activity_id ? parseInt(activity_id, 10) : null;
      let targetRecord = null;

      if (targetId) {
        const [rows] = await db.query(
          'SELECT * FROM login_activities WHERE id = ? AND employee_id = ? LIMIT 1',
          [targetId, employeeId]
        );
        if (rows.length > 0) targetRecord = rows[0];
      }

      if (!targetRecord && session_id) {
        const [rows] = await db.query(
          'SELECT * FROM login_activities WHERE session_id = ? AND employee_id = ? ORDER BY id DESC LIMIT 1',
          [session_id, employeeId]
        );
        if (rows.length > 0) {
          targetRecord = rows[0];
          targetId = targetRecord.id;
        }
      }

      if (!targetRecord) {
        const [rows] = await db.query(
          'SELECT * FROM login_activities WHERE employee_id = ? AND session_status = "Active" ORDER BY id DESC LIMIT 1',
          [employeeId]
        );
        if (rows.length > 0) {
          targetRecord = rows[0];
          targetId = targetRecord.id;
        }
      }

      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
      if (!targetRecord) {
        const generatedSessionId = session_id || require('crypto').randomUUID();
        const [insertResult] = await db.query(`
          INSERT INTO login_activities 
            (employee_id, session_id, ip_address, device_type, operating_system, browser, permission_status, capture_status, location_source, login_at, session_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'Active')
        `, [
          employeeId,
          generatedSessionId,
          ip,
          device_type || 'Desktop',
          operating_system || 'Unknown',
          browser || 'Unknown',
          permStatus,
          capStatus,
          locSource
        ]);
        targetId = insertResult.insertId;
      }

      // ── Unusual Login & Security Anomaly Detection ──
      let isUnusual = 0;
      let unusualReason = null;
      let distanceFromLast = null;

      if (capStatus === 'captured' && validLat != null && validLon != null) {
        // 1. Check distance against previous verified location for this employee
        const [prevLocations] = await db.query(`
          SELECT latitude, longitude, captured_at, login_at 
          FROM login_activities 
          WHERE employee_id = ? AND latitude IS NOT NULL AND id != ? 
          ORDER BY login_at DESC LIMIT 1
        `, [employeeId, targetId]);

        if (prevLocations.length > 0) {
          const prev = prevLocations[0];
          const distKm = calculateDistanceKm(prev.latitude, prev.longitude, validLat, validLon);
          if (distKm != null) {
            distanceFromLast = distKm;
            if (distKm > 100) {
              isUnusual = 1;
              unusualReason = `Significant location variance: device reported ${Math.round(distKm)} km from previous recorded login`;
            }
          }
        }

        // 2. Check if device / OS profile changed
        const curDevice = device_type || targetRecord?.device_type || 'Desktop';
        const curOS = operating_system || targetRecord?.operating_system || 'Unknown';
        const [deviceMatches] = await db.query(`
          SELECT COUNT(*) AS count 
          FROM login_activities 
          WHERE employee_id = ? AND device_type = ? AND operating_system = ? AND id != ?
        `, [employeeId, curDevice, curOS, targetId]);

        if (deviceMatches[0].count === 0 && (curDevice !== 'Desktop' || curOS !== 'Windows')) {
          isUnusual = 1;
          const reason = `New device profile (${curDevice} on ${curOS})`;
          unusualReason = unusualReason ? `${unusualReason}; ${reason}` : reason;
        }
      }

      // Update login_activities record
      await db.query(`
        UPDATE login_activities SET
          latitude = ?,
          longitude = ?,
          accuracy = ?,
          permission_status = ?,
          capture_status = ?,
          location_source = ?,
          captured_at = NOW(),
          error_message = ?,
          is_unusual = GREATEST(is_unusual, ?),
          unusual_reason = COALESCE(?, unusual_reason),
          distance_from_last_km = COALESCE(?, distance_from_last_km)
        WHERE id = ?
      `, [
        validLat,
        validLon,
        validAcc,
        permStatus,
        capStatus,
        locSource,
        error_message || null,
        isUnusual,
        unusualReason,
        distanceFromLast,
        targetId
      ]);

      // If location successfully captured, synchronize with active attendance_logs row as well
      if (capStatus === 'captured' && validLat != null && validLon != null) {
        try {
          await db.query(`
            UPDATE attendance_logs SET
              latitude = ?,
              longitude = ?,
              location_source = 'browser_gps'
            WHERE employee_id = ? AND logout_time IS NULL
            ORDER BY id DESC LIMIT 1
          `, [validLat, validLon, employeeId]);
        } catch (attErr) {
          console.warn('[LoginActivity] attendance_logs sync notice:', attErr.message);
        }
      }

      return res.json({
        success: true,
        message: 'Location captured and verified successfully.',
        activity_id: targetId,
        permission_status: permStatus,
        capture_status: capStatus,
        location_source: locSource,
        latitude: validLat,
        longitude: validLon,
        accuracy: validAcc,
        is_unusual: Boolean(isUnusual),
        distance_from_last_km: distanceFromLast
      });
    } catch (err) {
      console.error('[LoginActivity] recordLocation error:', err);
      return res.status(500).json({ success: false, message: 'Server error processing location.' });
    }
  },

  /**
   * GET /api/login-activity/my-status
   * Employee endpoint: retrieves the current employee's active session tracking state.
   */
  async getMyStatus(req, res) {
    try {
      const employeeId = req.user.id;
      const [rows] = await db.query(`
        SELECT id, session_id, ip_address, device_type, operating_system, browser,
               latitude, longitude, accuracy, permission_status, capture_status,
               location_source, error_message, captured_at, login_at, session_status
        FROM login_activities
        WHERE employee_id = ?
        ORDER BY login_at DESC LIMIT 1
      `, [employeeId]);

      if (rows.length === 0) {
        return res.json({
          success: true,
          status: {
            permission_status: 'prompt',
            capture_status: 'pending',
            location_source: 'unavailable',
            captured_at: null,
            accuracy: null
          }
        });
      }

      return res.json({
        success: true,
        status: rows[0]
      });
    } catch (err) {
      console.error('[LoginActivity] getMyStatus error:', err);
      return res.status(500).json({ success: false, message: 'Server error retrieving status.' });
    }
  },

  /**
   * GET /api/login-activity/my-history
   * Employee endpoint: retrieves employee's own paginated login history (isolated to current user).
   */
  async getMyHistory(req, res) {
    try {
      const employeeId = req.user.id;
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 10));
      const offset = (page - 1) * limit;

      const [countResult] = await db.query(
        'SELECT COUNT(*) AS total FROM login_activities WHERE employee_id = ?',
        [employeeId]
      );
      const total = countResult[0].total;

      const [records] = await db.query(`
        SELECT id, session_id, ip_address, device_type, operating_system, browser,
               latitude, longitude, accuracy, permission_status, capture_status,
               location_source, error_message, captured_at, login_at, logout_at, session_status
        FROM login_activities
        WHERE employee_id = ?
        ORDER BY login_at DESC
        LIMIT ? OFFSET ?
      `, [employeeId, limit, offset]);

      return res.json({
        success: true,
        records,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
    } catch (err) {
      console.error('[LoginActivity] getMyHistory error:', err);
      return res.status(500).json({ success: false, message: 'Server error retrieving history.' });
    }
  },

  /**
   * GET /api/login-activity/stats
   * Admin endpoint: Real-time database aggregated KPI statistics
   */
  async getStats(req, res) {
    try {
      // 1. Auto-sweep expired sessions (>24h without logout)
      await sweepExpiredSessions();

      // 2. Total logins
      const [totalLogins] = await db.query('SELECT COUNT(*) AS total FROM login_activities');
      const total = totalLogins[0].total || 0;

      // 3. Successfully captured locations (must have valid coordinates)
      const [captured] = await db.query(`
        SELECT COUNT(*) AS count 
        FROM login_activities 
        WHERE capture_status = 'captured' AND latitude IS NOT NULL AND longitude IS NOT NULL
      `);
      const capturedCount = captured[0].count || 0;

      // 4. Permission denied (browser denied or user dismissed)
      const [denied] = await db.query(`
        SELECT COUNT(*) AS count 
        FROM login_activities 
        WHERE permission_status = 'denied' OR capture_status = 'permission_denied'
      `);
      const deniedCount = denied[0].count || 0;

      // 5. Location unavailable (timeout or hardware/OS unavailable)
      const [unavailable] = await db.query(`
        SELECT COUNT(*) AS count 
        FROM login_activities 
        WHERE capture_status IN ('unavailable', 'timeout', 'error')
      `);
      const unavailableCount = unavailable[0].count || 0;

      // 6. Active sessions (genuinely active sessions within 24h)
      const [activeSessions] = await db.query(`
        SELECT COUNT(DISTINCT employee_id) AS count 
        FROM login_activities 
        WHERE session_status = 'Active' AND logout_at IS NULL AND login_at >= NOW() - INTERVAL 24 HOUR
      `);
      const activeCount = activeSessions[0].count || 0;

      // 7. Unusual logins count (not dismissed)
      const [unusualRows] = await db.query(`
        SELECT COUNT(*) AS count 
        FROM login_activities 
        WHERE is_unusual = 1 AND (review_status IS NULL OR review_status != 'Dismissed')
      `);
      const unusualCount = unusualRows[0].count || 0;

      // 8. Unreviewed alerts
      const [unreviewedRows] = await db.query(`
        SELECT COUNT(*) AS count 
        FROM login_activities 
        WHERE is_unusual = 1 AND (review_status IS NULL OR review_status = 'Pending Review')
      `);
      const unreviewedCount = unreviewedRows[0].count || 0;

      const rate = total > 0 ? ((capturedCount / total) * 100).toFixed(1) : '0.0';

      return res.json({
        success: true,
        stats: {
          total_logins: total,
          locations_captured: capturedCount,
          permission_denied: deniedCount,
          location_unavailable: unavailableCount,
          active_sessions: activeCount,
          unusual_logins: unusualCount,
          unreviewed_alerts: unreviewedCount,
          capture_rate: parseFloat(rate)
        }
      });
    } catch (err) {
      console.error('[LoginActivity] getStats error:', err);
      return res.status(500).json({ success: false, message: 'Server error retrieving statistics.' });
    }
  },

  /**
   * GET /api/login-activity/alerts
   * Admin endpoint: retrieves all detected unusual login attempts with audit details.
   */
  async getUnusualAlerts(req, res) {
    try {
      const [alerts] = await db.query(`
        SELECT la.id, la.employee_id, la.session_id, la.ip_address,
               la.device_type, la.operating_system, la.browser,
               la.latitude, la.longitude, la.accuracy,
               la.location_city, la.location_region, la.location_country,
               la.location_source, la.login_at, la.logout_at,
               la.session_status, la.is_unusual, la.unusual_reason,
               la.distance_from_last_km, la.review_status, la.reviewed_at,
               la.investigation_notes,
               u.name AS employee_name, u.email AS employee_email,
               u.username AS employee_username, u.department,
               reviewer.name AS reviewed_by_name
        FROM login_activities la
        JOIN users u ON la.employee_id = u.id
        LEFT JOIN users reviewer ON la.reviewed_by = reviewer.id
        WHERE la.is_unusual = 1
        ORDER BY la.login_at DESC
        LIMIT 100
      `);

      return res.json({
        success: true,
        alerts
      });
    } catch (err) {
      console.error('[LoginActivity] getUnusualAlerts error:', err);
      return res.status(500).json({ success: false, message: 'Server error retrieving alerts.' });
    }
  },

  /**
   * POST /api/login-activity/alerts/:id/review
   * Admin endpoint: marks an unusual login alert as Reviewed or Dismissed, with investigation notes.
   */
  async reviewAlert(req, res) {
    try {
      const recordId = parseInt(req.params.id, 10);
      const adminId = req.user.id;
      const adminName = req.user.name;
      const { review_status, notes } = req.body;

      if (!['Pending Review', 'Reviewed', 'Dismissed'].includes(review_status)) {
        return res.status(400).json({ success: false, message: 'Invalid review status.' });
      }

      const [existing] = await db.query('SELECT * FROM login_activities WHERE id = ?', [recordId]);
      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: 'Login activity record not found.' });
      }

      await db.query(`
        UPDATE login_activities SET
          review_status = ?,
          investigation_notes = ?,
          reviewed_by = ?,
          reviewed_at = NOW()
        WHERE id = ?
      `, [review_status, notes || null, adminId, recordId]);

      // Log into location_audit_logs
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
      await logLocationAudit(
        adminId,
        adminName,
        'review_security_alert',
        recordId,
        existing[0].employee_id,
        ip,
        `Marked as ${review_status}. Notes: ${notes ? notes.substring(0, 100) : 'None'}`
      );

      return res.json({
        success: true,
        message: `Alert successfully updated to ${review_status}.`,
        record_id: recordId,
        review_status,
        reviewed_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('[LoginActivity] reviewAlert error:', err);
      return res.status(500).json({ success: false, message: 'Server error updating alert review.' });
    }
  },

  /**
   * GET /api/login-activity/records
   * Admin endpoint: comprehensive server-side filtering, searching, and pagination.
   */
  async getRecords(req, res) {
    try {
      await sweepExpiredSessions();

      const {
        search,
        employee_id,
        capture_status,
        device_type,
        session_status,
        is_unusual,
        review_status,
        from_date,
        to_date,
        sort,
        page = 1,
        limit = 20
      } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(5, parseInt(limit, 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      const conditions = [];
      const params = [];

      // 1. Search filter: employee name, email, username, IP, device, OS, browser, session_id
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(`(
          u.name LIKE ? OR 
          u.email LIKE ? OR 
          u.username LIKE ? OR 
          la.ip_address LIKE ? OR 
          la.device_type LIKE ? OR 
          la.operating_system LIKE ? OR 
          la.browser LIKE ? OR 
          la.session_id LIKE ?
        )`);
        params.push(term, term, term, term, term, term, term, term);
      }

      // 2. Employee filter
      if (employee_id && employee_id !== 'all') {
        conditions.push('la.employee_id = ?');
        params.push(parseInt(employee_id, 10));
      }

      // 3. Capture status filter
      if (capture_status && capture_status !== 'all') {
        if (capture_status === 'captured') {
          conditions.push("la.capture_status = 'captured' AND la.latitude IS NOT NULL");
        } else if (capture_status === 'denied' || capture_status === 'permission_denied') {
          conditions.push("(la.capture_status = 'permission_denied' OR la.permission_status = 'denied')");
        } else if (capture_status === 'unavailable') {
          conditions.push("la.capture_status IN ('unavailable', 'timeout', 'error')");
        } else if (capture_status === 'pending') {
          conditions.push("la.capture_status = 'pending'");
        }
      }

      // 4. Device filter
      if (device_type && device_type !== 'all') {
        conditions.push('la.device_type = ?');
        params.push(device_type);
      }

      // 5. Session status filter
      if (session_status && session_status !== 'all') {
        conditions.push('la.session_status = ?');
        params.push(session_status);
      }

      // 6. Security & Unusual filter
      if (is_unusual === 'true' || is_unusual === '1') {
        conditions.push('la.is_unusual = 1');
      } else if (is_unusual === 'false' || is_unusual === '0') {
        conditions.push('la.is_unusual = 0');
      } else if (is_unusual === 'false' || is_unusual === '0') {
        conditions.push('la.is_unusual = 0');
      }

      // 7. Review status filter
      if (review_status && review_status !== 'all') {
        conditions.push('la.review_status = ?');
        params.push(review_status);
      }

      // 8. Date range filters (handling full day up to 23:59:59)
      if (from_date && from_date.trim()) {
        conditions.push('la.login_at >= CONCAT(?, " 00:00:00")');
        params.push(from_date.trim());
      }
      if (to_date && to_date.trim()) {
        conditions.push('la.login_at <= CONCAT(?, " 23:59:59")');
        params.push(to_date.trim());
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      let orderBy = 'la.login_at DESC';
      if (sort === 'oldest') {
        orderBy = 'la.login_at ASC';
      } else if (sort === 'accuracy') {
        orderBy = 'la.accuracy ASC, la.login_at DESC';
      } else if (is_unusual === 'true' || is_unusual === '1') {
        orderBy = "CASE WHEN (la.review_status = 'Pending Review' OR la.review_status IS NULL) THEN 0 ELSE 1 END ASC, la.login_at DESC";
      }

      // Count total matching records
      const [countRows] = await db.query(`
        SELECT COUNT(*) AS total
        FROM login_activities la
        JOIN users u ON la.employee_id = u.id
        ${whereClause}
      `, params);
      const total = countRows[0].total;

      // Fetch paginated rows with employee metadata
      const [records] = await db.query(`
        SELECT la.id, la.employee_id, la.session_id, la.ip_address,
               la.device_type, la.operating_system, la.browser, la.user_agent,
               la.latitude, la.longitude, la.accuracy,
               la.permission_status, la.capture_status, la.location_source,
               la.location_city, la.location_region, la.location_country,
               la.error_message, la.captured_at, la.login_at, la.logout_at,
               la.session_status, la.is_unusual, la.unusual_reason,
               la.distance_from_last_km, la.review_status, la.reviewed_at,
               la.investigation_notes,
               u.name AS employee_name, u.email AS employee_email,
               u.username AS employee_username, u.profile_picture, u.department,
               reviewer.name AS reviewed_by_name
        FROM login_activities la
        JOIN users u ON la.employee_id = u.id
        LEFT JOIN users reviewer ON la.reviewed_by = reviewer.id
        ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `, [...params, limitNum, offset]);

      return res.json({
        success: true,
        records: records.map(r => ({
          ...r,
          display_ip: normalizeIp(r.ip_address)
        })),
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum
      });
    } catch (err) {
      console.error('[LoginActivity] getRecords error:', err);
      return res.status(500).json({ success: false, message: 'Server error retrieving login records.' });
    }
  },

  /**
   * GET /api/login-activity/records/:id
   * Admin endpoint: retrieves detailed individual login activity and logs audit trail.
   */
  async getRecordById(req, res) {
    try {
      const recordId = parseInt(req.params.id, 10);
      const adminId = req.user.id;
      const adminName = req.user.name;

      const [rows] = await db.query(`
        SELECT la.*,
               u.name AS employee_name, u.email AS employee_email,
               u.username AS employee_username, u.profile_picture,
               u.department, u.phone AS employee_phone,
               reviewer.name AS reviewed_by_name
        FROM login_activities la
        JOIN users u ON la.employee_id = u.id
        LEFT JOIN users reviewer ON la.reviewed_by = reviewer.id
        WHERE la.id = ?
        LIMIT 1
      `, [recordId]);

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Record not found.' });
      }

      const record = rows[0];
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;

      // Log into location_audit_logs
      await logLocationAudit(
        adminId,
        adminName,
        'view_location_details',
        record.id,
        record.employee_id,
        ip,
        `Viewed details for employee #${record.employee_id} (${record.employee_name})`
      );

      return res.json({
        success: true,
        record: {
          ...record,
          display_ip: normalizeIp(record.ip_address)
        }
      });
    } catch (err) {
      console.error('[LoginActivity] getRecordById error:', err);
      return res.status(500).json({ success: false, message: 'Server error retrieving record.' });
    }
  },

  /**
   * POST /api/login-activity/records/:id/terminate
   * Admin endpoint: Terminates an active employee session immediately.
   */
  async terminateSession(req, res) {
    try {
      const recordId = parseInt(req.params.id, 10);
      const adminId = req.user.id;
      const adminName = req.user.name;

      const [rows] = await db.query(
        'SELECT la.*, u.name AS employee_name FROM login_activities la JOIN users u ON la.employee_id = u.id WHERE la.id = ?',
        [recordId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Login activity record not found.' });
      }

      const record = rows[0];

      // Mark session as Terminated in login_activities
      await db.query(`
        UPDATE login_activities 
        SET session_status = 'Terminated', logout_at = NOW() 
        WHERE id = ?
      `, [recordId]);

      // If active in attendance_logs, close it
      try {
        await db.query(`
          UPDATE attendance_logs 
          SET logout_time = NOW() 
          WHERE employee_id = ? AND logout_time IS NULL
        `, [record.employee_id]);
      } catch (attErr) {
        console.warn('[LoginActivity] attendance update warning:', attErr.message);
      }

      // Log into location_audit_logs
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
      await logLocationAudit(
        adminId,
        adminName,
        'terminate_session',
        record.id,
        record.employee_id,
        ip,
        `Terminated session #${record.session_id || recordId} for employee #${record.employee_id} (${record.employee_name})`
      );

      return res.json({
        success: true,
        message: `Active session for ${record.employee_name} was terminated successfully.`,
        record_id: recordId,
        session_status: 'Terminated'
      });
    } catch (err) {
      console.error('[LoginActivity] terminateSession error:', err);
      return res.status(500).json({ success: false, message: 'Server error terminating session.' });
    }
  },

  /**
   * GET /api/login-activity/employee/:employeeId
   * Admin endpoint: returns complete historical logins for a specific employee.
   */
  async getEmployeeHistory(req, res) {
    try {
      const employeeId = parseInt(req.params.employeeId, 10);
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 20));
      const offset = (page - 1) * limit;

      const [empRows] = await db.query(
        'SELECT id, name, email, department FROM users WHERE id = ?',
        [employeeId]
      );
      if (empRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
      }

      const [countResult] = await db.query(
        'SELECT COUNT(*) AS total FROM login_activities WHERE employee_id = ?',
        [employeeId]
      );
      const total = countResult[0].total;

      const [records] = await db.query(`
        SELECT id, session_id, ip_address, device_type, operating_system, browser,
               latitude, longitude, accuracy, permission_status, capture_status,
               location_source, captured_at, login_at, logout_at, session_status,
               is_unusual, unusual_reason, distance_from_last_km, review_status, investigation_notes
        FROM login_activities
        WHERE employee_id = ?
        ORDER BY login_at DESC
        LIMIT ? OFFSET ?
      `, [employeeId, limit, offset]);

      return res.json({
        success: true,
        employee: empRows[0],
        records: records.map(r => ({
          ...r,
          display_ip: normalizeIp(r.ip_address)
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
    } catch (err) {
      console.error('[LoginActivity] getEmployeeHistory error:', err);
      return res.status(500).json({ success: false, message: 'Server error retrieving employee history.' });
    }
  },

  /**
   * GET /api/login-activity/export
   * Admin endpoint: Exports all filtered login activity records as Excel (.xlsx) or CSV.
   */
  async exportRecords(req, res) {
    try {
      const adminId = req.user.id;
      const adminName = req.user.name;
      const {
        format = 'excel',
        search,
        employee_id,
        capture_status,
        device_type,
        session_status,
        is_unusual,
        review_status,
        from_date,
        to_date
      } = req.query;

      const conditions = [];
      const params = [];

      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(`(
          u.name LIKE ? OR 
          u.email LIKE ? OR 
          u.username LIKE ? OR 
          la.ip_address LIKE ? OR 
          la.device_type LIKE ? OR 
          la.operating_system LIKE ? OR 
          la.browser LIKE ? OR 
          la.session_id LIKE ?
        )`);
        params.push(term, term, term, term, term, term, term, term);
      }

      if (employee_id && employee_id !== 'all') {
        conditions.push('la.employee_id = ?');
        params.push(parseInt(employee_id, 10));
      }

      if (capture_status && capture_status !== 'all') {
        if (capture_status === 'captured') {
          conditions.push("la.capture_status = 'captured' AND la.latitude IS NOT NULL");
        } else if (capture_status === 'denied' || capture_status === 'permission_denied') {
          conditions.push("(la.capture_status = 'permission_denied' OR la.permission_status = 'denied')");
        } else if (capture_status === 'unavailable') {
          conditions.push("la.capture_status IN ('unavailable', 'timeout', 'error')");
        } else if (capture_status === 'pending') {
          conditions.push("la.capture_status = 'pending'");
        }
      }

      if (device_type && device_type !== 'all') {
        conditions.push('la.device_type = ?');
        params.push(device_type);
      }

      if (session_status && session_status !== 'all') {
        conditions.push('la.session_status = ?');
        params.push(session_status);
      }

      if (is_unusual === 'true' || is_unusual === '1') {
        conditions.push('la.is_unusual = 1');
      } else if (is_unusual === 'false' || is_unusual === '0') {
        conditions.push('la.is_unusual = 0');
      }

      if (review_status && review_status !== 'all') {
        conditions.push('la.review_status = ?');
        params.push(review_status);
      }

      if (from_date && from_date.trim()) {
        conditions.push('la.login_at >= CONCAT(?, " 00:00:00")');
        params.push(from_date.trim());
      }
      if (to_date && to_date.trim()) {
        conditions.push('la.login_at <= CONCAT(?, " 23:59:59")');
        params.push(to_date.trim());
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      let exportOrderBy = 'la.login_at DESC';
      if (is_unusual === 'true' || is_unusual === '1') {
        exportOrderBy = "CASE WHEN (la.review_status = 'Pending Review' OR la.review_status IS NULL) THEN 0 ELSE 1 END ASC, la.login_at DESC";
      }

      const [records] = await db.query(`
        SELECT la.id, la.employee_id, la.session_id, la.ip_address,
               la.device_type, la.operating_system, la.browser,
               la.latitude, la.longitude, la.accuracy,
               la.permission_status, la.capture_status, la.location_source,
               la.location_city, la.location_region, la.location_country,
               la.login_at, la.logout_at, la.session_status,
               la.is_unusual, la.unusual_reason, la.distance_from_last_km,
               la.review_status, la.reviewed_at, la.investigation_notes,
               u.name AS employee_name, u.email AS employee_email, u.department,
               reviewer.name AS reviewed_by_name
        FROM login_activities la
        JOIN users u ON la.employee_id = u.id
        LEFT JOIN users reviewer ON la.reviewed_by = reviewer.id
        ${whereClause}
        ORDER BY ${exportOrderBy}
        LIMIT 5000
      `, params);

      // Audit export
      const reqIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
      await logLocationAudit(
        adminId,
        adminName,
        `export_${format}`,
        null,
        null,
        reqIp,
        `Exported ${records.length} login activities as ${format.toUpperCase()}`
      );

      const rows = records.map((r, idx) => ({
        '#': idx + 1,
        'Record ID': r.id,
        'Employee ID': r.employee_id,
        'Employee Name': r.employee_name,
        'Employee Email': r.employee_email,
        'Department': r.department || 'Operations',
        'Login Timestamp': r.login_at ? new Date(r.login_at).toLocaleString('en-IN') : 'N/A',
        'Logout Timestamp': r.logout_at ? new Date(r.logout_at).toLocaleString('en-IN') : 'Active',
        'Session Status': r.session_status,
        'Session ID': r.session_id,
        'IP Address': normalizeIp(r.ip_address),
        'Device Type': r.device_type || 'Desktop',
        'Operating System': r.operating_system || 'Unknown',
        'Browser': r.browser || 'Unknown',
        'Permission Status': r.permission_status,
        'Capture Status': r.capture_status,
        'Location Source': r.location_source,
        'Latitude': r.latitude != null ? Number(r.latitude).toFixed(6) : 'N/A',
        'Longitude': r.longitude != null ? Number(r.longitude).toFixed(6) : 'N/A',
        'Accuracy (Meters)': r.accuracy != null ? Number(r.accuracy).toFixed(1) : 'N/A',
        'City / Region': [r.location_city, r.location_region].filter(Boolean).join(', ') || 'N/A',
        'Distance from Prev (km)': r.distance_from_last_km != null ? Number(r.distance_from_last_km).toFixed(1) : 'N/A',
        'Security Status': r.is_unusual ? 'Unusual' : 'Normal',
        'Unusual Reason': r.unusual_reason || 'N/A',
        'Security Review Status': r.review_status || 'N/A',
        'Reviewed By': r.reviewed_by_name || 'N/A',
        'Reviewed At': r.reviewed_at ? new Date(r.reviewed_at).toLocaleString('en-IN') : 'N/A',
        'Investigation Notes': r.investigation_notes || 'N/A'
      }));

      const dateStr = formatFilenameDate();

      if (format.toLowerCase() === 'csv') {
        const headers = Object.keys(rows[0] || { '#': 1 });
        const csvRows = [headers.join(',')];

        for (const row of rows) {
          const values = headers.map(h => {
            const val = row[h] == null ? '' : String(row[h]);
            return `"${val.replace(/"/g, '""')}"`;
          });
          csvRows.push(values.join(','));
        }

        const csvContent = '\uFEFF' + csvRows.join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="Dixit_Lending_Login_Activity_${dateStr}.csv"`);
        return res.send(csvContent);
      } else {
        // Excel format (.xlsx)
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        // Professional column widths
        ws['!cols'] = [
          { wch: 5 },  // #
          { wch: 10 }, // Record ID
          { wch: 12 }, // Employee ID
          { wch: 20 }, // Employee Name
          { wch: 28 }, // Employee Email
          { wch: 16 }, // Department
          { wch: 22 }, // Login Timestamp
          { wch: 22 }, // Logout Timestamp
          { wch: 14 }, // Session Status
          { wch: 38 }, // Session ID
          { wch: 22 }, // IP Address
          { wch: 14 }, // Device Type
          { wch: 18 }, // Operating System
          { wch: 16 }, // Browser
          { wch: 16 }, // Permission Status
          { wch: 16 }, // Capture Status
          { wch: 18 }, // Location Source
          { wch: 14 }, // Latitude
          { wch: 14 }, // Longitude
          { wch: 16 }, // Accuracy
          { wch: 20 }, // City / Region
          { wch: 22 }, // Distance from Prev
          { wch: 16 }, // Security Status
          { wch: 45 }, // Unusual Reason
          { wch: 20 }, // Review Status
          { wch: 18 }, // Reviewed By
          { wch: 22 }, // Reviewed At
          { wch: 40 }  // Investigation Notes
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Login Activities');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Dixit_Lending_Login_Activity_${dateStr}.xlsx"`);
        return res.send(buffer);
      }
    } catch (err) {
      console.error('[LoginActivity] exportRecords error:', err);
      return res.status(500).json({ success: false, message: 'Server error generating export.' });
    }
  },

  /**
   * GET /api/login-activity/audit-logs
   * Admin endpoint: retrieves the privacy and compliance audit trail of location views/exports.
   */
  async getAuditLogs(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 20));
      const offset = (page - 1) * limit;

      const [countRows] = await db.query('SELECT COUNT(*) AS total FROM location_audit_logs');
      const total = countRows[0].total;

      const [logs] = await db.query(`
        SELECT lal.*, u.name AS target_employee_name, u.email AS target_employee_email
        FROM location_audit_logs lal
        LEFT JOIN users u ON lal.target_employee_id = u.id
        ORDER BY lal.created_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      return res.json({
        success: true,
        logs: logs.map(l => ({
          ...l,
          display_ip: normalizeIp(l.ip_address)
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
    } catch (err) {
      console.error('[LoginActivity] getAuditLogs error:', err);
      return res.status(500).json({ success: false, message: 'Server error retrieving audit logs.' });
    }
  }
};

module.exports = loginActivityController;
