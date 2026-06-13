require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/db');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const employeeRoutes = require('./routes/employee');
const { debugResendEnvironment } = require('./utils/mailer');

const { loginLimiter, apiLimiter } = require('./middleware/rateLimit');

const app = express();

// Trust the reverse proxy on VPS/Nginx so req.ip and secure cookies behave correctly
app.set('trust proxy', 1);

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/$/, '');
}

function getAllowedOrigins() {
  const localOrigins = [
    'http://localhost:5000',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080'
  ];

  const configuredOrigins = [process.env.ALLOWED_ORIGIN, process.env.FRONTEND_BASE_URL]
    .filter(Boolean)
    .flatMap((value) => value.split(','))
    .map(normalizeOrigin)
    .filter(Boolean);

  return [...new Set([...localOrigins, ...configuredOrigins])];
}

function isAllowedOrigin(origin, allowedOrigins) {
  if (allowedOrigins.includes(origin)) return true;

  try {
    const hostname = new URL(origin).hostname;
    return hostname.endsWith('.netlify.app') || hostname.endsWith('.onrender.com');
  } catch {
    return false;
  }
}

// ── Middleware ──────────────────────────────────────────────────
const allowedOrigins = getAllowedOrigins();

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);

    if (isAllowedOrigin(origin, allowedOrigins)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Security Headers ────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;");
  next();
});

// Serve uploaded documents
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Apply rate limiting to API routes before handlers
app.use('/api/', apiLimiter);

// ── API Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/employee', employeeRoutes);

// ── SPA Fallback (serve login page for unknown routes) ──────────
app.get('*', (req, res) => {
  // Only for non-API and non-uploads routes
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  } else {
    res.status(404).send('Not Found');
  }
});

// ── Global Error Handler ────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// ── Start Server ────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function ensureDefaultAdminAccount() {
  const adminEmail = 'dixitlendingsolution@gmail.com';
  const legacyAdminEmail = 'admin@cln.com';

  try {
    const [existingTarget] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [adminEmail]);
    if (existingTarget.length > 0) return;

    const [legacyAdmin] = await db.query('SELECT id FROM users WHERE email = ? AND role = ? LIMIT 1', [legacyAdminEmail, 'admin']);
    if (legacyAdmin.length === 0) return;

    await db.query('UPDATE users SET email = ? WHERE id = ?', [adminEmail, legacyAdmin[0].id]);
    console.log(`Updated admin login email from ${legacyAdminEmail} to ${adminEmail}`);
  } catch (err) {
    console.error('Failed to ensure default admin account:', err.message);
  }
}

async function ensurePasswordResetTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_password_reset_user_id (user_id),
      INDEX idx_password_reset_expires_at (expires_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  try {
    await db.query(sql);
  } catch (err) {
    console.error('Failed to ensure password reset table:', err.message);
  }
}

async function ensureDocumentsTable() {
  const allowedDocTypes = [
    'Aadhar',
    'PAN',
    'Passport',
    'Driving License',
    '3M Bank Statement',
    '3M Salary Slip',
    'Other'
  ];

  const enumValues = allowedDocTypes.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');

  try {
    await db.query(`ALTER TABLE documents MODIFY doc_type ENUM(${enumValues}) NOT NULL`);

    const [passwordColumn] = await db.query("SHOW COLUMNS FROM documents LIKE 'document_password'");
    if (passwordColumn.length === 0) {
      await db.query('ALTER TABLE documents ADD COLUMN document_password VARCHAR(255) NULL AFTER doc_type');
    }
  } catch (err) {
    console.error('Failed to ensure documents table schema:', err.message);
  }
}

async function ensureLoansTable() {
  const allowedStatuses = ['Pending', 'Approved', 'Rejected', 'ABND', 'Other'];
  const enumValues = allowedStatuses.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');

  try {
    await db.query(`ALTER TABLE loans MODIFY status ENUM(${enumValues}) NOT NULL DEFAULT 'Pending'`);
  } catch (err) {
    console.error('Failed to ensure loans table schema:', err.message);
  }
}

Promise.all([ensureDefaultAdminAccount(), ensurePasswordResetTable(), ensureDocumentsTable(), ensureLoansTable()]).finally(() => {
  app.listen(PORT, () => {
    console.log(`\nCLN Server running at http://localhost:${PORT}`);
    console.log(`Admin login: dixitlendingsolution@gmail.com / Utkarsh.3112`);
    console.log(`Employee login: employee@cln.com / Employee@123\n`);
    debugResendEnvironment();
  });
});
