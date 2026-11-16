const db = require('../config/db');

// ── URL Safety Validator ──────────────────────────────────────────────────
function validatePortalUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, message: 'Login URL is required.' };
  }
  const trimmed = urlStr.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (err) {
    return { valid: false, message: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, message: 'URL must use the secure HTTPS protocol (https://).' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, message: 'URL cannot contain embedded authentication credentials.' };
  }

  if (!parsed.hostname || !parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) {
    return { valid: false, message: 'URL must contain a valid domain hostname.' };
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('file:') || lower.startsWith('vbscript:')) {
    return { valid: false, message: 'Unsafe URL scheme detected.' };
  }

  return { valid: true, normalizedUrl: parsed.href };
}

// ── Audit Logger Helper ───────────────────────────────────────────────────
async function logAudit(adminId, actionType, targetType, targetId, details, req) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '') : '';
    const detailsStr = typeof details === 'object' ? JSON.stringify(details) : String(details || '');
    await db.query(
      `INSERT INTO banking_partner_audit_logs (admin_id, action_type, target_type, target_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [adminId, actionType, targetType, targetId, detailsStr, String(ip).slice(0, 45)]
    );
  } catch (err) {
    console.error('[BankingPartner Audit Error]:', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/banking-partners/admin/summary
 * Summary counts for admin cards
 */
exports.getAdminSummary = async (req, res) => {
  try {
    const [[totalRow]] = await db.query(
      'SELECT COUNT(*) AS total FROM banking_partner_portals WHERE deleted_at IS NULL'
    );
    const [[activeRow]] = await db.query(
      'SELECT COUNT(*) AS active FROM banking_partner_portals WHERE deleted_at IS NULL AND status = "Active"'
    );
    const [[inactiveRow]] = await db.query(
      'SELECT COUNT(*) AS inactive FROM banking_partner_portals WHERE deleted_at IS NULL AND status = "Inactive"'
    );
    const [[empRow]] = await db.query(
      `SELECT COUNT(DISTINCT epa.employee_id) AS employees_with_access
       FROM employee_portal_access epa
       JOIN users u ON u.id = epa.employee_id
       JOIN employee_bank_permissions ebp ON ebp.employee_id = epa.employee_id
       JOIN banking_partner_portals p ON p.id = ebp.portal_id
       WHERE epa.has_access = 1
         AND u.role = 'employee'
         AND u.is_active = 1
         AND ebp.is_allowed = 1
         AND p.status = 'Active'
         AND p.deleted_at IS NULL`
    );

    return res.json({
      success: true,
      summary: {
        totalPortals: Number(totalRow.total || 0),
        activePortals: Number(activeRow.active || 0),
        inactivePortals: Number(inactiveRow.inactive || 0),
        employeesWithAccess: Number(empRow.employees_with_access || 0)
      }
    });
  } catch (err) {
    console.error('[BankingPartner getAdminSummary error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve portal summary.' });
  }
};

/**
 * GET /api/banking-partners/admin/portals
 * List all portals for admin
 */
exports.getAdminPortals = async (req, res) => {
  try {
    const [portals] = await db.query(
      `SELECT id, name, location, login_url, description, logo_url, institution_type, status, display_order, created_at, updated_at
       FROM banking_partner_portals
       WHERE deleted_at IS NULL
       ORDER BY display_order ASC, name ASC`
    );

    return res.json({
      success: true,
      portals
    });
  } catch (err) {
    console.error('[BankingPartner getAdminPortals error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve banking portals.' });
  }
};

/**
 * POST /api/banking-partners/admin/portals
 * Create a new bank portal
 */
exports.createPortal = async (req, res) => {
  try {
    const adminId = req.user.id;
    let { name, location, login_url, description, logo_url, institution_type, status, display_order } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Bank/NBFC name is required.' });
    }
    name = name.trim();
    if (name.length > 150) {
      return res.status(400).json({ success: false, message: 'Bank/NBFC name cannot exceed 150 characters.' });
    }

    location = location && typeof location === 'string' && location.trim() ? location.trim().slice(0, 100) : null;

    const urlCheck = validatePortalUrl(login_url);
    if (!urlCheck.valid) {
      return res.status(400).json({ success: false, message: urlCheck.message });
    }
    login_url = urlCheck.normalizedUrl;

    institution_type = institution_type === 'NBFC' ? 'NBFC' : 'Bank';
    status = status === 'Inactive' ? 'Inactive' : 'Active';
    display_order = parseInt(display_order, 10);
    if (isNaN(display_order) || display_order < 0) display_order = 0;

    description = description ? String(description).trim() : null;
    logo_url = logo_url ? String(logo_url).trim() : null;

    const [result] = await db.query(
      `INSERT INTO banking_partner_portals 
       (name, location, login_url, description, logo_url, institution_type, status, display_order, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, location, login_url, description, logo_url, institution_type, status, display_order, adminId, adminId]
    );

    const portalId = result.insertId;

    await logAudit(adminId, 'PORTAL_CREATED', 'portal', portalId, {
      name,
      location,
      institution_type,
      status,
      display_order,
      login_url
    }, req);

    const [[portal]] = await db.query('SELECT * FROM banking_partner_portals WHERE id = ?', [portalId]);

    return res.status(201).json({
      success: true,
      message: 'Banking portal created successfully.',
      portal
    });
  } catch (err) {
    console.error('[BankingPartner createPortal error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to create banking portal.' });
  }
};

