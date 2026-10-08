const db     = require('../config/db');
const multer = require('multer');
const path   = require('path');
const XLSX   = require('xlsx');
const notifCtrl = require('./notificationController');
const excelExpiry = require('../utils/excelExpiry');

// ── Multer (memory storage) ────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') return cb(null, true);
    cb(new Error('Only .xlsx and .xls files are allowed'));
  }
});

exports.uploadMiddleware = upload.single('excelFile');

// ── Column alias map: handles typos, case, common variants ───────────────
const COL_ALIASES = {
  'phone number':    ['phone number','phone no','phone','mobile','mobile number','mobile no','contact','contact number','mob','mob no','phonenumber','mobilenumber'],
  'disposition':     ['disposition','desposition','disp','dispo','call disposition','call status'],
  'sub disposition': ['sub disposition','sub desposition','sub disp','sub dispo','sub-disposition','sub-desposition','subdisposition','subdesposition','sub call status','sub status'],
  'employee':        ['employee','emp','employee name','emp name','agent','caller','telecaller','assigned to','user','owner'],
  'status':          ['status','call status','record status','lead status'],
  'notes':           ['notes','call notes','call note','note','remark','remarks','comment','comments'],
  'updated at':      ['updated at','updated_at','date','updated on','timestamp','last updated']
};

function resolveColumns(headerRow) {
  const result = {};
  if (!Array.isArray(headerRow)) return result;
  headerRow.forEach((h, idx) => {
    const hl = String(h || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    for (const [canon, aliases] of Object.entries(COL_ALIASES)) {
      if (aliases.includes(hl) && !(canon in result)) {
        result[canon] = idx;
      }
    }
  });
  return result;
}

function fmtPhone(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function parseWorkbook(buffer, originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (ext !== '.xlsx' && ext !== '.xls') {
    throw new Error('Only .xlsx and .xls files are allowed.');
  }

  const wb = XLSX.read(buffer, { type: 'buffer' });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('Excel file is empty or has no sheets.');
  }

  // Target sheet: prefer 'Export' (case-insensitive), or fall back to the first sheet
  const targetSheetName = wb.SheetNames.find(s => s.trim().toLowerCase() === 'export') || wb.SheetNames[0];
  const ws = wb.Sheets[targetSheetName];
  if (!ws) {
    throw new Error(`Sheet "${targetSheetName}" not found.`);
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows || rows.length < 2) {
    throw new Error('The Excel sheet contains no data rows. At least one phone number row is required.');
  }

  const headerRow = rows[0];
  const colMap = resolveColumns(headerRow);
  const phoneIdx = colMap['phone number'];
  const dispIdx = colMap['disposition'];
  const subIdx = colMap['sub disposition'];
  const empIdx = colMap['employee'];
  const statusIdx = colMap['status'];
  const notesIdx = colMap['notes'];
  const updatedIdx = colMap['updated at'];

  if (phoneIdx === undefined) {
    const detected = headerRow.filter(Boolean).join(', ') || '(none)';
    throw new Error(`Could not find a Phone Number column in the sheet. Detected columns: ${detected}`);
  }

  const dataRows = rows.slice(1).filter(r => fmtPhone(r[phoneIdx]) !== '');
  if (dataRows.length === 0) {
    throw new Error('No valid phone number rows found in the sheet.');
  }

  return {
    wb,
    sheetName: targetSheetName,
    availableSheets: wb.SheetNames,
    dataRows,
    phoneIdx,
    dispIdx,
    subIdx,
    empIdx,
    statusIdx,
    notesIdx,
    updatedIdx
  };
}

// ── Admin: Validate Excel File (Memory Only) ──────────────────────────────
exports.validateFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const originalName = req.file.originalname;
    const parsed = parseWorkbook(req.file.buffer, originalName);

    let completedCount = 0;
    const preview = [];

    parsed.dataRows.forEach((r, idx) => {
      const phone = fmtPhone(r[parsed.phoneIdx]);
      const disp = parsed.dispIdx !== undefined ? String(r[parsed.dispIdx] || '').trim() : '';
      const subDisp = parsed.subIdx !== undefined ? String(r[parsed.subIdx] || '').trim() : '';
      const emp = parsed.empIdx !== undefined ? String(r[parsed.empIdx] || '').trim() : '';
      const statusRaw = parsed.statusIdx !== undefined ? String(r[parsed.statusIdx] || '').trim() : '';
      const notes = parsed.notesIdx !== undefined ? String(r[parsed.notesIdx] || '').trim() : '';

      const isCompleted = (statusRaw.toLowerCase() === 'completed') || (disp !== '' && subDisp !== '');
      if (isCompleted) {
        completedCount++;
      }

      if (idx < 15) {
        preview.push({
          rowIndex: idx + 1,
          phoneNumber: phone,
          disposition: disp || '-',
          subDisposition: subDisp || '-',
          employee: emp || '-',
          status: isCompleted ? 'Completed' : 'Pending',
          notes: notes || ''
        });
      }
    });

    const totalRecords = parsed.dataRows.length;
    const availableRecords = totalRecords - completedCount;

    res.json({
      success: true,
      fileName: originalName,
      fileSize: req.file.size,
      sheetName: parsed.sheetName,
      availableSheets: parsed.availableSheets,
      totalRecords,
      completedRecords: completedCount,
      availableRecords,
      detectedColumns: {
        hasPhone: parsed.phoneIdx !== undefined,
        hasDisposition: parsed.dispIdx !== undefined,
        hasSubDisposition: parsed.subIdx !== undefined,
        hasEmployee: parsed.empIdx !== undefined,
        hasStatus: parsed.statusIdx !== undefined,
        hasNotes: parsed.notesIdx !== undefined
      },
      preview
    });
  } catch (err) {
    console.error('[Excel] validateFile:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Validation failed.' });
  }
};

