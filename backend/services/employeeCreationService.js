const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const db = require('../config/db');

// Formula injection triggers: =, +, -, @
const FORMULA_INJECTION_REGEX = /^[=+\-@]/;
// Email validation RFC 5322 standard
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Username validation: alphanumeric, dot, underscore, hyphen (3 to 50 chars)
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,50}$/;
// Phone validation: 10 to 15 digits
const PHONE_REGEX = /^[0-9]{10,15}$/;

/**
 * Get current month name in Asia/Kolkata timezone dynamically
 * E.g., September 2026 -> "September"
 */
function getCurrentMonthPassword() {
  const options = { timeZone: 'Asia/Kolkata', month: 'long' };
  return new Intl.DateTimeFormat('en-US', options).format(new Date());
}

/**
 * Sanitize cell values against formula injection and control characters
 */
function sanitizeCell(value) {
  if (value === null || value === undefined) return '';
  let str = String(value).trim();
  // Remove ASCII control characters except standard whitespace
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Formula injection defense: if first char is =, +, -, @, neutralize it
  if (FORMULA_INJECTION_REGEX.test(str)) {
    str = str.replace(/^[=+\-@]+/, '').trim();
  }
  return str;
}

/**
 * Helper to log activity into user_activity_logs table
 */
async function logActivity(userId, activity, req, status = 'Success') {
  try {
    const ip = req?.headers?.['x-forwarded-for']?.split(',')?.[0]?.trim() || req?.ip || req?.socket?.remoteAddress || '127.0.0.1';
    await db.query(
      'INSERT INTO user_activity_logs (user_id, activity, status, ip_address) VALUES (?, ?, ?, ?)',
      [userId, activity, status, ip]
    );
  } catch (err) {
    console.error('[EmployeeCreationService] Failed to log activity:', err.message);
  }
}

/**
 * Generate a production-ready .xlsx template workbook buffer
 */