/**
 * PUT /api/banking-partners/admin/portals/:id
 * Update an existing bank portal
 */
exports.updatePortal = async (req, res) => {
  try {
    const adminId = req.user.id;
    const portalId = parseInt(req.params.id, 10);
    if (!portalId) {
      return res.status(400).json({ success: false, message: 'Invalid portal ID.' });
    }

    const [[existing]] = await db.query(
      'SELECT * FROM banking_partner_portals WHERE id = ? AND deleted_at IS NULL',
      [portalId]
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Banking portal not found.' });
    }

    let { name, location, login_url, description, logo_url, institution_type, status, display_order } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Bank/NBFC name is required.' });
    }
    name = name.trim();
    if (name.length > 150) {
      return res.status(400).json({ success: false, message: 'Bank/NBFC name cannot exceed 150 characters.' });
    }

    location = location && typeof location === 'string' && location.trim() ? location.trim().slice(0, 100) : null;

    const urlCheck = validatePortalUrl(login_url);
    if (!urlCheck.valid) {
      return res.status(400).json({ success: false, message: urlCheck.message });
    }
    login_url = urlCheck.normalizedUrl;

    institution_type = institution_type === 'NBFC' ? 'NBFC' : 'Bank';
    status = status === 'Inactive' ? 'Inactive' : 'Active';
    display_order = parseInt(display_order, 10);
    if (isNaN(display_order) || display_order < 0) display_order = 0;

    description = description ? String(description).trim() : null;
    logo_url = logo_url ? String(logo_url).trim() : existing.logo_url;

    await db.query(
      `UPDATE banking_partner_portals 
       SET name = ?, location = ?, login_url = ?, description = ?, logo_url = ?, institution_type = ?, status = ?, display_order = ?, updated_by = ?
       WHERE id = ?`,
      [name, location, login_url, description, logo_url, institution_type, status, display_order, adminId, portalId]
    );

    await logAudit(adminId, 'PORTAL_UPDATED', 'portal', portalId, {
      previous: {
        name: existing.name,
        location: existing.location,
        login_url: existing.login_url,
        institution_type: existing.institution_type,
        status: existing.status,
        display_order: existing.display_order
      },
      updated: {
        name,
        location,
        login_url,
        institution_type,
        status,
        display_order
      }
    }, req);

    const [[portal]] = await db.query('SELECT * FROM banking_partner_portals WHERE id = ?', [portalId]);

    return res.json({
      success: true,
      message: 'Banking portal updated successfully.',
      portal
    });
  } catch (err) {
    console.error('[BankingPartner updatePortal error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to update banking portal.' });
  }
};