/**
 * Core allocation helper executed inside a database transaction
 */
async function performAllocation(connection, fileId, config, adminUser) {
  const {
    method = 'equal_split',
    allocations = [],
    employee_ids = [],
    force_reassign = false
  } = config;

  const [[file]] = await connection.query('SELECT * FROM excel_files WHERE id = ? FOR UPDATE', [fileId]);
  if (!file) throw new Error('File not found.');

  // Fetch all records for this file
  let [records] = await connection.query(
    'SELECT id, row_index, phone_number, disposition, sub_disposition, status, assignment_id, assigned_to, source_employee_name FROM excel_records WHERE file_id = ? ORDER BY row_index ASC',
    [fileId]
  );

  if (force_reassign) {
    // Clear assignments on non-completed records only
    await connection.query(
      `UPDATE excel_records SET assignment_id = NULL, assigned_to = NULL WHERE file_id = ? AND status != 'Completed'`,
      [fileId]
    );
    // Delete assignments that have 0 completed records
    await connection.query(
      `DELETE FROM excel_assignments WHERE file_id = ? AND progress = 0`,
      [fileId]
    );
    // Refresh records
    [records] = await connection.query(
      'SELECT id, row_index, phone_number, disposition, sub_disposition, status, assignment_id, assigned_to, source_employee_name FROM excel_records WHERE file_id = ? ORDER BY row_index ASC',
      [fileId]
    );
  }

  // Available unassigned pending records (completed records are protected)
  const availableRecords = records.filter(r => r.status !== 'Completed' && !r.assignment_id);
  if (availableRecords.length === 0) {
    throw new Error('No unallocated pending records available in this file.');
  }

  // Verify employee users exist
  const [activeUsers] = await connection.query('SELECT id, name, email FROM users WHERE role = "employee"');
  const userMap = new Map(activeUsers.map(u => [u.id, u]));

  const plannedAllocations = [];

  if (method === 'range') {
    if (!Array.isArray(allocations) || allocations.length === 0) {
      throw new Error('At least one record range allocation is required.');
    }

    // Validate ranges & check for overlaps
    for (let i = 0; i < allocations.length; i++) {
      const a = allocations[i];
      const empId = parseInt(a.employee_id, 10);
      const startRow = parseInt(a.start_row, 10);
      const endRow = parseInt(a.end_row, 10);

      if (!userMap.has(empId)) {
        throw new Error(`Invalid employee selected (ID: ${a.employee_id}).`);
      }
      if (isNaN(startRow) || isNaN(endRow) || startRow < 1 || endRow < startRow) {
        throw new Error(`Invalid row range (${a.start_row} to ${a.end_row}) for ${userMap.get(empId).name}.`);
      }
      if (endRow > file.total_records) {
        throw new Error(`Row range end (${endRow}) exceeds total file records (${file.total_records}).`);
      }

      // Overlap check with previous ranges
      for (let j = 0; j < i; j++) {
        const prev = allocations[j];
        const pStart = parseInt(prev.start_row, 10);
        const pEnd = parseInt(prev.end_row, 10);
        if (!(endRow < pStart || startRow > pEnd)) {
          throw new Error(`Overlapping range detected: Rows ${startRow}–${endRow} overlaps with Rows ${pStart}–${pEnd}.`);
        }
      }

      // Filter available records in this range
      const matching = availableRecords.filter(r => r.row_index >= startRow && r.row_index <= endRow);
      if (matching.length === 0) {
        throw new Error(`No available pending records found in row range ${startRow}–${endRow}.`);
      }

      plannedAllocations.push({
        employee_id: empId,
        start_row: startRow,
        end_row: endRow,
        assigned_count: matching.length,
        allocation_method: 'range',
        recordIds: matching.map(r => r.id)
      });
    }

  } else if (method === 'count') {
    if (!Array.isArray(allocations) || allocations.length === 0) {
      throw new Error('At least one record count allocation is required.');
    }

    let offset = 0;
    for (const a of allocations) {
      const empId = parseInt(a.employee_id, 10);
      const count = parseInt(a.count, 10);

      if (!userMap.has(empId)) throw new Error(`Invalid employee selected (ID: ${a.employee_id}).`);
      if (isNaN(count) || count <= 0) throw new Error(`Invalid record count for ${userMap.get(empId).name}.`);

      if (offset + count > availableRecords.length) {
        throw new Error(`Requested total count exceeds available unallocated records (${availableRecords.length}).`);
      }

      const chunk = availableRecords.slice(offset, offset + count);
      offset += count;

      plannedAllocations.push({
        employee_id: empId,
        start_row: chunk[0].row_index,
        end_row: chunk[chunk.length - 1].row_index,
        assigned_count: chunk.length,
        allocation_method: 'count',
        recordIds: chunk.map(r => r.id)
      });
    }

  } else if (method === 'individual') {
    if (!Array.isArray(allocations) || allocations.length === 0) {
      throw new Error('At least one individual record allocation is required.');
    }

    const assignedSet = new Set();
    for (const a of allocations) {
      const empId = parseInt(a.employee_id, 10);
      const ids = Array.isArray(a.record_ids) ? a.record_ids.map(Number) : [];

      if (!userMap.has(empId)) throw new Error(`Invalid employee selected (ID: ${a.employee_id}).`);
      if (ids.length === 0) throw new Error(`No records selected for ${userMap.get(empId).name}.`);

      for (const id of ids) {
        if (assignedSet.has(id)) {
          throw new Error(`Duplicate record ID ${id} specified across multiple employees.`);
        }
        assignedSet.add(id);
      }

      const matching = availableRecords.filter(r => ids.includes(r.id));
      if (matching.length === 0) throw new Error(`Selected records not found or already completed.`);

      const rowIndices = matching.map(r => r.row_index);
      plannedAllocations.push({
        employee_id: empId,
        start_row: Math.min(...rowIndices),
        end_row: Math.max(...rowIndices),
        assigned_count: matching.length,
        allocation_method: 'individual',
        recordIds: matching.map(r => r.id)
      });
    }

  } else {
    // Default: 'equal_split'
    const rawIds = (Array.isArray(employee_ids) && employee_ids.length > 0)
      ? employee_ids
      : (Array.isArray(allocations) ? allocations.map(a => a.employee_id) : []);

    const empIds = [...new Set(rawIds.map(Number))].filter(id => userMap.has(id));
    if (empIds.length === 0) {
      throw new Error('Please select at least one valid employee for equal split allocation.');
    }

    const totalAvail = availableRecords.length;
    const n = empIds.length;
    const baseCount = Math.floor(totalAvail / n);
    const remainder = totalAvail % n;

    let offset = 0;
    for (let i = 0; i < n; i++) {
      const empId = empIds[i];
      const count = baseCount + (i < remainder ? 1 : 0);
      if (count === 0) continue;

      const chunk = availableRecords.slice(offset, offset + count);
      offset += count;

      plannedAllocations.push({
        employee_id: empId,
        start_row: chunk[0].row_index,
        end_row: chunk[chunk.length - 1].row_index,
        assigned_count: chunk.length,
        allocation_method: 'equal_split',
        recordIds: chunk.map(r => r.id)
      });
    }
  }

  // Execute database inserts and updates
  const now = new Date();
  const expiresAt = excelExpiry.calculateExpiresAt(now);
  const adminName = adminUser.name || 'Admin';
  const createdAssignments = [];

  for (const plan of plannedAllocations) {
    const [insRes] = await connection.query(
      `INSERT INTO excel_assignments
        (file_id, employee_id, assigned_by, assigned_at, expires_at, lifecycle_status, status, start_row, end_row, assigned_count, allocation_method)
       VALUES (?, ?, ?, ?, ?, 'Active', 'Assigned', ?, ?, ?, ?)`,
      [
        fileId,
        plan.employee_id,
        adminUser.id,
        now,
        expiresAt,
        plan.start_row,
        plan.end_row,
        plan.assigned_count,
        plan.allocation_method
      ]
    );

    const assignmentId = insRes.insertId;
    createdAssignments.push({
      id: assignmentId,
      employee_id: plan.employee_id,
      employee_name: userMap.get(plan.employee_id)?.name || 'Employee',
      start_row: plan.start_row,
      end_row: plan.end_row,
      assigned_count: plan.assigned_count,
      allocation_method: plan.allocation_method
    });

    // Update records with assignment_id and assigned_to
    if (plan.recordIds.length > 0) {
      await connection.query(
        `UPDATE excel_records SET assignment_id = ?, assigned_to = ? WHERE id IN (?)`,
        [assignmentId, plan.employee_id, plan.recordIds]
      );
    }

    // Notification
    try {
      await notifCtrl.createWorkAssignedNotification({
        employeeId: plan.employee_id,
        assignmentId,
        fileName: file.original_name,
        totalRecords: plan.assigned_count,
        assignedByName: adminName
      });
    } catch (notifErr) {
      console.warn('[Excel] Failed to send work assigned notification:', notifErr.message);
    }
  }

  // Update master file status
  await connection.query(
    `UPDATE excel_files SET status = 'Assigned', updated_at = NOW() WHERE id = ?`,
    [fileId]
  );

  return createdAssignments;
}