function generateExcelTemplate() {
  const wb = XLSX.utils.book_new();

  // Primary Sheet: Employees (Demo records with standard columns)
  const employeeHeaders = [
    'Full Name',
    'Email',
    'Phone Number',
    'Username',
    'Temporary Password'
  ];

  const demoRows = [
    ['Demo Employee 1', 'demo1@example.com', '9000000001', 'demo.emp1', 'Auto-generated'],
    ['Demo Employee 2', 'demo2@example.com', '9000000002', 'demo.emp2', 'Auto-generated'],
    ['Demo Employee 3', 'demo3@example.com', '9000000003', 'demo.emp3', 'Auto-generated'],
    ['Demo Employee 4', 'demo4@example.com', '9000000004', 'demo.emp4', 'Auto-generated']
  ];

  const wsEmployees = XLSX.utils.aoa_to_sheet([employeeHeaders, ...demoRows]);
  wsEmployees['!cols'] = [
    { wch: 24 }, // Full Name
    { wch: 28 }, // Email
    { wch: 18 }, // Phone Number
    { wch: 18 }, // Username
    { wch: 22 }  // Temporary Password
  ];

  XLSX.utils.book_append_sheet(wb, wsEmployees, 'Employees');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Validate and parse uploaded Excel file buffer
 */
async function parseAndValidateWorkbook(fileBuffer) {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('Uploaded file is empty.');
  }

  // Check file size: 5 MB limit
  if (fileBuffer.length > 5 * 1024 * 1024) {
    throw new Error('The selected file exceeds the maximum allowed size of 5 MB.');
  }

  // Check magic bytes for ZIP/XLSX (PK\x03\x04 or 50 4B 03 04)
  const isZip = fileBuffer.length >= 4 &&
    fileBuffer[0] === 0x50 &&
    fileBuffer[1] === 0x4B &&
    fileBuffer[2] === 0x03 &&
    fileBuffer[3] === 0x04;

  // Also support OLE2 for legacy .xls (D0 CF 11 E0)
  const isOle2 = fileBuffer.length >= 4 &&
    fileBuffer[0] === 0xD0 &&
    fileBuffer[1] === 0xCF &&
    fileBuffer[2] === 0x11 &&
    fileBuffer[3] === 0xE0;

  if (!isZip && !isOle2) {
    throw new Error('Invalid Excel file format. Please upload a valid .xlsx workbook.');
  }

  let wb;
  try {
    wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true, cellNF: false, cellText: false });
  } catch (err) {
    throw new Error('Failed to parse Excel workbook. The file may be corrupt or encrypted.');
  }

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('The uploaded workbook contains no worksheets.');
  }

  // Target sheet: preference for "Employees" or "Employee", else second sheet (if instructions sheet is first), else first sheet
  let targetSheetName = wb.SheetNames.find(n => /^employees?$/i.test(n.trim()));
  if (!targetSheetName) {
    if (wb.SheetNames.length > 1 && /^instructions?$/i.test(wb.SheetNames[0].trim())) {
      targetSheetName = wb.SheetNames[1];
    } else {
      targetSheetName = wb.SheetNames[0];
    }
  }

  const sheet = wb.Sheets[targetSheetName];
  if (!sheet) {
    throw new Error('Unable to read the target employee worksheet.');
  }

  // Convert to 2D array of rows
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rawRows || rawRows.length === 0) {
    throw new Error('No employee records were found in the uploaded workbook.');
  }

  // Find header row (search first 5 rows for required headers)
  let headerRowIndex = -1;
  let headerMapping = {};

  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    const row = rawRows[i].map(c => String(c).trim().toLowerCase());
    const hasName = row.some(c => ['full name', 'name', 'employee name'].includes(c));
    const hasEmail = row.some(c => ['email', 'email address'].includes(c));
    if (hasName && hasEmail) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('The uploaded workbook is missing required column headers: "Full Name" and "Email".');
  }

  // Map columns
  const headerCols = rawRows[headerRowIndex].map(c => String(c).trim());
  headerCols.forEach((colName, idx) => {
    const lower = colName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (['fullname', 'name', 'employeename'].includes(lower)) headerMapping.name = idx;
    else if (['email', 'emailaddress'].includes(lower)) headerMapping.email = idx;
    else if (['phone', 'phonenumber', 'mobile', 'mobilenumber', 'contact'].includes(lower)) headerMapping.phone = idx;
    else if (['designation', 'jobtitle', 'title', 'role_title'].includes(lower)) headerMapping.designation = idx;
    else if (['username', 'user'].includes(lower)) headerMapping.username = idx;
    else if (['temporarypassword', 'temppassword', 'password', 'temp_password'].includes(lower)) headerMapping.temporary_password = idx;
  });

  // Check for forbidden privilege escalation columns
  const forbiddenHeaders = ['role', 'isadmin', 'issuperadmin', 'permissions', 'systemaccess', 'databaserole'];
  for (const col of headerCols) {
    const lower = col.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (forbiddenHeaders.includes(lower)) {
      // Forbidden column detected: note for security, but backend strictly discards it
      console.warn(`[Security] Ignored privileged column header: "${col}" in bulk employee import.`);
    }
  }

  const dataRows = rawRows.slice(headerRowIndex + 1).filter(r => r && r.some(cell => String(cell).trim() !== ''));

  if (dataRows.length === 0) {
    throw new Error('No employee records were found. The file contains only headers.');
  }

  if (dataRows.length > 500) {
    throw new Error(`The uploaded workbook contains ${dataRows.length} rows, exceeding the maximum allowed limit of 500 records per import.`);
  }

  // Fetch all existing emails and usernames from DB for duplicate checking
  const [existingDbUsers] = await db.query('SELECT LOWER(email) AS email, LOWER(username) AS username FROM users');
  const dbEmails = new Set(existingDbUsers.map(u => u.email).filter(Boolean));
  const dbUsernames = new Set(existingDbUsers.map(u => u.username).filter(Boolean));

  // In-file duplicate tracking maps: value -> first 1-based data row number
  const seenEmailsInFile = new Map();
  const seenUsernamesInFile = new Map();

  const validatedRows = [];
  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;

  const currentMonth = getCurrentMonthPassword();

  dataRows.forEach((row, idx) => {
    const rowNumber = idx + 1; // 1-based data row number
    const errors = [];
    const warnings = [];

    // Extract & sanitize cells
    const rawName = headerMapping.name !== undefined ? row[headerMapping.name] : '';
    const rawEmail = headerMapping.email !== undefined ? row[headerMapping.email] : '';
    const rawPhone = headerMapping.phone !== undefined ? row[headerMapping.phone] : '';
    const rawDesig = headerMapping.designation !== undefined ? row[headerMapping.designation] : '';
    const rawUser = headerMapping.username !== undefined ? row[headerMapping.username] : '';
    const rawPass = headerMapping.temporary_password !== undefined ? row[headerMapping.temporary_password] : '';

    const name = sanitizeCell(rawName);
    const email = sanitizeCell(rawEmail).toLowerCase();
    const phone = sanitizeCell(rawPhone).replace(/[^0-9]/g, '');
    const designation = sanitizeCell(rawDesig) || 'Loan Executive';
    const username = sanitizeCell(rawUser).toLowerCase();
    const rawPassStr = String(rawPass || '').trim();

    // Check if demo record
    const isDemo = /demo/i.test(name) || /example\.(com|org|net)/i.test(email) || /demo/i.test(username);
    if (isDemo) {
      warnings.push('Demo row detected (e.g. example.com or DEMO tag). Remove before live import.');
    }

    // 1. Validate Name
    if (!name) {
      errors.push('Full Name is required.');
    } else if (name.length < 2) {
      errors.push('Full Name must be at least 2 characters long.');
    } else if (name.length > 100) {
      errors.push('Full Name must not exceed 100 characters.');
    }

    // 2. Validate Email
    if (!email) {
      errors.push('Email address is required.');
    } else if (!EMAIL_REGEX.test(email)) {
      errors.push(`Invalid email address format: "${email}".`);
    } else if (email.length > 150) {
      errors.push('Email address must not exceed 150 characters.');
    } else if (seenEmailsInFile.has(email)) {
      errors.push(`Duplicate email in file: "${email}" already appears in row ${seenEmailsInFile.get(email)}.`);
    } else if (dbEmails.has(email)) {
      errors.push(`An account with email "${email}" already exists in the system.`);
    } else {
      seenEmailsInFile.set(email, rowNumber);
    }

    // 3. Validate Phone (optional)
    if (phone && !PHONE_REGEX.test(phone)) {
      errors.push(`Invalid phone number: "${phone}". Must be 10 to 15 digits.`);
    }

    // 4. Validate Designation length
    if (designation.length > 100) {
      errors.push('Designation must not exceed 100 characters.');
    }

    // 5. Validate Username (optional)
    if (username) {
      if (!USERNAME_REGEX.test(username)) {
        errors.push(`Invalid username: "${username}". Allowed: 3-50 alphanumeric characters, dots, underscores, or hyphens.`);
      } else if (seenUsernamesInFile.has(username)) {
        errors.push(`Duplicate username in file: "${username}" already appears in row ${seenUsernamesInFile.get(username)}.`);
      } else if (dbUsernames.has(username)) {
        errors.push(`Username "${username}" is already taken by another account.`);
      } else {
        seenUsernamesInFile.set(username, rowNumber);
      }
    }

    // 6. Validate Temporary Password
    const isAutoPass = !rawPassStr || /^auto[- ]?generated$/i.test(rawPassStr) || /^\(blank\)$/i.test(rawPassStr);
    let hasCustomPassword = false;
    let finalPassword = '';

    if (isAutoPass) {
      hasCustomPassword = false;
      finalPassword = currentMonth;
    } else {
      if (rawPassStr.length < 8) {
        errors.push('Temporary Password must be at least 8 characters long or left blank for auto-generation.');
      } else {
        hasCustomPassword = true;
        finalPassword = rawPassStr;
      }
    }

    let status = 'valid';
    if (errors.length > 0) {
      status = 'error';
      errorCount++;
    } else if (warnings.length > 0) {
      status = 'warning';
      warningCount++;
      validCount++; // Warnings still allow import unless blocked
    } else {
      validCount++;
    }

    validatedRows.push({
      rowNumber,
      name,
      email,
      phone: phone || null,
      designation,
      username: username || null,
      hasCustomPassword,
      passwordToUse: finalPassword,
      status,
      errors,
      warnings
    });
  });

  return {
    summary: {
      totalRows: dataRows.length,
      validCount,
      warningCount,
      errorCount,
      canImport: validCount > 0
    },
    stats: {
      totalRows: dataRows.length,
      validRows: validCount,
      warningRows: warningCount,
      errorRows: errorCount
    },
    currentMonth,
    rows: validatedRows
  };
}