/**
 * PATCH /api/banking-partners/admin/portals/:id/status
 * Toggle portal status (Active / Inactive)
 */
exports.updatePortalStatus = async (req, res) => {
  try {
    const adminId = req.user.id;
    const portalId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!portalId || !['Active', 'Inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid portal ID or status value.' });
    }

    const [[existing]] = await db.query(
      'SELECT id, name, status FROM banking_partner_portals WHERE id = ? AND deleted_at IS NULL',
      [portalId]
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Banking portal not found.' });
    }

    await db.query(
      'UPDATE banking_partner_portals SET status = ?, updated_by = ? WHERE id = ?',
      [status, adminId, portalId]
    );

    await logAudit(adminId, 'PORTAL_STATUS_CHANGED', 'portal', portalId, {
      portalName: existing.name,
      previousStatus: existing.status,
      newStatus: status
    }, req);

    return res.json({
      success: true,
      message: `Banking portal status set to ${status}.`,
      status
    });
  } catch (err) {
    console.error('[BankingPartner updatePortalStatus error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to update portal status.' });
  }
};

/**
 * DELETE /api/banking-partners/admin/portals/:id
 * Soft delete a bank portal
 */
exports.deletePortal = async (req, res) => {
  try {
    const adminId = req.user.id;
    const portalId = parseInt(req.params.id, 10);
    if (!portalId) {
      return res.status(400).json({ success: false, message: 'Invalid portal ID.' });
    }

    const [[existing]] = await db.query(
      'SELECT id, name FROM banking_partner_portals WHERE id = ? AND deleted_at IS NULL',
      [portalId]
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Banking portal not found or already removed.' });
    }

    await db.query(
      'UPDATE banking_partner_portals SET deleted_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?',
      [adminId, portalId]
    );

    await logAudit(adminId, 'PORTAL_DELETED', 'portal', portalId, {
      portalName: existing.name
    }, req);

    return res.json({
      success: true,
      message: `Banking portal "${existing.name}" has been safely archived.`
    });
  } catch (err) {
    console.error('[BankingPartner deletePortal error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete banking portal.' });
  }
};

/**
 * GET /api/banking-partners/admin/employees
 * List all employees with their portal access state & accessible bank counts
 */
exports.getAdminEmployees = async (req, res) => {
  try {
    // 1. Get total active portals count
    const [[activePortalsCountRow]] = await db.query(
      'SELECT COUNT(*) as count FROM banking_partner_portals WHERE deleted_at IS NULL AND status = "Active"'
    );
    const totalActivePortals = Number(activePortalsCountRow.count || 0);

    // 2. Fetch all employees
    const [employees] = await db.query(
      `SELECT u.id, u.name, u.email, u.is_active, u.created_at,
              COALESCE(epa.has_access, 0) AS has_portal_access,
              epa.updated_at AS access_updated_at
       FROM users u
       LEFT JOIN employee_portal_access epa ON epa.employee_id = u.id
       WHERE u.role = 'employee'
       ORDER BY u.name ASC`
    );

    // 3. Fetch allowed bank counts for employees
    const [permCounts] = await db.query(
      `SELECT ebp.employee_id, COUNT(*) AS allowed_count
       FROM employee_bank_permissions ebp
       JOIN banking_partner_portals p ON p.id = ebp.portal_id
       WHERE ebp.is_allowed = 1
         AND p.deleted_at IS NULL
         AND p.status = 'Active'
       GROUP BY ebp.employee_id`
    );

    const permMap = {};
    for (const row of permCounts) {
      permMap[row.employee_id] = Number(row.allowed_count || 0);
    }

    const employeeList = employees.map(emp => ({
      id: emp.id,
      name: emp.name,
      email: emp.email,
      is_active: emp.is_active === 1,
      has_portal_access: emp.has_portal_access === 1,
      accessible_banks_count: permMap[emp.id] || 0,
      total_active_portals: totalActivePortals,
      access_updated_at: emp.access_updated_at
    }));

    return res.json({
      success: true,
      employees: employeeList,
      totalActivePortals
    });
  } catch (err) {
    console.error('[BankingPartner getAdminEmployees error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve employees list.' });
  }
};