// ── Admin: Upload Excel File ───────────────────────────────────────────────
exports.uploadFile = async (req, res) => {
  let connection;
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const originalName = req.file.originalname;
    const parsed = parseWorkbook(req.file.buffer, originalName);

    // Fetch active users to map any completed records with source employee name
    const [allUsers] = await db.query('SELECT id, name, email FROM users');
    const userMap = new Map();
    for (const u of allUsers) {
      if (u.name) userMap.set(u.name.trim().toLowerCase(), u.id);
      if (u.email) userMap.set(u.email.trim().toLowerCase(), u.id);
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const fileName = `${Date.now()}_${originalName}`;
    const [fileResult] = await connection.query(
      `INSERT INTO excel_files (file_name, original_name, uploaded_by, status, total_records)
       VALUES (?, ?, ?, 'Pending', ?)`,
      [fileName, originalName, req.user.id, parsed.dataRows.length]
    );
    const fileId = fileResult.insertId;

    // Prepare bulk insert values for excel_records
    const values = parsed.dataRows.map((r, idx) => {
      const phone = fmtPhone(r[parsed.phoneIdx]);
      const disp = parsed.dispIdx !== undefined ? String(r[parsed.dispIdx] || '').trim() : '';
      const subDisp = parsed.subIdx !== undefined ? String(r[parsed.subIdx] || '').trim() : '';
      const empText = parsed.empIdx !== undefined ? String(r[parsed.empIdx] || '').trim() : '';
      const statusRaw = parsed.statusIdx !== undefined ? String(r[parsed.statusIdx] || '').trim() : '';
      const notes = parsed.notesIdx !== undefined ? String(r[parsed.notesIdx] || '').trim() : '';

      const isCompleted = (statusRaw.toLowerCase() === 'completed') || (disp !== '' && subDisp !== '');
      const status = isCompleted ? 'Completed' : 'Pending';

      let matchedUserId = null;
      if (empText && userMap.has(empText.toLowerCase())) {
        matchedUserId = userMap.get(empText.toLowerCase());
      }

      // If completed and matched, assign to that user as historical work
      const assignedTo = isCompleted ? matchedUserId : null;
      const updatedBy = isCompleted ? matchedUserId : null;

      return [
        fileId,
        null, // assignment_id (set during allocation or backfill)
        assignedTo,
        empText || null,
        idx + 1,
        phone,
        disp,
        subDisp,
        notes || null,
        status,
        updatedBy
      ];
    });

    await connection.query(
      `INSERT INTO excel_records
        (file_id, assignment_id, assigned_to, source_employee_name, row_index, phone_number, disposition, sub_disposition, notes, status, updated_by)
       VALUES ?`,
      [values]
    );

    // Check if allocation payload was provided
    let createdAssignments = [];
    let allocConfig = null;

    if (req.body.allocations) {
      try {
        const raw = typeof req.body.allocations === 'string' ? JSON.parse(req.body.allocations) : req.body.allocations;
        allocConfig = {
          method: req.body.allocation_method || req.body.method || 'range',
          allocations: Array.isArray(raw) ? raw : (raw.allocations || []),
          employee_ids: raw.employee_ids || req.body.employee_ids || [],
          force_reassign: false
        };
      } catch (pErr) {
        console.warn('[Excel] Could not parse allocations JSON:', pErr.message);
      }
    } else if (req.body.employee_ids) {
      let eids = req.body.employee_ids;
      if (typeof eids === 'string') {
        try { eids = JSON.parse(eids); } catch (_) { eids = [parseInt(eids, 10)]; }
      }
      allocConfig = {
        method: req.body.allocation_method || req.body.method || 'equal_split',
        employee_ids: Array.isArray(eids) ? eids : [eids],
        force_reassign: false
      };
    }

    if (allocConfig && ((allocConfig.allocations && allocConfig.allocations.length > 0) || (allocConfig.employee_ids && allocConfig.employee_ids.length > 0))) {
      createdAssignments = await performAllocation(connection, fileId, allocConfig, req.user);
    }

    await connection.commit();

    const [[file]] = await db.query(
      `SELECT ef.*, u.name as uploaded_by_name
       FROM excel_files ef
       JOIN users u ON u.id = ef.uploaded_by
       WHERE ef.id = ?`,
      [fileId]
    );

    res.json({
      success: true,
      message: createdAssignments.length > 0
        ? `Master workbook uploaded and allocated to ${createdAssignments.length} employee(s) successfully.`
        : 'Master workbook uploaded successfully.',
      file,
      assignments: createdAssignments
    });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('[Excel] uploadFile:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Upload failed.' });
  } finally {
    if (connection) connection.release();
  }
};

