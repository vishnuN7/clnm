const db = require('../config/db');
const geolocationService = require('../services/geolocationService');

/**
 * Returns today's date in YYYY-MM-DD string in Asia/Kolkata timezone.
 */
function getTodayISTString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/**
 * Shifts a YYYY-MM-DD date string by a given number of days in Asia/Kolkata timezone.
 */
function shiftDaysIST(ymdStr, days) {
  const d = new Date(`${ymdStr}T00:00:00+05:30`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

/**
 * Helper to parse date filters. Default timeline is strictly 'today'.
 */
function resolveDateRange(dateRange, startDate, endDate) {
  const todayStr = getTodayISTString();

  let dateFrom, dateTo;

  if (dateRange === 'custom' && startDate && endDate) {
    dateFrom = startDate;
    dateTo = endDate;
  } else if (dateRange === 'yesterday') {
    dateFrom = dateTo = shiftDaysIST(todayStr, -1);
  } else if (dateRange === 'last7') {
    dateFrom = shiftDaysIST(todayStr, -6);
    dateTo = todayStr;
  } else if (dateRange === 'last30') {
    dateFrom = shiftDaysIST(todayStr, -29);
    dateTo = todayStr;
  } else if (dateRange === 'thisMonth') {
    dateFrom = `${todayStr.slice(0, 7)}-01`;
    dateTo = todayStr;
  } else {
    // Default timeline: Today
    dateFrom = dateTo = todayStr;
  }

  return { dateFrom, dateTo };
}

/**
 * Formats duration in seconds into a human-readable string: e.g. "1h 22m", "45m", "< 1m".
 */
function formatDurationHuman(seconds) {
  const sec = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);

  if (hrs === 0 && mins === 0) {
    return sec > 0 ? `${sec}s` : '0m';
  }
  if (hrs === 0) {
    return `${mins}m`;
  }
  if (mins === 0) {
    return `${hrs}h`;
  }
  return `${hrs}h ${mins}m`;
}

/**
 * Formats hours float into a human-readable string: e.g. 1.37 -> "1h 22m".
 */
function formatHoursHuman(hoursFloat) {
  const h = parseFloat(hoursFloat) || 0;
  if (h <= 0) return '0m';
  return formatDurationHuman(Math.round(h * 3600));
}

/**
 * Formats overtime hours: e.g. 0 -> "No overtime", 1.5 -> "+1h 30m".
 */
function formatOvertimeHuman(otFloat) {
  const ot = parseFloat(otFloat) || 0;
  if (ot <= 0) return 'No overtime';
  return `+${formatHoursHuman(ot)}`;
}

/**
 * Format decimal hour to 12-hour AM/PM string.
 */
function formatHourDecimal(h) {
  if (h === null || h === undefined || isNaN(h)) return '—';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ampm = hh < 12 ? 'AM' : 'PM';
  return `${String(hh % 12 || 12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
}

/**
 * Production-grade session & status reconciliation:
 * 1. Closes stale attendance logs where logout_time IS NULL (from past days or offline employees).
 * 2. Reconciles users.current_status to 'Offline' if heartbeat stopped > 15 mins ago.
 * 3. Auto-completes stale abandoned breaks (> 3 hours or from past days).
 */
async function reconcileStaleSessionsAndStatuses() {
  try {
    // 1. Reconcile Users table current_status:
    // If an employee is marked 'Available' or 'Idle' but their last_active_at was > 30 minutes ago,
    // they are definitely offline.
    await db.query(`
      UPDATE users 
      SET current_status = 'Offline' 
      WHERE role = 'employee' 
        AND current_status IN ('Available', 'Idle') 
        AND (last_active_at IS NULL OR last_active_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE))
    `);

    // 2. Auto-complete stale abandoned breaks (> 4 hours or from past days)
    await db.query(`
      UPDATE break_records br
      JOIN users u ON u.id = br.employee_id
      SET br.end_time = COALESCE(u.last_active_at, DATE_ADD(br.start_time, INTERVAL 30 MINUTE)),
          br.duration = GREATEST(60, TIMESTAMPDIFF(SECOND, br.start_time, COALESCE(u.last_active_at, DATE_ADD(br.start_time, INTERVAL 30 MINUTE)))),
          br.status = 'Completed'
      WHERE br.end_time IS NULL 
        AND (br.start_time < DATE_SUB(NOW(), INTERVAL 4 HOUR) OR DATE(CONVERT_TZ(br.start_time, '+00:00', '+05:30')) < CURDATE())
    `);

    // 3. Reconcile Attendance Logs open sessions:
    // Safely close only sessions from past days or where employee has been inactive > 45 minutes
    const [staleSessions] = await db.query(`
      SELECT al.id, al.employee_id, al.login_time, u.last_active_at, u.current_status
      FROM attendance_logs al
      JOIN users u ON u.id = al.employee_id
      WHERE al.logout_time IS NULL
        AND (
          DATE(CONVERT_TZ(al.login_time, '+00:00', '+05:30')) < CURDATE() 
          OR (u.current_status = 'Offline' AND u.last_active_at IS NOT NULL AND u.last_active_at < DATE_SUB(NOW(), INTERVAL 45 MINUTE))
          OR (u.last_active_at IS NULL AND al.login_time < DATE_SUB(NOW(), INTERVAL 60 MINUTE))
        )
    `);

    for (const session of staleSessions) {
      const loginTime = new Date(session.login_time);
      const now = new Date();
      let closeTime;

      if (session.last_active_at) {
        const lastActive = new Date(session.last_active_at);
        const diffMs = lastActive.getTime() - loginTime.getTime();
        if (diffMs >= 60 * 1000 && diffMs <= 12 * 3600 * 1000) {
          closeTime = lastActive;
        } else {
          // Prevent zero-second duration: credit up to 8 hours or now
          const isToday = (session.login_time.toISOString().slice(0, 10) === now.toISOString().slice(0, 10));
          closeTime = isToday ? now : new Date(Math.min(loginTime.getTime() + 8 * 3600 * 1000, now.getTime()));
        }
      } else {
        closeTime = new Date(Math.min(loginTime.getTime() + 8 * 3600 * 1000, now.getTime()));
      }

      const rawSec = Math.max(60, Math.floor((closeTime.getTime() - loginTime.getTime()) / 1000));
      const durationSec = Math.min(rawSec, 12 * 3600);
      closeTime = new Date(loginTime.getTime() + durationSec * 1000);
      const durationHours = Number((durationSec / 3600).toFixed(2));

      await db.query(`
        UPDATE attendance_logs 
        SET logout_time = ?, 
            total_working_hours = ?, 
            session_status = 'Logged Out' 
        WHERE id = ?
      `, [closeTime, durationHours, session.id]);
    }
  } catch (err) {
    console.error('[APR Reconcile Stale Sessions Error]:', err.message);
  }
}

const aprController = {
  // ── 1. Admin APR Dashboard Stats ───────────────────────────────
  async getAdminDashboardStats(req, res) {
    try {
      await reconcileStaleSessionsAndStatuses();

      const { dateRange, startDate, endDate } = req.query;
      const { dateFrom, dateTo } = resolveDateRange(dateRange, startDate, endDate);

      // Total Employees (exclude Admins)
      const [[totEmp]] = await db.query('SELECT COUNT(*) AS cnt FROM users WHERE role = "employee"');
      const totalEmployees = parseInt(totEmp.cnt, 10) || 0;

      // Present in date range: distinct employees who logged in between dateFrom and dateTo
      // NOTE: Do NOT filter u.is_active = 1, so auto-deactivated off-hours staff are not falsely hidden!
      const [[presentRes]] = await db.query(`
        SELECT COUNT(DISTINCT al.employee_id) AS cnt 
        FROM attendance_logs al
        JOIN users u ON u.id = al.employee_id
        WHERE u.role = "employee" 
          AND DATE(al.login_time) BETWEEN ? AND ?`,
        [dateFrom, dateTo]
      );
      const rawPresent = parseInt(presentRes?.cnt, 10) || 0;
      const presentToday = Math.min(rawPresent, totalEmployees);
      const absentToday = Math.max(0, totalEmployees - presentToday);

      // Current Online/Offline status (real-time heartbeat verification)
      const now = Date.now();
      const [employees] = await db.query(
        'SELECT id, current_status, last_active_at, auto_deactivated, manual_override FROM users WHERE role = "employee"'
      );

      let onlineCount = 0;
      let offlineCount = 0;
      let onBreakCount = 0;

      employees.forEach(emp => {
        let status = emp.current_status || 'Offline';

        // Heartbeat verification: if marked Available/Idle but last active > 2 mins ago, mark Offline
        if (status !== 'On Break' && status !== 'Offline') {
          if (!emp.last_active_at || (now - new Date(emp.last_active_at).getTime() > 120 * 1000)) {
            status = 'Offline';
          }
        } else if (status === 'On Break') {
          // If on break but no heartbeat in 30 mins, mark offline
          if (!emp.last_active_at || (now - new Date(emp.last_active_at).getTime() > 30 * 60 * 1000)) {
            status = 'Offline';
          }
        }

        if (status === 'Available' || status === 'Idle') {
          onlineCount++;
        } else if (status === 'On Break') {
          onBreakCount++;
        } else {
          offlineCount++;
        }
      });

      // Distinct employees logged in and logged out in date range (or latest date in range)
      const [[loggedInRes]] = await db.query(`
        SELECT COUNT(DISTINCT al.employee_id) AS cnt 
        FROM attendance_logs al
        JOIN users u ON u.id = al.employee_id
        WHERE u.role = "employee" AND DATE(al.login_time) = ?`,
        [dateTo]
      );
      const loggedInToday = parseInt(loggedInRes?.cnt, 10) || 0;

      const [[loggedOutRes]] = await db.query(`
        SELECT COUNT(DISTINCT al.employee_id) AS cnt 
        FROM attendance_logs al
        JOIN users u ON u.id = al.employee_id
        WHERE u.role = "employee" AND al.logout_time IS NOT NULL AND DATE(al.logout_time) = ?`,
        [dateTo]
      );
      const loggedOutToday = parseInt(loggedOutRes?.cnt, 10) || 0;

      // Active Sessions: strictly verified live sessions from today
      const [[activeSessionsRes]] = await db.query(`
        SELECT COUNT(DISTINCT al.id) AS cnt 
        FROM attendance_logs al
        JOIN users u ON u.id = al.employee_id
        WHERE u.role = "employee" 
          AND al.logout_time IS NULL 
          AND DATE(al.login_time) = CURDATE()
          AND u.current_status != 'Offline'
          AND u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)`
      );
      const activeSessions = parseInt(activeSessionsRes?.cnt, 10) || 0;

      // Aggregated gross session seconds and break seconds in date range
      // Working Hours = Session Time - Break Time (strictly capped at 12 hours per session)
      const [sessions] = await db.query(`
        SELECT
          al.employee_id,
          MIN(al.login_time) AS first_login,
          MAX(CASE WHEN al.logout_time IS NOT NULL THEN al.logout_time END) AS last_logout,
          SUM(
            CASE
              WHEN al.logout_time IS NOT NULL 
                THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, al.logout_time), 12 * 3600))
              WHEN DATE(al.login_time) = CURDATE() AND u.current_status != 'Offline' AND u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, NOW()), 12 * 3600))
              ELSE 
                GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, COALESCE(u.last_active_at, al.login_time)), 12 * 3600))
            END
          ) AS gross_seconds
        FROM attendance_logs al
        JOIN users u ON u.id = al.employee_id
        WHERE u.role = "employee" 
          AND DATE(al.login_time) BETWEEN ? AND ?
        GROUP BY al.employee_id`,
        [dateFrom, dateTo]
      );

      // Breaks taken in the date range
      const [breaksRows] = await db.query(`
        SELECT 
          employee_id,
          COALESCE(SUM(duration), 0) AS break_seconds
        FROM break_records
        WHERE DATE(start_time) BETWEEN ? AND ?
          AND duration IS NOT NULL
        GROUP BY employee_id`,
        [dateFrom, dateTo]
      );
      const breaksMap = {};
      breaksRows.forEach(b => { breaksMap[b.employee_id] = parseInt(b.break_seconds, 10) || 0; });

      let totalNetWorkingSec = 0;
      let loginTimes = [];
      let logoutTimes = [];

      sessions.forEach(s => {
        const grossSec = parseInt(s.gross_seconds, 10) || 0;
        const breakSec = breaksMap[s.employee_id] || 0;
        const netSec = Math.max(0, grossSec - breakSec);
        totalNetWorkingSec += netSec;

        if (s.first_login) {
          const d = new Date(s.first_login);
          loginTimes.push(d.getHours() + d.getMinutes() / 60);
        }
        if (s.last_logout) {
          const d = new Date(s.last_logout);
          logoutTimes.push(d.getHours() + d.getMinutes() / 60);
        }
      });

      const totalWorkingHrs = Number((totalNetWorkingSec / 3600).toFixed(2));
      const avgLoginHr = loginTimes.length ? loginTimes.reduce((a, b) => a + b, 0) / loginTimes.length : null;
      const avgLogoutHr = logoutTimes.length ? logoutTimes.reduce((a, b) => a + b, 0) / logoutTimes.length : null;
      const avgWorkingHours = presentToday > 0 ? (totalWorkingHrs / presentToday).toFixed(2) : '0.00';

      // Attendance Percentage (strictly capped at 100%)
      const cappedPresent = Math.min(presentToday, totalEmployees);
      const attendancePercentage = totalEmployees > 0 ? Number(((cappedPresent / totalEmployees) * 100).toFixed(1)) : 0;

      // Unverified/uncalibrated productivity score is explicitly null (UI renders "Not configured")
      const productivityScore = null;

      return res.json({
        success: true,
        data: {
          totalEmployees,
          presentToday,
          absentToday,
          employeesOnline: onlineCount,
          employeesOffline: offlineCount,
          loggedInToday,
          loggedOutToday,
          activeSessions,
          employeesOnBreak: onBreakCount,
          averageLoginTime: formatHourDecimal(avgLoginHr),
          averageLogoutTime: formatHourDecimal(avgLogoutHr),
          averageWorkingHours: parseFloat(avgWorkingHours),
          totalWorkingHoursToday: totalWorkingHrs,
          attendancePercentage,
          productivityScore
        }
      });
    } catch (err) {
      console.error('[APR DashboardStats Error]:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load dashboard stats.' });
    }
  },

  // ── 2. Live Employee Attendance Roster ─────────────────────────
  async getLiveAttendance(req, res) {
    try {
      await reconcileStaleSessionsAndStatuses();

      const { search = '', status = '', sortBy = 'employee_name', sortDir = 'asc' } = req.query;

      // Query ALL employees (both active and auto-deactivated so off-hours staff remain visible)
      let sql = `
        SELECT 
          u.id AS employee_id,
          u.name AS employee_name,
          u.current_status,
          u.last_active_at,
          u.auto_deactivated,
          u.manual_override,
          (SELECT MIN(login_time) FROM attendance_logs WHERE employee_id = u.id AND DATE(login_time) = CURDATE()) AS login_time,
          (SELECT MAX(logout_time) FROM attendance_logs WHERE employee_id = u.id AND DATE(login_time) = CURDATE() AND logout_time IS NOT NULL) AS logout_time,
          (SELECT session_status FROM attendance_logs WHERE employee_id = u.id ORDER BY id DESC LIMIT 1) AS session_status,
          (
            SELECT COALESCE(SUM(
              CASE 
                WHEN logout_time IS NOT NULL 
                  THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, login_time, logout_time), 12 * 3600))
                WHEN DATE(login_time) = CURDATE() AND u.current_status != 'Offline' AND u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                  THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, login_time, NOW()), 12 * 3600))
                ELSE 
                  GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, login_time, COALESCE(u.last_active_at, login_time)), 12 * 3600))
              END
            ), 0)
            FROM attendance_logs 
            WHERE employee_id = u.id AND DATE(login_time) = CURDATE()
          ) AS gross_working_seconds,
          (
            SELECT COALESCE(SUM(duration), 0)
            FROM break_records 
            WHERE employee_id = u.id AND DATE(start_time) = CURDATE() AND duration IS NOT NULL
          ) AS break_seconds,
          (
            SELECT COUNT(*) 
            FROM attendance_logs 
            WHERE employee_id = u.id 
              AND DATE(login_time) = CURDATE() 
              AND logout_time IS NULL 
              AND session_status = "Active Session"
          ) AS has_active_session_row
        FROM users u
        WHERE u.role = "employee"
      `;
      const params = [];

      if (search) {
        sql += ' AND (u.name LIKE ? OR CAST(u.id AS CHAR) LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      const [rows] = await db.query(sql, params);
      const now = Date.now();

      let list = rows.map(r => {
        let currentStatus = r.current_status || 'Offline';

        // Heartbeat verification: if Available or Idle but last heartbeat > 2 mins, mark offline
        if (currentStatus !== 'On Break' && currentStatus !== 'Offline') {
          if (!r.last_active_at || (now - new Date(r.last_active_at).getTime() > 120 * 1000)) {
            currentStatus = 'Offline';
          }
        }

        // Auto deactivation status override
        if (r.auto_deactivated === 1) {
          currentStatus = 'Auto Deactivated';
        } else if (r.manual_override === 1) {
          currentStatus = 'Manual Override';
        }

        let attStatus = 'Absent';
        if (r.login_time) {
          const firstLogin = new Date(r.login_time);
          const loginHr = firstLogin.getHours() + firstLogin.getMinutes() / 60;
          const LATE_THRESHOLD_HOUR = 9 + 20 / 60; // 9:20 AM (20-min grace period)
          attStatus = loginHr > LATE_THRESHOLD_HOUR ? 'Late' : 'Present';
        }

        // Net working hours = Gross session seconds - Break seconds
        const grossSec = parseInt(r.gross_working_seconds, 10) || 0;
        const breakSec = parseInt(r.break_seconds, 10) || 0;
        const netSec = Math.max(0, grossSec - breakSec);

        const workingHrs = Number((netSec / 3600).toFixed(2));
        const breakMins = Math.round(breakSec / 60);

        // Active session is true ONLY if user has an open session today AND is currently online
        const isOnline = (currentStatus === 'Available' || currentStatus === 'Idle' || currentStatus === 'On Break');
        const activeSession = (r.has_active_session_row > 0 && isOnline) ? 'Yes' : 'No';

        return {
          employee_id: r.employee_id,
          employee_name: r.employee_name,
          login_time: r.login_time,
          logout_time: r.logout_time,
          current_status: currentStatus,
          working_hours: workingHrs,
          break_time: breakMins,
          active_session: activeSession,
          last_activity: r.last_active_at,
          attendance_status: attStatus
        };
      });

      // Filter by status if specified
      if (status) {
        if (status === 'online') {
          list = list.filter(r => r.current_status === 'Available' || r.current_status === 'Idle' || r.current_status === 'On Break');
        } else if (status === 'offline') {
          list = list.filter(r => r.current_status === 'Offline');
        } else {
          list = list.filter(r => r.current_status.toLowerCase() === status.toLowerCase());
        }
      }

      // Sort
      const dir = sortDir === 'desc' ? -1 : 1;
      list.sort((a, b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];
        if (valA == null) return 1;
        if (valB == null) return -1;
        return valA < valB ? -dir : valA > valB ? dir : 0;
      });

      return res.json({ success: true, data: list });
    } catch (err) {
      console.error('[APR LiveAttendance Error]:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load live attendance.' });
    }
  },

  // ── 3. Daily Login Report ──────────────────────────────────────
  async getDailyLoginReport(req, res) {
    try {
      await reconcileStaleSessionsAndStatuses();

      const { dateRange, startDate, endDate, search = '' } = req.query;
      const { dateFrom, dateTo } = resolveDateRange(dateRange, startDate, endDate);

      const OFFICE_START_HOUR = 9;
      const OFFICE_END_HOUR = 18;
      const STANDARD_HOURS = 8;

      let sessionSql = `
        SELECT
          u.id AS employee_id,
          u.name AS employee_name,
          DATE(al.login_time) AS work_date,
          MIN(al.login_time) AS first_login,
          MAX(CASE WHEN al.logout_time IS NOT NULL THEN al.logout_time END) AS last_logout,
          COUNT(al.id) AS total_sessions,
          SUM(
            CASE
              WHEN al.logout_time IS NOT NULL 
                THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, al.logout_time), 12 * 3600))
              WHEN DATE(al.login_time) = CURDATE() AND u.current_status != 'Offline' AND u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, NOW()), 12 * 3600))
              ELSE 
                GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, COALESCE(u.last_active_at, al.login_time)), 12 * 3600))
            END
          ) AS gross_seconds
        FROM attendance_logs al
        JOIN users u ON u.id = al.employee_id
        WHERE u.role = "employee" 
          AND DATE(al.login_time) BETWEEN ? AND ?
      `;
      const sessionParams = [dateFrom, dateTo];

      if (search) {
        sessionSql += ' AND (u.name LIKE ? OR CAST(u.id AS CHAR) LIKE ?)';
        sessionParams.push(`%${search}%`, `%${search}%`);
      }

      sessionSql += `
        GROUP BY
          u.id,
          u.name,
          DATE(al.login_time)
      `;

      const sql = `
        SELECT
          sessions.employee_id,
          sessions.employee_name,
          sessions.work_date,
          sessions.first_login,
          sessions.last_logout,
          sessions.total_sessions,
          sessions.gross_seconds,
          COALESCE(breaks.total_break_seconds, 0) AS total_break_seconds
        FROM (${sessionSql}) sessions
        LEFT JOIN (
          SELECT
            employee_id,
            DATE(start_time) AS work_date,
            COALESCE(SUM(duration), 0) AS total_break_seconds
          FROM break_records
          WHERE DATE(start_time) BETWEEN ? AND ?
            AND duration IS NOT NULL
          GROUP BY employee_id, DATE(start_time)
        ) breaks
          ON breaks.employee_id = sessions.employee_id
         AND breaks.work_date = sessions.work_date
        ORDER BY sessions.work_date DESC, sessions.employee_name ASC
      `;
      const params = [...sessionParams, dateFrom, dateTo];

      const [rows] = await db.query(sql, params);

      const result = rows.map(r => {
        const firstLogin = r.first_login ? new Date(r.first_login) : null;
        const loginHr = firstLogin ? firstLogin.getHours() + firstLogin.getMinutes() / 60 : null;
        const lastLogout = r.last_logout ? new Date(r.last_logout) : null;
        const logoutHr = lastLogout ? lastLogout.getHours() + lastLogout.getMinutes() / 60 : null;

        const lateLogin = loginHr !== null && loginHr > (OFFICE_START_HOUR + 20 / 60) ? 'Yes' : 'No';
        const earlyLogout = lastLogout && logoutHr !== null && logoutHr < OFFICE_END_HOUR ? 'Yes' : 'No';

        // Net working hours = Gross session seconds - Break seconds
        const grossSec = parseInt(r.gross_seconds, 10) || 0;
        const breakSec = parseInt(r.total_break_seconds, 10) || 0;
        const netSec = Math.max(0, grossSec - breakSec);

        const workingHrs = Number((netSec / 3600).toFixed(2));
        const overtime = Math.max(0, workingHrs - STANDARD_HOURS);
        const breakMins = Math.round(breakSec / 60);

        return {
          employee_id: r.employee_id,
          employee_name: r.employee_name,
          work_date: r.work_date,
          login_time: r.first_login,
          logout_time: r.last_logout,
          total_sessions: r.total_sessions,
          total_working_hours: workingHrs,
          overtime: Number(overtime.toFixed(2)),
          break_duration: breakMins,
          late_login: lateLogin,
          early_logout: earlyLogout
        };
      });

      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('[APR DailyReport Error]:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load daily login report.' });
    }
  },

  // ── 4. Employee Login History Logs ─────────────────────────────
  async getLoginHistory(req, res) {
    try {
      await reconcileStaleSessionsAndStatuses();

      const { dateRange, startDate, endDate, search = '' } = req.query;
      const { dateFrom, dateTo } = resolveDateRange(dateRange, startDate, endDate);

      let sql = `
        SELECT
          al.id,
          al.employee_id,
          u.name AS employee_name,
          DATE(al.login_time) AS login_date,
          al.login_time,
          al.logout_time,
          al.session_status,
          al.ip_address,
          al.browser,
          al.device,
          al.os,
          al.location_city,
          al.location_region,
          al.location_country,
          al.location_country_code,
          al.location_isp,
          al.latitude,
          al.longitude,
          ROUND(
            (
              CASE 
                WHEN al.logout_time IS NOT NULL 
                  THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, al.logout_time), 12 * 3600))
                WHEN DATE(al.login_time) = CURDATE() AND u.current_status != 'Offline' AND u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                  THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, NOW()), 12 * 3600))
                ELSE 
                  GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, COALESCE(u.last_active_at, al.login_time)), 12 * 3600))
              END
            ) / 3600.0, 2
          ) AS session_duration,
          (
            CASE 
              WHEN al.logout_time IS NOT NULL 
                THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, al.logout_time), 12 * 3600))
              WHEN DATE(al.login_time) = CURDATE() AND u.current_status != 'Offline' AND u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, NOW()), 12 * 3600))
              ELSE 
                GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, COALESCE(u.last_active_at, al.login_time)), 12 * 3600))
            END
          ) AS session_duration_seconds
        FROM attendance_logs al
        JOIN users u ON u.id = al.employee_id
        WHERE u.role = "employee" 
          AND DATE(al.login_time) BETWEEN ? AND ?
      `;
      const params = [dateFrom, dateTo];

      if (search) {
        sql += ' AND (u.name LIKE ? OR CAST(u.id AS CHAR) LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      sql += ' ORDER BY al.login_time DESC LIMIT 250';

      const [rows] = await db.query(sql, params);

      // Collect IPs that need geolocation resolution
      const ipsToResolve = [];
      for (const r of rows) {
        const ip = r.ip_address;
        if (!ip) continue;
        if (geolocationService.isLocalhost(ip) || geolocationService.isPrivateIp(ip)) continue;
        if (!r.location_country && !r.location_city) {
          ipsToResolve.push(ip);
        }
      }

      let resolvedIpsMap = new Map();
      if (ipsToResolve.length > 0) {
        try {
          resolvedIpsMap = await geolocationService.resolveMultipleIps(ipsToResolve);
        } catch (batchErr) {
          console.warn('[APR LoginHistory] Batch GeoIP resolution error:', batchErr.message);
        }
      }

      const formattedRows = rows.map(r => {
        const isLocal = geolocationService.isLocalhost(r.ip_address);
        const isPriv = geolocationService.isPrivateIp(r.ip_address);

        let locStr = null;
        let isp = r.location_isp;
        let lat = r.latitude != null ? Number(r.latitude) : null;
        let lon = r.longitude != null ? Number(r.longitude) : null;

        if (isLocal) {
          locStr = 'Localhost / Development';
        } else if (isPriv) {
          locStr = 'Private Network / LAN';
        } else if (r.location_country || r.location_city || r.location_region) {
          locStr = geolocationService.formatLocationName({
            city: r.location_city,
            region: r.location_region,
            country: r.location_country
          });
        } else if (r.ip_address && resolvedIpsMap.has(r.ip_address)) {
          const resolved = resolvedIpsMap.get(r.ip_address);
          locStr = resolved.location;
          isp = resolved.isp || isp;
          lat = resolved.latitude != null ? resolved.latitude : lat;
          lon = resolved.longitude != null ? resolved.longitude : lon;
        } else {
          locStr = 'Location unavailable';
        }

        const durSec = parseInt(r.session_duration_seconds, 10) || 0;
        const durHuman = formatDurationHuman(durSec);

        return {
          ...r,
          session_duration_human: durHuman,
          location: locStr,
          location_isp: isp,
          latitude: lat,
          longitude: lon,
          is_localhost: isLocal,
          is_private: isPriv
        };
      });

      return res.json({
        success: true,
        data: formattedRows
      });
    } catch (err) {
      console.error('[APR LoginHistory Error]:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load login history.' });
    }
  },

  // ── 5. Attendance Analytics & Visual Charts ─────────────────────
  async getAttendanceAnalytics(req, res) {
    try {
      await reconcileStaleSessionsAndStatuses();

      const { dateRange, startDate, endDate } = req.query;
      const { dateFrom, dateTo } = resolveDateRange(dateRange, startDate, endDate);

      // Build daily trend labels for the resolved date range (or past 7 days if range is today)
      let trendLabels = [];
      const pad = n => String(n).padStart(2, '0');

      if (dateFrom === dateTo) {
        // For a single day, provide context of the 7 days ending on that day
        const targetDate = new Date(`${dateTo}T00:00:00+05:30`);
        for (let i = 6; i >= 0; i--) {
          const d = new Date(targetDate);
          d.setDate(d.getDate() - i);
          trendLabels.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
        }
      } else {
        // Multi-day range: generate day sequence (capped at 31 days)
        const dStart = new Date(`${dateFrom}T00:00:00+05:30`);
        const dEnd = new Date(`${dateTo}T00:00:00+05:30`);
        const cur = new Date(dStart);
        while (cur <= dEnd && trendLabels.length < 31) {
          trendLabels.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
          cur.setDate(cur.getDate() + 1);
        }
      }

      const minDate = trendLabels[0];
      const maxDate = trendLabels[trendLabels.length - 1];

      // Total employees (exclude Admins)
      const [[totEmp]] = await db.query('SELECT COUNT(*) AS count FROM users WHERE role = "employee"');
      const totalEmployees = parseInt(totEmp?.count, 10) || 0;

      const [trendRows] = await db.query(`
        SELECT
          DATE(al.login_time) AS day,
          COUNT(DISTINCT al.employee_id) AS cnt,
          ROUND(
            AVG(
              CASE 
                WHEN al.logout_time IS NOT NULL 
                  THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, al.logout_time), 12 * 3600))
                WHEN DATE(al.login_time) = CURDATE() AND u.current_status != 'Offline' AND u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                  THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, NOW()), 12 * 3600))
                ELSE 
                  GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, COALESCE(u.last_active_at, al.login_time)), 12 * 3600))
              END
            ) / 3600.0, 2
          ) AS avg_work
        FROM attendance_logs al
        JOIN users u ON u.id = al.employee_id
        WHERE u.role = "employee" 
          AND DATE(al.login_time) BETWEEN ? AND ?
        GROUP BY day`,
        [minDate, maxDate]
      );

      const trendMap = {};
      trendRows.forEach(r => { trendMap[String(r.day)] = r; });

      const presentTrend = trendLabels.map(d => parseInt(trendMap[d]?.cnt, 10) || 0);
      const avgWorkHoursTrend = trendLabels.map(d => parseFloat(trendMap[d]?.avg_work) || 0);
      const absentTrend = presentTrend.map(p => Math.max(0, totalEmployees - p));

      // Present vs Absent on dateTo
      const presentToday = presentTrend[presentTrend.length - 1] || 0;
      const absentToday = Math.max(0, totalEmployees - presentToday);

      // Online vs Offline real-time counts
      const now = Date.now();
      const [employees] = await db.query('SELECT id, current_status, last_active_at FROM users WHERE role = "employee"');
      let online = 0, offline = 0;

      employees.forEach(emp => {
        let status = emp.current_status || 'Offline';
        if (status !== 'On Break' && status !== 'Offline') {
          if (!emp.last_active_at || (now - new Date(emp.last_active_at).getTime() > 120 * 1000)) {
            status = 'Offline';
          }
        }
        if (status === 'Available' || status === 'Idle' || status === 'On Break') {
          online++;
        } else {
          offline++;
        }
      });

      return res.json({
        success: true,
        data: {
          labels: trendLabels,
          presentTrend,
          absentTrend,
          avgWorkHoursTrend,
          ratios: {
            present: presentToday,
            absent: absentToday,
            online,
            offline
          }
        }
      });
    } catch (err) {
      console.error('[APR Analytics Error]:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load attendance analytics.' });
    }
  },

  // ── 6. Employee Performance Scorecard ──────────────────────────
  async getPerformanceReport(req, res) {
    try {
      const { dateRange, startDate, endDate, search = '' } = req.query;
      const { dateFrom, dateTo } = resolveDateRange(dateRange, startDate, endDate);

      let sql = `
        SELECT
          u.id AS employee_id,
          u.name AS employee_name,
          (
            SELECT COUNT(*) FROM customers 
            WHERE added_by = u.id AND DATE(created_at) BETWEEN ? AND ?
          ) AS customers_added,
          (
            SELECT COUNT(*) FROM loans 
            WHERE applied_by = u.id AND DATE(created_at) BETWEEN ? AND ?
          ) AS loans_submitted,
          (
            SELECT COUNT(*) FROM loans 
            WHERE applied_by = u.id AND status = "Approved" AND DATE(created_at) BETWEEN ? AND ?
          ) AS loans_approved,
          (
            SELECT COUNT(*) FROM loans 
            WHERE applied_by = u.id AND status = "Rejected" AND DATE(created_at) BETWEEN ? AND ?
          ) AS loans_rejected,
          (
            SELECT COUNT(*) FROM loans 
            WHERE applied_by = u.id AND status = "Pending" AND DATE(created_at) BETWEEN ? AND ?
          ) AS loans_pending,
          (
            SELECT COUNT(*) FROM loans 
            WHERE applied_by = u.id AND status = "Loan Disbursed" AND DATE(created_at) BETWEEN ? AND ?
          ) AS loans_disbursed,
          (
            SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, updated_at)) FROM loans
            WHERE applied_by = u.id AND status != "Pending" AND DATE(created_at) BETWEEN ? AND ?
          ) AS avg_processing_hours,
          (
            SELECT COUNT(DISTINCT DATE(login_time))
            FROM attendance_logs
            WHERE employee_id = u.id AND DATE(login_time) BETWEEN ? AND ?
          ) AS present_days
        FROM users u
        WHERE u.role = "employee"
      `;

      const params = [
        dateFrom, dateTo, // customers
        dateFrom, dateTo, // loans submitted
        dateFrom, dateTo, // approved
        dateFrom, dateTo, // rejected
        dateFrom, dateTo, // pending
        dateFrom, dateTo, // disbursed
        dateFrom, dateTo, // processing hours
        dateFrom, dateTo  // present days
      ];

      if (search) {
        sql += ' AND u.name LIKE ?';
        params.push(`%${search}%`);
      }

      const [rows] = await db.query(sql, params);

      // Compute total days in range
      const tFrom = new Date(`${dateFrom}T00:00:00+05:30`);
      const tTo = new Date(`${dateTo}T00:00:00+05:30`);
      const diffTime = Math.abs(tTo - tFrom);
      const totalDaysInRange = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);

      const report = rows.map(r => {
        const submitted = parseInt(r.loans_submitted, 10) || 0;
        const approved = parseInt(r.loans_approved, 10) || 0;
        const disbursed = parseInt(r.loans_disbursed, 10) || 0;
        const customers = parseInt(r.customers_added, 10) || 0;
        const present = parseInt(r.present_days, 10) || 0;

        const conversion = submitted > 0 ? Math.round(((approved + disbursed) / submitted) * 100) : 0;
        const attendance = Math.min(100, Math.round((present / totalDaysInRange) * 100));
        const avgProcessing = r.avg_processing_hours ? Number(parseFloat(r.avg_processing_hours).toFixed(1)) : 0;

        return {
          employee_id: r.employee_id,
          employee_name: r.employee_name,
          customers_added: customers,
          loans_submitted: submitted,
          loans_approved: approved,
          loans_rejected: parseInt(r.loans_rejected, 10) || 0,
          loans_pending: parseInt(r.loans_pending, 10) || 0,
          loans_disbursed: disbursed,
          conversion_rate: conversion,
          avg_processing_time: avgProcessing,
          // Uncalibrated mathematical scoring model is explicitly null (renders "Not configured")
          productivity_score: null,
          attendance_score: attendance
        };
      });

      return res.json({ success: true, data: report });
    } catch (err) {
      console.error('[APR PerformanceReport Error]:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load performance report.' });
    }
  },

  // ── 7. Break Analytics ─────────────────────────────────────────
  async getBreakAnalytics(req, res) {
    try {
      const { dateRange, startDate, endDate } = req.query;
      const { dateFrom, dateTo } = resolveDateRange(dateRange, startDate, endDate);

      // Completed breaks query
      const [completedRows] = await db.query(`
        SELECT 
          break_type,
          COUNT(*) AS count,
          COALESCE(SUM(duration), 0) AS total_duration,
          COALESCE(MAX(duration), 0) AS longest_duration,
          COALESCE(MIN(duration), 0) AS shortest_duration
        FROM break_records
        WHERE DATE(start_time) BETWEEN ? AND ?
          AND duration IS NOT NULL
        GROUP BY break_type`,
        [dateFrom, dateTo]
      );

      // Active breaks in progress right now
      const [activeRows] = await db.query(`
        SELECT 
          break_type,
          COUNT(*) AS count,
          COALESCE(SUM(TIMESTAMPDIFF(SECOND, start_time, NOW())), 0) AS active_duration
        FROM break_records
        WHERE DATE(start_time) BETWEEN ? AND ?
          AND end_time IS NULL
        GROUP BY break_type`,
        [dateFrom, dateTo]
      );

      const summary = {
        teaCount: 0,
        lunchCount: 0,
        personalCount: 0,
        meetingCount: 0,
        otherCount: 0,
        completedBreaks: 0,
        activeBreaks: 0,
        totalBreaks: 0,
        totalDurationSec: 0,
        longestSec: 0,
        shortestSec: 999999
      };

      completedRows.forEach(r => {
        const count = parseInt(r.count, 10) || 0;
        const dur = parseInt(r.total_duration, 10) || 0;
        summary.completedBreaks += count;
        summary.totalBreaks += count;
        summary.totalDurationSec += dur;

        if (r.longest_duration > summary.longestSec) {
          summary.longestSec = r.longest_duration;
        }
        if (r.shortest_duration < summary.shortestSec) {
          summary.shortestSec = r.shortest_duration;
        }

        const type = String(r.break_type || '').toLowerCase();
        if (type.includes('tea')) summary.teaCount += count;
        else if (type.includes('lunch')) summary.lunchCount += count;
        else if (type.includes('personal')) summary.personalCount += count;
        else if (type.includes('meeting')) summary.meetingCount += count;
        else summary.otherCount += count;
      });

      activeRows.forEach(r => {
        const count = parseInt(r.count, 10) || 0;
        const dur = parseInt(r.active_duration, 10) || 0;
        summary.activeBreaks += count;
        summary.totalBreaks += count;
        summary.totalDurationSec += dur;

        const type = String(r.break_type || '').toLowerCase();
        if (type.includes('tea')) summary.teaCount += count;
        else if (type.includes('lunch')) summary.lunchCount += count;
        else if (type.includes('personal')) summary.personalCount += count;
        else if (type.includes('meeting')) summary.meetingCount += count;
        else summary.otherCount += count;
      });

      if (summary.shortestSec === 999999) {
        summary.shortestSec = 0;
      }

      const avgBreakMin = summary.totalBreaks > 0
        ? Math.round((summary.totalDurationSec / summary.totalBreaks) / 60)
        : 0;

      return res.json({
        success: true,
        data: {
          teaCount: summary.teaCount,
          lunchCount: summary.lunchCount,
          personalCount: summary.personalCount,
          meetingCount: summary.meetingCount,
          otherCount: summary.otherCount,
          totalBreaks: summary.totalBreaks,
          activeBreaks: summary.activeBreaks,
          completedBreaks: summary.completedBreaks,
          averageBreakTime: avgBreakMin,
          totalBreakTime: Math.round(summary.totalDurationSec / 60),
          longestBreak: Math.round(summary.longestSec / 60),
          shortestBreak: Math.round(summary.shortestSec / 60)
        }
      });
    } catch (err) {
      console.error('[APR BreakAnalytics Error]:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load break analytics.' });
    }
  },

  // ── 8. Working Hours Summary ───────────────────────────────────
  async getWorkingHours(req, res) {
    try {
      await reconcileStaleSessionsAndStatuses();

      const { dateRange, startDate, endDate } = req.query;
      const { dateFrom, dateTo } = resolveDateRange(dateRange, startDate, endDate);

      const STANDARD_HOURS = 8;

      const [sessionRows] = await db.query(`
        SELECT
          ROUND(
            COALESCE(
              SUM(
                CASE
                  WHEN al.logout_time IS NOT NULL 
                    THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, al.logout_time), 12 * 3600))
                  WHEN DATE(al.login_time) = CURDATE() AND u.current_status != 'Offline' AND u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                    THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, NOW()), 12 * 3600))
                  ELSE 
                    GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, COALESCE(u.last_active_at, al.login_time)), 12 * 3600))
                END
              ), 0
            ) / 3600.0, 2
          ) AS gross_hours
        FROM attendance_logs al
        JOIN users u ON u.id = al.employee_id
        WHERE u.role = "employee" 
          AND DATE(al.login_time) BETWEEN ? AND ?`,
        [dateFrom, dateTo]
      );

      const [breakRows] = await db.query(`
        SELECT 
          ROUND(COALESCE(SUM(duration), 0) / 3600.0, 2) AS break_hours
        FROM break_records
        WHERE DATE(start_time) BETWEEN ? AND ?
          AND duration IS NOT NULL`,
        [dateFrom, dateTo]
      );

      const grossHrs = sessionRows.length > 0 ? parseFloat(sessionRows[0].gross_hours) || 0 : 0;
      const breakHrs = breakRows.length > 0 ? parseFloat(breakRows[0].break_hours) || 0 : 0;
      const productiveHrs = Math.max(0, grossHrs - breakHrs);
      const overtime = Math.max(0, productiveHrs - STANDARD_HOURS);
      const remaining = Math.max(0, STANDARD_HOURS - productiveHrs);

      return res.json({
        success: true,
        data: {
          loginHours: Number(grossHrs.toFixed(2)),
          productiveHours: Number(productiveHrs.toFixed(2)),
          idleHours: 0.0,
          totalWorkingHours: Number(productiveHrs.toFixed(2)),
          overtime: Number(overtime.toFixed(2)),
          remainingWorkingHours: Number(remaining.toFixed(2))
        }
      });
    } catch (err) {
      console.error('[APR WorkingHours Error]:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load working hours.' });
    }
  },

  // ── 9. Employee Leaderboard ────────────────────────────────────
  async getLeaderboard(req, res) {
    try {
      await reconcileStaleSessionsAndStatuses();

      const { dateRange, startDate, endDate } = req.query;
      const todayStr = getTodayISTString();
      // Default leaderboard range: current month to date
      let dateFrom = `${todayStr.slice(0, 7)}-01`;
      let dateTo = todayStr;

      if (dateRange) {
        const resolved = resolveDateRange(dateRange, startDate, endDate);
        dateFrom = resolved.dateFrom;
        dateTo = resolved.dateTo;
      }

      const [rows] = await db.query(`
        SELECT
          u.id AS employee_id,
          u.name AS employee_name,
          (
            SELECT COUNT(*) FROM customers 
            WHERE added_by = u.id AND DATE(created_at) BETWEEN ? AND ?
          ) AS customers_added,
          (
            SELECT COUNT(*) FROM loans 
            WHERE applied_by = u.id AND DATE(created_at) BETWEEN ? AND ?
          ) AS loans_submitted,
          (
            SELECT COUNT(*) FROM loans 
            WHERE applied_by = u.id AND status = "Loan Disbursed" AND DATE(created_at) BETWEEN ? AND ?
          ) AS loans_disbursed,
          (
            SELECT COUNT(DISTINCT DATE(login_time))
            FROM attendance_logs
            WHERE employee_id = u.id AND DATE(login_time) BETWEEN ? AND ?
          ) AS present_days,
          (
            SELECT COALESCE(SUM(
              CASE 
                WHEN logout_time IS NOT NULL 
                  THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, login_time, logout_time), 12 * 3600))
                WHEN DATE(login_time) = CURDATE() AND u.current_status != 'Offline' AND u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                  THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, login_time, NOW()), 12 * 3600))
                ELSE 
                  GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, login_time, COALESCE(u.last_active_at, login_time)), 12 * 3600))
              END
            ), 0)
            FROM attendance_logs
            WHERE employee_id = u.id AND DATE(login_time) BETWEEN ? AND ?
          ) AS gross_seconds,
          (
            SELECT COALESCE(SUM(duration), 0)
            FROM break_records
            WHERE employee_id = u.id AND DATE(start_time) BETWEEN ? AND ?
              AND duration IS NOT NULL
          ) AS break_seconds
        FROM users u
        WHERE u.role = "employee"`,
        [
          dateFrom, dateTo,
          dateFrom, dateTo,
          dateFrom, dateTo,
          dateFrom, dateTo,
          dateFrom, dateTo,
          dateFrom, dateTo
        ]
      );

      let list = rows.map(r => {
        const submitted = parseInt(r.loans_submitted, 10) || 0;
        const disbursed = parseInt(r.loans_disbursed, 10) || 0;
        const customers = parseInt(r.customers_added, 10) || 0;
        const present = parseInt(r.present_days, 10) || 0;

        const grossSec = parseInt(r.gross_seconds, 10) || 0;
        const breakSec = parseInt(r.break_seconds, 10) || 0;
        const netSec = Math.max(0, grossSec - breakSec);
        const workingHours = Number((netSec / 3600).toFixed(1));

        return {
          employee_name: r.employee_name,
          loans_disbursed: disbursed,
          loans_processed: submitted,
          customers_added: customers,
          present_days: present,
          working_hours: workingHours,
          // Uncalibrated mathematical scoring model is explicitly null (renders "Not configured")
          performance_score: null,
          productivity: null,
          attendance_score: null
        };
      });

      // Sort by verified activity: loans disbursed descending, then submitted, then present days
      list.sort((a, b) => {
        if (b.loans_disbursed !== a.loans_disbursed) return b.loans_disbursed - a.loans_disbursed;
        if (b.loans_processed !== a.loans_processed) return b.loans_processed - a.loans_processed;
        return b.present_days - a.present_days;
      });

      list = list.map((item, idx) => {
        let badge = '';
        if (idx === 0) badge = 'Gold';
        else if (idx === 1) badge = 'Silver';
        else if (idx === 2) badge = 'Bronze';
        return {
          rank: idx + 1,
          ...item,
          badge
        };
      });

      return res.json({ success: true, data: list });
    } catch (err) {
      console.error('[APR Leaderboard Error]:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load leaderboard.' });
    }
  },

  // ── 10. Live Break Monitoring ──────────────────────────────────
  async getLiveBreaks(req, res) {
    try {
      const [rows] = await db.query(`
        SELECT 
          employee_id,
          employee_name,
          break_type,
          start_time,
          end_time,
          duration,
          status,
          custom_reason AS remarks
        FROM break_records
        WHERE DATE(start_time) = CURDATE()
        ORDER BY start_time DESC`
      );

      const result = rows.map(r => {
        let durationMins = 0;
        if (r.duration) {
          durationMins = Math.round(r.duration / 60);
        } else {
          const elapsedSec = Math.floor((Date.now() - new Date(r.start_time).getTime()) / 1000);
          durationMins = Math.round(Math.max(0, elapsedSec) / 60);
        }

        return {
          employee_id: r.employee_id,
          employee_name: r.employee_name,
          break_type: r.break_type,
          start_time: r.start_time,
          end_time: r.end_time,
          duration: durationMins,
          status: r.status,
          remarks: r.remarks || '—'
        };
      });

      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('[APR LiveBreaks Error]:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load live break monitoring.' });
    }
  },

  // ── 11. Employee APR Dashboard ─────────────────────────────────
  async getEmployeeDashboard(req, res) {
    try {
      const employeeId = req.user.id;
      const todayStr = getTodayISTString();

      // Refresh activity timestamp on dashboard poll
      await db.query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [employeeId]).catch(() => {});

      const [[user]] = await db.query('SELECT current_status, last_active_at FROM users WHERE id = ? LIMIT 1', [employeeId]);
      if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

      // Find active attendance session from today
      const [[activeSession]] = await db.query(
        'SELECT login_time FROM attendance_logs WHERE employee_id = ? AND session_status = "Active Session" AND logout_time IS NULL AND DATE(login_time) = CURDATE() ORDER BY id DESC LIMIT 1',
        [employeeId]
      );

      // Today's gross session seconds and initial clock-in of the day
      const [[workingSecsRes]] = await db.query(`
        SELECT 
          SUM(
            CASE 
              WHEN logout_time IS NOT NULL 
                THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, login_time, logout_time), 12 * 3600))
              ELSE 
                GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, login_time, NOW()), 12 * 3600))
            END
          ) AS total_seconds,
          MIN(login_time) AS first_login_today
        FROM attendance_logs 
        WHERE employee_id = ? AND DATE(login_time) = CURDATE()`,
        [employeeId]
      );
      const grossWorkingSeconds = parseInt(workingSecsRes?.total_seconds, 10) || 0;
      const initialClockIn = workingSecsRes?.first_login_today || (activeSession ? activeSession.login_time : null);

      let sessionDuration = 0;
      if (initialClockIn && activeSession) {
        sessionDuration = Math.min(12 * 60, Math.max(0, Math.floor((Date.now() - new Date(initialClockIn).getTime()) / 60000)));
      }

      // Today's Total Break Time & Current Break Status
      const [todayBreaks] = await db.query(
        'SELECT * FROM break_records WHERE employee_id = ? AND DATE(start_time) = CURDATE() ORDER BY start_time ASC',
        [employeeId]
      );

      let totalBreakSec = 0;
      let activeBreak = null;
      let lastBreakStr = '—';

      todayBreaks.forEach(b => {
        if (b.end_time) {
          totalBreakSec += b.duration || 0;
        } else {
          activeBreak = b;
          const elapsed = Math.floor((Date.now() - new Date(b.start_time).getTime()) / 1000);
          totalBreakSec += Math.max(0, elapsed);
        }
      });

      if (todayBreaks.length > 0) {
        const last = todayBreaks[todayBreaks.length - 1];
        const startStr = new Date(last.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        const endStr = last.end_time
          ? new Date(last.end_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
          : 'In Progress';
        lastBreakStr = `${last.break_type} (${startStr} - ${endStr})`;
      }

      // Net working seconds today (gross session minus breaks)
      const netWorkingSeconds = Math.max(0, grossWorkingSeconds - totalBreakSec);
      const totalWorkingHours = Number((netWorkingSeconds / 3600).toFixed(2));

      // Resolve currentStatus: 'Working' | 'On Break' | 'Logged Out' | 'Not Logged In'
      let currentStatus = 'Not Logged In';
      if (activeBreak) {
        currentStatus = 'On Break';
      } else if (activeSession) {
        currentStatus = 'Working';
      } else if (grossWorkingSeconds > 0) {
        currentStatus = 'Logged Out';
      }

      return res.json({
        success: true,
        data: {
          currentStatus,
          loginTime: initialClockIn,
          firstLoginTime: initialClockIn,
          activeSessionLoginTime: activeSession ? activeSession.login_time : null,
          hasActiveSession: Boolean(activeSession),
          sessionDuration,
          totalWorkingHours,
          totalWorkingSeconds: netWorkingSeconds,
          grossWorkingSeconds,
          totalBreakTime: Math.round(totalBreakSec / 60),
          totalBreakSeconds: totalBreakSec,
          currentBreakStatus: activeBreak ? 'On Break' : (todayBreaks.length > 0 ? 'Break Completed' : 'Working'),
          lastBreakTaken: lastBreakStr,
          serverTime: new Date().toISOString(),
          activeBreak: activeBreak ? {
            id: activeBreak.id,
            break_type: activeBreak.break_type,
            start_time: activeBreak.start_time,
            server_time: new Date().toISOString()
          } : null
        }
      });
    } catch (err) {
      console.error('[APR EmployeeDashboard Error]:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load employee dashboard stats.' });
    }
  },

  // ── 12. Employee Break History ─────────────────────────────────
  async getEmployeeBreakHistory(req, res) {
    try {
      const employeeId = req.user.id;

      const [rows] = await db.query(`
        SELECT 
          id,
          DATE(start_time) AS date,
          break_type,
          start_time,
          end_time,
          duration,
          custom_reason AS remarks
        FROM break_records
        WHERE employee_id = ?
          AND start_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ORDER BY start_time DESC`,
        [employeeId]
      );

      const result = rows.map(r => {
        let durationStr = 'In Progress';
        if (r.duration !== null && r.duration !== undefined) {
          const mins = Math.floor(r.duration / 60);
          const secs = r.duration % 60;
          if (mins === 0) {
            durationStr = `${secs}s`;
          } else if (secs === 0) {
            durationStr = `${mins} min${mins === 1 ? '' : 's'}`;
          } else {
            durationStr = `${mins}m ${secs}s`;
          }
        }
        return {
          id: r.id,
          date: r.date,
          break_type: r.break_type,
          start_time: r.start_time,
          end_time: r.end_time,
          duration: durationStr,
          duration_seconds: r.duration,
          remarks: r.remarks && r.remarks.trim() ? r.remarks.trim() : '—'
        };
      });

      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('[APR EmployeeBreakHistory Error]:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load break history.' });
    }
  },

  // ── 13. Employee Attendance & Working Hours History ─────────────
  async getEmployeeAttendanceHistory(req, res) {
    try {
      const employeeId = req.user.id;
      const { dateRange, startDate, endDate } = req.query;
      const { dateFrom, dateTo } = resolveDateRange(dateRange, startDate, endDate);

      // Aggregated daily attendance summary for this employee
      const [rows] = await db.query(`
        SELECT
          DATE(al.login_time) AS work_date,
          MIN(al.login_time) AS first_login,
          MAX(al.logout_time) AS last_logout,
          COUNT(al.id) AS total_sessions,
          SUM(
            CASE 
              WHEN al.logout_time IS NOT NULL 
                THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, al.logout_time), 12 * 3600))
              WHEN DATE(al.login_time) = CURDATE()
                THEN GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, NOW()), 12 * 3600))
              ELSE 
                GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, al.login_time, COALESCE(al.logout_time, al.login_time)), 12 * 3600))
            END
          ) AS gross_seconds,
          SUM(CASE WHEN al.logout_time IS NULL AND al.session_status = 'Active Session' THEN 1 ELSE 0 END) AS active_sessions_count
        FROM attendance_logs al
        WHERE al.employee_id = ?
          AND DATE(al.login_time) BETWEEN ? AND ?
        GROUP BY DATE(al.login_time)
        ORDER BY work_date DESC`,
        [employeeId, dateFrom, dateTo]
      );

      // Query breaks for this employee in the same date range
      const [breakRows] = await db.query(`
        SELECT 
          DATE(start_time) AS work_date,
          COUNT(*) AS total_breaks,
          COALESCE(SUM(duration), 0) AS break_seconds
        FROM break_records
        WHERE employee_id = ?
          AND DATE(start_time) BETWEEN ? AND ?
        GROUP BY DATE(start_time)`,
        [employeeId, dateFrom, dateTo]
      );

      const breaksByDate = {};
      breakRows.forEach(b => {
        breaksByDate[String(b.work_date)] = b;
      });

      const STANDARD_HOURS = 8;
      const result = rows.map(r => {
        const b = breaksByDate[String(r.work_date)] || { total_breaks: 0, break_seconds: 0 };
        const grossSec = parseInt(r.gross_seconds, 10) || 0;
        const breakSec = parseInt(b.break_seconds, 10) || 0;
        const netSec = Math.max(0, grossSec - breakSec);
        const workingHours = Number((netSec / 3600).toFixed(2));
        const overtime = Math.max(0, Number((workingHours - STANDARD_HOURS).toFixed(2)));

        let status = 'Completed';
        if (r.active_sessions_count > 0) {
          status = 'Working';
        } else if (r.first_login) {
          const firstLogin = new Date(r.first_login);
          const loginHr = firstLogin.getHours() + firstLogin.getMinutes() / 60;
          status = loginHr > (9 + 20 / 60) ? 'Late' : 'Present';
        }

        return {
          work_date: r.work_date,
          first_login: r.first_login,
          last_logout: r.last_logout,
          total_sessions: r.total_sessions,
          gross_seconds: grossSec,
          break_seconds: breakSec,
          total_breaks: b.total_breaks,
          net_seconds: netSec,
          working_hours: workingHours,
          working_hours_human: formatHoursHuman(workingHours),
          overtime,
          overtime_human: formatOvertimeHuman(overtime),
          break_human: formatDurationHuman(breakSec),
          status
        };
      });

      return res.json({
        success: true,
        data: result,
        summary: {
          totalDays: result.length,
          totalWorkingHours: Number(result.reduce((acc, cur) => acc + cur.working_hours, 0).toFixed(2)),
          totalOvertimeHours: Number(result.reduce((acc, cur) => acc + cur.overtime, 0).toFixed(2)),
          dateFrom,
          dateTo
        }
      });
    } catch (err) {
      console.error('[APR EmployeeAttendanceHistory Error]:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load attendance history.' });
    }
  }
};

module.exports = aprController;