/**
 * GET /api/banking-partners/admin/employees/:id/permissions
 * Fetch per-bank permissions for a single employee
 */
exports.getEmployeeBankPermissions = async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id, 10);
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID.' });
    }

    const [[employee]] = await db.query(
      'SELECT id, name, email, is_active FROM users WHERE id = ? AND role = "employee"',
      [employeeId]
    );
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const [[accessRow]] = await db.query(
      'SELECT has_access FROM employee_portal_access WHERE employee_id = ?',
      [employeeId]
    );
    const hasPortalAccess = Boolean(accessRow && accessRow.has_access === 1);

    // Fetch active portals
    const [portals] = await db.query(
      `SELECT id, name, location, institution_type, logo_url, status, display_order
       FROM banking_partner_portals
       WHERE deleted_at IS NULL AND status = 'Active'
       ORDER BY display_order ASC, name ASC`
    );

    // Fetch existing permissions for this employee
    const [perms] = await db.query(
      'SELECT portal_id, is_allowed FROM employee_bank_permissions WHERE employee_id = ?',
      [employeeId]
    );
    const permMap = {};
    for (const p of perms) {
      permMap[p.portal_id] = p.is_allowed === 1;
    }

    const portalPermissions = portals.map(p => ({
      id: p.id,
      name: p.name,
      location: p.location || null,
      institution_type: p.institution_type,
      logo_url: p.logo_url,
      is_allowed: permMap[p.id] !== undefined ? permMap[p.id] : false
    }));

    return res.json({
      success: true,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        is_active: employee.is_active === 1
      },
      hasPortalAccess,
      portals: portalPermissions
    });
  } catch (err) {
    console.error('[BankingPartner getEmployeeBankPermissions error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve employee bank permissions.' });
  }
};

/**
 * PATCH /api/banking-partners/admin/employees/:id/portal-access
 * Toggle Level A portal access for an employee
 */
exports.updateEmployeePortalAccess = async (req, res) => {
  try {
    const adminId = req.user.id;
    const employeeId = parseInt(req.params.id, 10);
    const { has_access } = req.body;

    if (!employeeId || typeof has_access === 'undefined') {
      return res.status(400).json({ success: false, message: 'Employee ID and access state are required.' });
    }

    const [[employee]] = await db.query(
      'SELECT id, name, is_active FROM users WHERE id = ? AND role = "employee"',
      [employeeId]
    );
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const accessVal = has_access ? 1 : 0;

    await db.query(
      `INSERT INTO employee_portal_access (employee_id, has_access, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE has_access = VALUES(has_access), updated_by = VALUES(updated_by)`,
      [employeeId, accessVal, adminId]
    );

    const action = accessVal === 1 ? 'PORTAL_ACCESS_GRANTED' : 'PORTAL_ACCESS_REVOKED';
    await logAudit(adminId, action, 'permission', employeeId, {
      employeeId,
      employeeName: employee.name,
      has_access: accessVal === 1
    }, req);

    return res.json({
      success: true,
      message: `Banking Partner Portal access ${accessVal === 1 ? 'granted to' : 'revoked from'} ${employee.name}.`,
      has_access: accessVal === 1
    });
  } catch (err) {
    console.error('[BankingPartner updateEmployeePortalAccess error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to update employee portal access.' });
  }
};

/**
 * PUT /api/banking-partners/admin/employees/:id/bank-permissions
 * Update Level B individual bank permissions for an employee
 */