// ── Admin: Assign Employees to File ────────────────────────────────────────
exports.assignEmployees = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    let config = req.body;

    if (config.allocations && typeof config.allocations === 'string') {
      try { config.allocations = JSON.parse(config.allocations); } catch (_) {}
    }
    if (config.employee_ids && typeof config.employee_ids === 'string') {
      try { config.employee_ids = JSON.parse(config.employee_ids); } catch (_) {}
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const createdAssignments = await performAllocation(connection, id, config, req.user);

    await connection.commit();

    res.json({
      success: true,
      message: `File allocated to ${createdAssignments.length} employee assignment(s) successfully.`,
      assignments: createdAssignments
    });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('[Excel] assignEmployees:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Assignment failed.' });
  } finally {
    if (connection) connection.release();
  }
};

// ── Admin: List All Files ──────────────────────────────────────────────────
exports.getFiles = async (req, res) => {
  try {
    const [files] = await db.query(
      `SELECT ef.*, u.name as uploaded_by_name,
        (SELECT COUNT(*) FROM excel_assignments ea WHERE ea.file_id = ef.id) as assignment_count,
        (SELECT COUNT(*) FROM excel_records er WHERE er.file_id = ef.id AND er.status = 'Completed') as completed_count
       FROM excel_files ef
       JOIN users u ON u.id = ef.uploaded_by
       ORDER BY ef.created_at DESC`
    );

    for (const f of files) {
      const [empRows] = await db.query(
        `SELECT ea.id, ea.employee_id, u.name, u.email, ea.start_row, ea.end_row,
                ea.assigned_count, ea.status as assignment_status, ea.progress, ea.allocation_method,
                (SELECT COUNT(*) FROM excel_records er WHERE er.assignment_id = ea.id AND er.status = 'Completed') as completed
         FROM excel_assignments ea
         JOIN users u ON u.id = ea.employee_id
         WHERE ea.file_id = ?
         ORDER BY ea.id ASC`,
        [f.id]
      );
      f.assignments = empRows;
      f.assigned_employees = empRows.map(e => e.name);
      f.pending_count      = Math.max(0, f.total_records - f.completed_count);
      f.completion_pct     = f.total_records > 0
        ? Math.round((f.completed_count / f.total_records) * 100) : 0;
    }

    res.json({ success: true, files });
  } catch (err) {
    console.error('[Excel] getFiles:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch files.' });
  }
};