/**
 * Shared single employee creation function.
 * Used by both "Add Employee" modal and "Bulk Excel Import".
 */
async function createEmployee(data, connection = null) {
  const runner = connection || db;

  const {
    name,
    email,
    password,
    phone = null,
    designation = 'Loan Executive',
    username = null,
    must_change_password = 1
  } = data;

  if (!name || !email || !password) {
    throw new Error('Name, email, and password are required.');
  }

  // Double check email uniqueness
  const [existing] = await runner.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email.toLowerCase()]);
  if (existing.length > 0) {
    throw new Error(`An account with email "${email}" already exists.`);
  }

  if (username) {
    const [existingUser] = await runner.query('SELECT id FROM users WHERE username = ? LIMIT 1', [username.toLowerCase()]);
    if (existingUser.length > 0) {
      throw new Error(`Username "${username}" is already taken.`);
    }
  }

  // Securely hash password using standard bcrypt (10 rounds)
  const hashedPassword = await bcrypt.hash(password, 10);

  // Parameterized query: role is hardcoded to 'employee', never controllable by external input
  const [result] = await runner.query(
    `INSERT INTO users (
      name, email, password, role, phone, designation, username, must_change_password, is_active
    ) VALUES (?, ?, ?, 'employee', ?, ?, ?, ?, 1)`,
    [
      name,
      email.toLowerCase(),
      hashedPassword,
      phone || null,
      designation || 'Loan Executive',
      username ? username.toLowerCase() : null,
      must_change_password ? 1 : 0
    ]
  );

  const newId = result.insertId;

  // Initialize preference rows (non-blocking / ignore duplicates)
  await runner.query('INSERT IGNORE INTO notification_preferences (user_id) VALUES (?)', [newId]).catch(() => {});
  await runner.query('INSERT IGNORE INTO bank_details (user_id) VALUES (?)', [newId]).catch(() => {});
  await runner.query('INSERT IGNORE INTO emergency_contacts (user_id) VALUES (?)', [newId]).catch(() => {});

  return {
    id: newId,
    name,
    email: email.toLowerCase(),
    role: 'employee',
    must_change_password: Boolean(must_change_password)
  };
}