exports.updateEmployeeBankPermissions = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const adminId = req.user.id;
    const employeeId = parseInt(req.params.id, 10);
    const { permissions } = req.body; // Array of { portal_id, is_allowed }

    if (!employeeId || !Array.isArray(permissions)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID or permissions data.' });
    }

    const [[employee]] = await connection.query(
      'SELECT id, name FROM users WHERE id = ? AND role = "employee"',
      [employeeId]
    );
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    await connection.beginTransaction();

    for (const item of permissions) {
      const portalId = parseInt(item.portal_id, 10);
      const isAllowed = item.is_allowed ? 1 : 0;
      if (portalId) {
        await connection.query(
          `INSERT INTO employee_bank_permissions (employee_id, portal_id, is_allowed, updated_by)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE is_allowed = VALUES(is_allowed), updated_by = VALUES(updated_by)`,
          [employeeId, portalId, isAllowed, adminId]
        );
      }
    }

    await connection.commit();

    await logAudit(adminId, 'BANK_PERMISSIONS_UPDATED', 'permission', employeeId, {
      employeeId,
      employeeName: employee.name,
      permissionCount: permissions.length,
      allowedPortals: permissions.filter(p => p.is_allowed).map(p => p.portal_id)
    }, req);

    return res.json({
      success: true,
      message: `Bank permissions updated successfully for ${employee.name}.`
    });
  } catch (err) {
    await connection.rollback();
    console.error('[BankingPartner updateEmployeeBankPermissions error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to save bank permissions.' });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/banking-partners/admin/bulk-portal-access
 * Bulk grant or revoke portal access for multiple employees
 */