// ── Admin: Single File Detail ──────────────────────────────────────────────
exports.getFile = async (req, res) => {
  try {
    const { id } = req.params;
    const [[file]] = await db.query(
      `SELECT ef.*, u.name as uploaded_by_name
       FROM excel_files ef JOIN users u ON u.id = ef.uploaded_by
       WHERE ef.id = ?`,
      [id]
    );
    if (!file) return res.status(404).json({ success: false, message: 'File not found.' });

    const [assignments] = await db.query(
      `SELECT ea.*, u.name as employee_name, u.email as employee_email,
        (SELECT COUNT(*) FROM excel_records er
         WHERE er.assignment_id = ea.id AND er.status = 'Completed') as completed
       FROM excel_assignments ea
       JOIN users u ON u.id = ea.employee_id
       WHERE ea.file_id = ?
       ORDER BY ea.id ASC`,
      [id]
    );

    const [countRow] = await db.query(
      `SELECT COUNT(*) as completed FROM excel_records WHERE file_id = ? AND status = 'Completed'`,
      [id]
    );
    const completedCount  = countRow[0].completed;
    const pendingCount    = Math.max(0, file.total_records - completedCount);
    const completionPct   = file.total_records > 0
      ? Math.round((completedCount / file.total_records) * 100) : 0;

    res.json({
      success: true,
      file: { ...file, completed_count: completedCount, pending_count: pendingCount, completion_pct: completionPct },
      assignments
    });
  } catch (err) {
    console.error('[Excel] getFile:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch file.' });
  }
};