/**
 * Execute transactional bulk import of validated employees
 */
async function executeBulkImport({ rows, adminUserId, req, mode = 'atomic' }) {
  if (!rows || rows.length === 0) {
    throw new Error('No employee records provided for import.');
  }

  // Filter to valid/warning rows
  const candidates = rows.filter(r => r.status === 'valid' || r.status === 'warning');
  if (candidates.length === 0) {
    throw new Error('No valid employee records to import.');
  }

  if (mode === 'atomic' && rows.some(r => r.status === 'error')) {
    throw new Error('Atomic import aborted because the file contains validation errors. Please resolve all errors before importing.');
  }

  const connection = await db.getConnection();
  await connection.beginTransaction();

  const createdEmployees = [];
  const failedEmployees = [];

  try {
    const currentMonth = getCurrentMonthPassword();

    for (const item of candidates) {
      try {
        const password = item.hasCustomPassword && item.passwordToUse
          ? item.passwordToUse
          : currentMonth;

        const newEmp = await createEmployee({
          name: item.name,
          email: item.email,
          password,
          phone: item.phone,
          department: item.department || 'Operations',
          designation: item.designation || 'Loan Executive',
          username: item.username,
          must_change_password: 1 // Temporary onboarding credential -> must change password
        }, connection);

        createdEmployees.push({
          id: newEmp.id,
          name: newEmp.name,
          email: newEmp.email,
          rowNumber: item.rowNumber
        });
      } catch (rowErr) {
        if (mode === 'atomic') {
          throw new Error(`Row ${item.rowNumber} (${item.email}): ${rowErr.message}`);
        }
        failedEmployees.push({
          rowNumber: item.rowNumber,
          email: item.email,
          reason: rowErr.message
        });
      }
    }

    await connection.commit();

    // Log admin audit activity
    const activityMsg = `Bulk imported ${createdEmployees.length} employees (${failedEmployees.length} failed)`;
    await logActivity(adminUserId, activityMsg, req, 'Success');

    return {
      success: true,
      createdCount: createdEmployees.length,
      failedCount: failedEmployees.length,
      createdEmployees,
      failedEmployees,
      currentMonth
    };
  } catch (err) {
    await connection.rollback();
    await logActivity(adminUserId, `Bulk import failed: ${err.message}`, req, 'Failed');
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  getCurrentMonthPassword,
  generateExcelTemplate,
  parseAndValidateWorkbook,
  createEmployee,
  executeBulkImport,
  logActivity
};