exports.bulkUpdatePortalAccess = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const adminId = req.user.id;
    const { employee_ids, has_access } = req.body;

    if (!Array.isArray(employee_ids) || employee_ids.length === 0 || typeof has_access === 'undefined') {
      return res.status(400).json({ success: false, message: 'employee_ids array and has_access boolean are required.' });
    }

    const accessVal = has_access ? 1 : 0;

    await connection.beginTransaction();

    for (const empId of employee_ids) {
      const id = parseInt(empId, 10);
      if (id) {
        await connection.query(
          `INSERT INTO employee_portal_access (employee_id, has_access, updated_by)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE has_access = VALUES(has_access), updated_by = VALUES(updated_by)`,
          [id, accessVal, adminId]
        );
      }
    }

    await connection.commit();

    await logAudit(adminId, 'BULK_ACCESS_UPDATED', 'bulk', null, {
      employee_count: employee_ids.length,
      employee_ids,
      has_access: accessVal === 1
    }, req);

    return res.json({
      success: true,
      message: `Banking portal access ${accessVal === 1 ? 'granted to' : 'revoked from'} ${employee_ids.length} employees.`
    });
  } catch (err) {
    await connection.rollback();
    console.error('[BankingPartner bulkUpdatePortalAccess error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to execute bulk update.' });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/banking-partners/admin/audit-logs
 * Paginated audit log retrieval
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const offset = (page - 1) * limit;

    const action = req.query.action ? String(req.query.action).trim() : '';
    const search = req.query.search ? String(req.query.search).trim() : '';
    const startDate = req.query.startDate ? String(req.query.startDate).trim() : '';
    const endDate = req.query.endDate ? String(req.query.endDate).trim() : '';
    const adminId = req.query.adminId ? parseInt(req.query.adminId, 10) : null;

    let whereClause = '1=1';
    const params = [];

    if (action) {
      whereClause += ' AND a.action_type = ?';
      params.push(action);
    }

    if (adminId) {
      whereClause += ' AND a.admin_id = ?';
      params.push(adminId);
    }

    if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      whereClause += ' AND a.created_at >= ?';
      params.push(`${startDate} 00:00:00`);
    }

    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      whereClause += ' AND a.created_at <= ?';
      params.push(`${endDate} 23:59:59`);
    }

    if (search) {
      whereClause += ' AND (a.details LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR a.ip_address LIKE ? OR a.action_type LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM banking_partner_audit_logs a
       LEFT JOIN users u ON u.id = a.admin_id
       WHERE ${whereClause}`,
      params
    );
    const total = Number(countRow.total || 0);

    const [logs] = await db.query(
      `SELECT a.id, a.admin_id, u.name AS admin_name, u.email AS admin_email,
              a.action_type, a.target_type, a.target_id, a.details, a.ip_address, a.created_at
       FROM banking_partner_audit_logs a
       LEFT JOIN users u ON u.id = a.admin_id
       WHERE ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Calculate overview statistics from actual audit records
    const [[statsRow]] = await db.query(
      `SELECT 
         COUNT(*) AS total_events,
         SUM(CASE WHEN a.action_type IN ('PORTAL_CREATED', 'PORTAL_UPDATED', 'PORTAL_STATUS_CHANGED', 'PORTAL_DELETED') THEN 1 ELSE 0 END) AS portal_events,
         SUM(CASE WHEN a.action_type IN ('PORTAL_ACCESS_GRANTED', 'PORTAL_ACCESS_REVOKED', 'BANK_PERMISSIONS_UPDATED', 'BULK_ACCESS_UPDATED') THEN 1 ELSE 0 END) AS access_events,
         COUNT(DISTINCT a.admin_id) AS active_admins
       FROM banking_partner_audit_logs a`
    );

    return res.json({
      success: true,
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats: {
        totalEvents: Number(statsRow?.total_events || 0),
        portalEvents: Number(statsRow?.portal_events || 0),
        accessEvents: Number(statsRow?.access_events || 0),
        activeAdmins: Number(statsRow?.active_admins || 0)
      }
    });
  } catch (err) {
    console.error('[BankingPartner getAuditLogs error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve audit logs.' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/banking-partners/employee/status
 * Check if the authenticated employee is authorized for the portal module
 */
exports.getEmployeeStatus = async (req, res) => {
  try {
    const employeeId = req.user.id;

    const [[user]] = await db.query(
      'SELECT id, is_active FROM users WHERE id = ? AND role = "employee"',
      [employeeId]
    );
    if (!user || user.is_active !== 1) {
      return res.json({ success: true, hasAccess: false });
    }

    const [[access]] = await db.query(
      'SELECT has_access FROM employee_portal_access WHERE employee_id = ?',
      [employeeId]
    );

    const hasAccess = Boolean(access && access.has_access === 1);
    return res.json({
      success: true,
      hasAccess
    });
  } catch (err) {
    console.error('[BankingPartner getEmployeeStatus error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to verify portal access.' });
  }
};

/**
 * GET /api/banking-partners/employee/portals
 * Authorized bank and NBFC portals for the logged-in employee
 */
exports.getEmployeePortals = async (req, res) => {
  try {
    const employeeId = req.user.id;

    // 1. Verify active employee
    const [[user]] = await db.query(
      'SELECT id, is_active FROM users WHERE id = ? AND role = "employee"',
      [employeeId]
    );
    if (!user || user.is_active !== 1) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated or not permitted.'
      });
    }

    // 2. Level A: Check portal-level access
    const [[access]] = await db.query(
      'SELECT has_access FROM employee_portal_access WHERE employee_id = ?',
      [employeeId]
    );
    if (!access || access.has_access !== 1) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access the Banking Partner Portal.'
      });
    }

    // 3. Level B: Retrieve active portals permitted for this employee
    const [portals] = await db.query(
      `SELECT p.id, p.name, p.location, p.login_url, p.description, p.logo_url, p.institution_type, p.status, p.display_order
       FROM banking_partner_portals p
       INNER JOIN employee_bank_permissions ebp ON ebp.portal_id = p.id
       WHERE p.status = 'Active'
         AND p.deleted_at IS NULL
         AND ebp.employee_id = ?
         AND ebp.is_allowed = 1
       ORDER BY p.display_order ASC, p.name ASC`,
      [employeeId]
    );

    return res.json({
      success: true,
      portals
    });
  } catch (err) {
    console.error('[BankingPartner getEmployeePortals error]:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve banking partner portals.' });
  }
};
