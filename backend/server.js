require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const employeeRoutes = require('./routes/employee');

const { loginLimiter, apiLimiter } = require('./middleware/rateLimit');

const app = express();

// Trust the reverse proxy on VPS/Nginx so req.ip and secure cookies behave correctly
app.set('trust proxy', 1);

// ── Middleware ──────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5000',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
  process.env.ALLOWED_ORIGIN || 'http://localhost:5000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
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
  // Only for non-API routes
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
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
app.listen(PORT, () => {
  console.log(`\nCLN Server running at http://localhost:${PORT}`);
  console.log(`Admin login: admin@cln.com / Admin@123`);
  console.log(`Employee login: employee@cln.com / Employee@123\n`);
});