// ── Admin: Get File Records ────────────────────────────────────────────────
exports.getFileRecords = async (req, res) => {
  try {
    const { id }     = req.params;
    const { search, filter, employee_id, assignment_id, page = 1, limit = 100 } = req.query;
    const offset     = (parseInt(page) - 1) * parseInt(limit);

    let where  = 'er.file_id = ?';
    const args = [id];

    if (search) {
      where += ' AND (er.phone_number LIKE ? OR er.disposition LIKE ? OR er.sub_disposition LIKE ? OR er.notes LIKE ?)';
      const like = `%${search}%`;
      args.push(like, like, like, like);
    }
    if (filter === 'completed') { where += " AND er.status = 'Completed'"; }
    if (filter === 'pending')   { where += " AND er.status = 'Pending'"; }
    if (employee_id)            { where += " AND (er.assigned_to = ? OR er.updated_by = ?)"; args.push(employee_id, employee_id); }
    if (assignment_id)          { where += " AND er.assignment_id = ?"; args.push(assignment_id); }

    const [records] = await db.query(
      `SELECT er.*,
              u_upd.name  as updated_by_name,
              u_asgn.name as assigned_to_name,
              u_asgn.email as assigned_to_email,
              ea.start_row as assignment_start_row,
              ea.end_row as assignment_end_row,
              ea.allocation_method
       FROM excel_records er
       LEFT JOIN users u_upd  ON u_upd.id  = er.updated_by
       LEFT JOIN users u_asgn ON u_asgn.id = er.assigned_to
       LEFT JOIN excel_assignments ea ON ea.id = er.assignment_id
       WHERE ${where}
       ORDER BY er.row_index ASC
       LIMIT ? OFFSET ?`,
      [...args, parseInt(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM excel_records er WHERE ${where}`,
      args
    );

    res.json({ success: true, records, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[Excel] getFileRecords:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch records.' });
  }
};

// ── Admin: Update File Status ──────────────────────────────────────────────
exports.updateFileStatus = async (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;
    const allowed    = ['Assigned', 'In Progress', 'Completed', 'Closed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    await db.query('UPDATE excel_files SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    if (status === 'Closed') {
      await db.query("UPDATE excel_assignments SET status = 'Closed' WHERE file_id = ?", [id]);
    }
    await notifCtrl.createAssignmentUpdatedNotification({ fileId: id, status });

    res.json({ success: true, message: `Status updated to ${status}.` });
  } catch (err) {
    console.error('[Excel] updateFileStatus:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update status.' });
  }
};

// ── Admin: Delete File ─────────────────────────────────────────────────────
exports.deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    const [[file]] = await db.query('SELECT id FROM excel_files WHERE id = ?', [id]);
    if (!file) return res.status(404).json({ success: false, message: 'File not found.' });

    await db.query('DELETE FROM excel_audit       WHERE file_id = ?', [id]);
    await db.query('DELETE FROM excel_records     WHERE file_id = ?', [id]);
    await db.query('DELETE FROM excel_assignments WHERE file_id = ?', [id]);
    await db.query('DELETE FROM excel_files       WHERE id = ?',      [id]);

    res.json({ success: true, message: 'File deleted successfully.' });
  } catch (err) {
    console.error('[Excel] deleteFile:', err.message);
    res.status(500).json({ success: false, message: 'Delete failed.' });
  }
};

// ── Admin/Employee: Export File as CSV/XLSX ────────────────────────────────
exports.exportFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'csv', assignment_id, employee_id } = req.query;

    const [[file]] = await db.query('SELECT * FROM excel_files WHERE id = ?', [id]);
    if (!file) return res.status(404).json({ success: false, message: 'File not found.' });

    let where = 'er.file_id = ?';
    const args = [id];

    // If caller is an employee, strictly limit to their records
    if (req.user.role !== 'admin') {
      where += ' AND er.assigned_to = ?';
      args.push(req.user.id);
    } else {
      if (assignment_id) {
        where += ' AND er.assignment_id = ?';
        args.push(assignment_id);
      } else if (employee_id) {
        where += ' AND er.assigned_to = ?';
        args.push(employee_id);
      }
    }

    const [records] = await db.query(
      `SELECT er.row_index, er.phone_number, er.disposition, er.sub_disposition, er.notes,
              u_upd.name as employee_name, er.status, er.updated_at
       FROM excel_records er
       LEFT JOIN users u_upd ON u_upd.id = er.updated_by
       WHERE ${where}
       ORDER BY er.row_index ASC`,
      args
    );

    if (format === 'xlsx') {
      const sheetData = [['Row Index', 'Phone Number', 'Disposition', 'Sub Disposition', 'Call Notes', 'Employee', 'Status', 'Updated At']];
      for (const r of records) {
        sheetData.push([
          r.row_index,
          r.phone_number,
          r.disposition || '',
          r.sub_disposition || '',
          r.notes || '',
          r.employee_name || '',
          r.status,
          r.updated_at ? new Date(r.updated_at).toLocaleString('en-IN') : ''
        ]);
      }
      const ws  = XLSX.utils.aoa_to_sheet(sheetData);
      const wb  = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Export');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const safeName = file.original_name.replace(/[^a-z0-9._-]/gi, '_');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="export_${safeName}"`);
      return res.send(buf);
    }

    // Default CSV
    let csv = 'Row Index,Phone Number,Disposition,Sub Disposition,Call Notes,Employee,Status,Updated At\n';
    for (const r of records) {
      const row = [
        r.row_index,
        r.phone_number,
        r.disposition     || '',
        r.sub_disposition || '',
        r.notes           || '',
        r.employee_name   || '',
        r.status,
        r.updated_at ? new Date(r.updated_at).toLocaleString('en-IN') : ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
      csv += row + '\n';
    }

    const safeName = file.original_name.replace(/[^a-z0-9._-]/gi, '_');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="export_${safeName}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[Excel] exportFile:', err.message);
    res.status(500).json({ success: false, message: 'Export failed.' });
  }
};

// ── Admin: Employees List for Assignment Dropdown ──────────────────────────
exports.getEmployeesList = async (req, res) => {
  try {
    const [employees] = await db.query(
      `SELECT DISTINCT id, name, email, department, designation, is_active, auto_deactivated
       FROM users
       WHERE role = 'employee'
         AND NOT (is_active = 0 AND auto_deactivated = 0 AND manual_override = 0)
       ORDER BY name ASC, id ASC`
    );
    res.json({ success: true, employees });
  } catch (err) {
    console.error('[Excel] getEmployeesList:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch employees.' });
  }
};

// ── Admin: Audit Trail ─────────────────────────────────────────────────────
exports.getAudit = async (req, res) => {
  try {
    const { file_id, employee_id, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where  = '1=1';
    const args = [];
    if (file_id)     { where += ' AND ea.file_id = ?';     args.push(file_id); }
    if (employee_id) { where += ' AND ea.employee_id = ?'; args.push(employee_id); }

    const [rows] = await db.query(
      `SELECT ea.*, u.name as employee_name, ef.original_name as file_name
       FROM excel_audit ea
       LEFT JOIN users u       ON u.id  = ea.employee_id
       LEFT JOIN excel_files ef ON ef.id = ea.file_id
       WHERE ${where}
       ORDER BY ea.created_at DESC
       LIMIT ? OFFSET ?`,
      [...args, parseInt(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM excel_audit ea WHERE ${where}`,
      args
    );

    res.json({ success: true, audit: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[Excel] getAudit:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch audit trail.' });
  }
};

// ── Employee: My Assignments ───────────────────────────────────────────────
exports.getMyAssignments = async (req, res) => {
  try {
    const empId = req.user.id;
    const [rows] = await db.query(
      `SELECT ea.*, ef.original_name, ef.status as file_status,
              ef.uploaded_at, ef.updated_at as file_updated_at,
              u.name as assigned_by_name,
        (SELECT COUNT(*) FROM excel_records er
         WHERE er.assignment_id = ea.id AND er.status = 'Completed') as completed,
        COALESCE(ea.assigned_count, (SELECT COUNT(*) FROM excel_records er WHERE er.assignment_id = ea.id), ef.total_records) as total_records
       FROM excel_assignments ea
       JOIN excel_files ef ON ea.file_id = ef.id
       JOIN users u        ON u.id = ea.assigned_by
       WHERE ea.employee_id = ? 
         AND ea.status != 'Closed'
         AND ${excelExpiry.getActiveAssignmentCondition('ea')}
       ORDER BY ea.assigned_at DESC`,
      [empId]
    );

    const assignments = rows.map(r => {
      const tot = Number(r.total_records) || 0;
      const comp = Number(r.completed) || 0;
      return {
        ...r,
        pending:         Math.max(0, tot - comp),
        completion_pct:  tot > 0 ? Math.round((comp / tot) * 100) : 0
      };
    });

    res.json({ success: true, assignments });
  } catch (err) {
    console.error('[Excel] getMyAssignments:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch assignments.' });
  }
};

// ── Employee: Get Assignment Records ──────────────────────────────────────
exports.getAssignmentRecords = async (req, res) => {
  try {
    const empId        = req.user.id;
    const { assignmentId } = req.params;
    const { search, filter, page = 1, limit = 100 } = req.query;
    const offset       = (parseInt(page) - 1) * parseInt(limit);

    // Verify ownership
    const [[asgn]] = await db.query(
      'SELECT * FROM excel_assignments WHERE id = ? AND employee_id = ?',
      [assignmentId, empId]
    );
    if (!asgn) return res.status(403).json({ success: false, message: 'Assignment not found or access denied.' });

    // Enforce 30-day expiration for employee
    if (req.user.role !== 'admin' && excelExpiry.isAssignmentExpired(asgn)) {
      return res.status(403).json({
        success: false,
        assignment_expired: true,
        message: 'This assignment has expired (30-day access period ended) and is no longer accessible.'
      });
    }

    const [[file]] = await db.query('SELECT * FROM excel_files WHERE id = ?', [asgn.file_id]);

    let where  = '(er.assignment_id = ? OR (er.assignment_id IS NULL AND er.file_id = ? AND er.assigned_to = ?))';
    const args = [asgn.id, asgn.file_id, empId];

    if (search) {
      where += ' AND (er.phone_number LIKE ? OR er.disposition LIKE ? OR er.sub_disposition LIKE ? OR er.notes LIKE ?)';
      const like = `%${search}%`;
      args.push(like, like, like, like);
    }
    if (filter === 'completed') { where += " AND er.status = 'Completed'"; }
    if (filter === 'pending')   { where += " AND er.status = 'Pending'"; }

    const [records] = await db.query(
      `SELECT er.* FROM excel_records er
       WHERE ${where}
       ORDER BY er.row_index ASC
       LIMIT ? OFFSET ?`,
      [...args, parseInt(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM excel_records er WHERE ${where}`,
      args
    );

    const [[{ comp }]] = await db.query(
      `SELECT COUNT(*) as comp FROM excel_records er WHERE ${where} AND er.status = 'Completed'`,
      args
    );

    res.json({
      success: true,
      assignment: { ...asgn, completed: comp },
      file,
      records,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('[Excel] getAssignmentRecords:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch records.' });
  }
};

// ── Shared: Update a Record (Strict Row-Level IDOR Protection) ─────────────
exports.updateRecord = async (req, res) => {
  try {
    const userId   = req.user.id;
    const { recordId } = req.params;
    const { disposition, sub_disposition, notes } = req.body;

    const [[record]] = await db.query('SELECT * FROM excel_records WHERE id = ?', [recordId]);
    if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });

    // Strict Employee Authorization Check
    let asgn = null;
    if (req.user.role !== 'admin') {
      // Must be assigned to this record
      if (record.assigned_to && record.assigned_to !== userId) {
        return res.status(403).json({ success: false, message: 'Access denied: this record is assigned to another employee.' });
      }

      if (record.assignment_id) {
        const [[a]] = await db.query(
          'SELECT * FROM excel_assignments WHERE id = ? AND employee_id = ? AND status != ?',
          [record.assignment_id, userId, 'Closed']
        );
        asgn = a;
      } else {
        const [[a]] = await db.query(
          'SELECT * FROM excel_assignments WHERE file_id = ? AND employee_id = ? AND status != ?',
          [record.file_id, userId, 'Closed']
        );
        asgn = a;
      }

      if (!asgn) {
        return res.status(403).json({ success: false, message: 'Access denied: not assigned to this file.' });
      }

      if (excelExpiry.isAssignmentExpired(asgn)) {
        return res.status(403).json({
          success: false,
          assignment_expired: true,
          message: 'This assignment has expired (30-day access period ended). Records can no longer be updated.'
        });
      }
    }

    const oldDisp    = record.disposition;
    const oldSubDisp = record.sub_disposition;
    const newDisp    = disposition    !== undefined ? disposition    : oldDisp;
    const newSubDisp = sub_disposition !== undefined ? sub_disposition : oldSubDisp;
    const newNotes   = notes !== undefined ? (notes ? String(notes).trim() : null) : record.notes;
    let newStatus    = (newDisp && newSubDisp) ? 'Completed' : 'Pending';
    if (req.body.status !== undefined && req.body.status) {
      newStatus = req.body.status;
    }

    await db.query(
      `UPDATE excel_records
       SET disposition = ?, sub_disposition = ?, notes = ?, updated_by = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [newDisp, newSubDisp, newNotes, userId, newStatus, recordId]
    );

    // Audit log
    await db.query(
      `INSERT INTO excel_audit
         (file_id, record_id, employee_id, phone_number,
          old_disposition, new_disposition, old_sub_disposition, new_sub_disposition)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.file_id, recordId, userId, record.phone_number,
       oldDisp, newDisp, oldSubDisp, newSubDisp]
    );

    // Update assignment progress for this specific assignment
    const targetAsgnId = record.assignment_id || (asgn ? asgn.id : null);
    if (targetAsgnId) {
      const [[prog]] = await db.query(
        `SELECT COUNT(*) as completed FROM excel_records
         WHERE assignment_id = ? AND status = 'Completed'`,
        [targetAsgnId]
      );
      const [[currAsgn]] = await db.query(
        'SELECT * FROM excel_assignments WHERE id = ?',
        [targetAsgnId]
      );

      const targetCount = currAsgn ? (currAsgn.assigned_count || 0) : 0;
      let updatedAsgnStatus = 'In Progress';
      if (currAsgn && targetCount > 0 && prog.completed >= targetCount) {
        updatedAsgnStatus = 'Completed';
      }

      await db.query(
        `UPDATE excel_assignments SET progress = ?, status = ?, updated_at = NOW()
         WHERE id = ?`,
        [prog.completed, updatedAsgnStatus, targetAsgnId]
      );
    }

    // Update master file status
    const [[fileStats]] = await db.query(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed
       FROM excel_records WHERE file_id = ?`,
      [record.file_id]
    );
    let newFileStatus = 'In Progress';
    if (fileStats && fileStats.total > 0 && fileStats.total === Number(fileStats.completed)) {
      newFileStatus = 'Completed';
    }
    await db.query(
      `UPDATE excel_files SET status = ?, updated_at = NOW() WHERE id = ?`,
      [newFileStatus, record.file_id]
    );

    // Callback reminder
    if (req.user.role !== 'admin' && targetAsgnId) {
      await notifCtrl.upsertCallbackReminder({
        employeeId:   userId,
        assignmentId: targetAsgnId,
        recordId:     parseInt(recordId, 10),
        phoneNumber:  record.phone_number,
        disposition:  newDisp,
        subDisposition: newSubDisp
      });
    } else if (req.user.role === 'admin') {
      const targetEmp = record.assigned_to;
      if (targetEmp && targetAsgnId) {
        await notifCtrl.createRecordUpdatedNotification({
          employeeId: targetEmp,
          assignmentId: targetAsgnId,
          phoneNumber: record.phone_number
        });
      }
    }

    const [[updated]] = await db.query('SELECT * FROM excel_records WHERE id = ?', [recordId]);
    res.json({ success: true, record: updated });
  } catch (err) {
    console.error('[Excel] updateRecord:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update record.' });
  }
};

// ── Employee: Submit Assignment ────────────────────────────────────────────
exports.submitAssignment = async (req, res) => {
  try {
    const empId        = req.user.id;
    const { assignmentId } = req.params;

    const [[asgn]] = await db.query(
      'SELECT * FROM excel_assignments WHERE id = ? AND employee_id = ?',
      [assignmentId, empId]
    );
    if (!asgn) return res.status(403).json({ success: false, message: 'Assignment not found or access denied.' });

    if (req.user.role !== 'admin' && excelExpiry.isAssignmentExpired(asgn)) {
      return res.status(403).json({
        success: false,
        assignment_expired: true,
        message: 'This assignment has expired (30-day access period ended) and cannot be submitted.'
      });
    }

    // Check all records assigned to this assignment are complete
    const [incomplete] = await db.query(
      `SELECT phone_number FROM excel_records
       WHERE assignment_id = ? AND (disposition IS NULL OR disposition = '' OR sub_disposition IS NULL OR sub_disposition = '')`,
      [assignmentId]
    );

    if (incomplete.length > 0) {
      return res.status(400).json({
        success: false,
        message: `${incomplete.length} record(s) are incomplete. Fill Disposition and Sub Disposition for all rows before submitting.`,
        incomplete_phones: incomplete.map(r => r.phone_number)
      });
    }

    await db.query(
      `UPDATE excel_assignments SET status = 'Completed', completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [assignmentId]
    );

    // Check if ALL assignments for this file are completed
    const [[{ pending }]] = await db.query(
      `SELECT COUNT(*) as pending FROM excel_assignments
       WHERE file_id = ? AND status != 'Completed'`,
      [asgn.file_id]
    );
    if (pending === 0) {
      await db.query(
        `UPDATE excel_files SET status = 'Completed', updated_at = NOW() WHERE id = ?`,
        [asgn.file_id]
      );
    }

    res.json({ success: true, message: 'Assignment submitted successfully.' });
  } catch (err) {
    console.error('[Excel] submitAssignment:', err.message);
    res.status(500).json({ success: false, message: 'Submission failed.' });
  }
};

// ── Employee/Admin: Search across assigned records ────────────────────────
exports.searchAssignedRecords = async (req, res) => {
  try {
    const empId = req.user.id;
    const role  = req.user.role;
    const {
      phone,
      from_date,
      to_date,
      date,
      assignment_id,
      status,
      limit = 100
    } = req.query;

    const conditions = ["(ef.status IS NULL OR ef.status != 'Deleted')"];
    const params = [];

    // Security: strictly isolate employee to their assigned records
    if (role !== 'admin') {
      conditions.push('(r.assigned_to = ? OR (r.assigned_to IS NULL AND ea.employee_id = ?))');
      params.push(empId, empId);
      conditions.push(excelExpiry.getActiveAssignmentCondition('ea'));
    } else if (req.query.employee_id) {
      conditions.push('(r.assigned_to = ? OR (r.assigned_to IS NULL AND ea.employee_id = ?))');
      params.push(req.query.employee_id, req.query.employee_id);
    }

    if (phone && phone.trim()) {
      const cleanPhone = phone.trim().replace(/[^0-9+]/g, '');
      const rawPhone = phone.trim();
      conditions.push('(r.phone_number = ? OR r.phone_number = ? OR r.phone_number LIKE ?)');
      params.push(rawPhone, cleanPhone, `%${cleanPhone || rawPhone}%`);
    }

    if (assignment_id && assignment_id !== 'all') {
      conditions.push('(ea.id = ? OR ef.id = ?)');
      params.push(assignment_id, assignment_id);
    }

    if (status && status !== 'all') {
      if (status.toLowerCase() === 'pending') {
        conditions.push("(r.status = 'Pending' OR r.status IS NULL OR r.status = '')");
      } else {
        conditions.push('r.status = ?');
        params.push(status);
      }
    }

    if (from_date) {
      conditions.push('DATE(ea.assigned_at) >= ?');
      params.push(from_date);
    }
    if (to_date) {
      conditions.push('DATE(ea.assigned_at) <= ?');
      params.push(to_date);
    }
    if (date) {
      conditions.push('DATE(ea.assigned_at) = ?');
      params.push(date);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 300);

    const sql = `
      SELECT 
        r.id,
        r.file_id,
        r.row_index,
        r.phone_number,
        r.disposition,
        r.sub_disposition,
        r.notes,
        r.status,
        r.status AS record_status,
        r.updated_at AS record_updated_at,
        ef.original_name,
        ef.file_name,
        ef.status AS file_status,
        ef.total_records,
        ea.id AS assignment_id,
        ea.employee_id,
        ea.assigned_at,
        ea.progress,
        ea.status AS assignment_status
      FROM excel_records r
      JOIN excel_files ef ON ef.id = r.file_id
      JOIN excel_assignments ea ON (ea.id = r.assignment_id OR (r.assignment_id IS NULL AND ea.file_id = r.file_id))
      ${whereClause}
      ORDER BY ea.assigned_at DESC, r.id DESC
      LIMIT ${safeLimit}
    `;

    const [rows] = await db.query(sql, params);

    res.json({
      success: true,
      total: rows.length,
      records: rows
    });
  } catch (err) {
    console.error('[Excel] searchAssignedRecords error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to search assigned records.' });
  }
};
