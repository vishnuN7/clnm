const DocumentModel = require('../models/documentModel');
const CustomerModel = require('../models/customerModel');
const path = require('path');
const fs = require('fs');

// Initialize Cloudflare R2 client if credentials exist in environment
const useR2 = Boolean(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_KEY &&
  process.env.R2_BUCKET_NAME
);

let r2Client = null;
if (useR2) {
  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_KEY,
      },
    });
  } catch (initErr) {
    console.error('[Document] Failed to initialize R2 S3Client:', initErr.message);
  }
}

function contentTypeFor(fileName) {
  const ext = path.extname(fileName || '').toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

/**
 * Checks whether the logged-in user is allowed to view/download this document:
 * - Admins can view any document
 * - Employees can view documents for customers they added OR documents they uploaded
 */
async function canAccessDocument(user, doc) {
  if (!doc) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'employee') {
    const customer = await CustomerModel.findById(doc.customer_id);
    if (!customer) return false;
    if (String(customer.added_by) === String(user.id)) return true;
    if (String(doc.uploaded_by) === String(user.id)) return true;
    return false;
  }
  return false;
}

/**
 * Generates all plausible Cloudflare R2 storage keys from a file path or URL
 */
function extractCandidateKeys(filePath, customerId) {
  if (!filePath) return [];
  const keys = [];

  // 1. If full URL (e.g. https://pub-xxx.r2.dev/customer_123/file.pdf or https://account.r2.cloudflarestorage.com/bucket/customer_123/file.pdf)
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    try {
      const u = new URL(filePath);
      let p = u.pathname.replace(/^\/+/, '');
      const bucketName = process.env.R2_BUCKET_NAME;
      if (bucketName && p.startsWith(bucketName + '/')) {
        p = p.substring(bucketName.length + 1);
      }
      keys.push(p);
      if (p.startsWith('uploads/')) {
        keys.push(p.replace(/^uploads\//, ''));
      }
    } catch (_) {
      keys.push(filePath.replace(/^https?:\/\/[^\/]+\//, ''));
    }
  }

  // 2. If starts with /uploads/
  if (filePath.startsWith('/uploads/')) {
    keys.push(filePath.replace(/^\/uploads\//, ''));
    keys.push(filePath.replace(/^\/+/, ''));
  }

  // 3. Raw cleaned path
  const rawClean = filePath.replace(/^\/+/, '');
  if (!keys.includes(rawClean)) {
    keys.push(rawClean);
  }

  // 4. Strip R2_PUBLIC_URL if present
  if (process.env.R2_PUBLIC_URL) {
    const cleanPub = process.env.R2_PUBLIC_URL.replace(/\/+$/, '');
    if (filePath.startsWith(cleanPub)) {
      const stripped = filePath.replace(cleanPub, '').replace(/^\/+/, '');
      if (stripped && !keys.includes(stripped)) keys.push(stripped);
    }
  }

  // 5. Customer folder fallback
  const baseName = path.basename(filePath);
  if (customerId && baseName) {
    const custKey = `customer_${customerId}/${baseName}`;
    if (!keys.includes(custKey)) keys.push(custKey);
  }

  return [...new Set(keys.filter(Boolean))];
}

/**
 * Core stream handler for viewing or downloading a document
 */
async function serveDocument(req, res, isDownload = false) {
  try {
    const { id } = req.params;
    const doc = await DocumentModel.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    const allowed = await canAccessDocument(req.user, doc);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'You do not have permission to access this document.' });
    }

    const contentType = contentTypeFor(doc.file_name);
    const dispositionType = isDownload ? 'attachment' : 'inline';
    const sanitizedFileName = (doc.file_name || 'document').replace(/["\r\n]/g, '_');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${dispositionType}; filename="${sanitizedFileName}"; filename*=UTF-8''${encodeURIComponent(doc.file_name || 'document')}`);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cache-Control', 'private, no-store');

    // ── 1. Cloudflare R2 via S3Client ──────────────────────────────
    if (r2Client && process.env.R2_BUCKET_NAME) {
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const candidateKeys = extractCandidateKeys(doc.file_path, doc.customer_id);

      for (const key of candidateKeys) {
        try {
          const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
          });
          const object = await r2Client.send(command);
          if (object && object.Body) {
            return object.Body.pipe(res);
          }
        } catch (_) {
          // Candidate key not found, continue to next candidate
        }
      }
    }

    // ── 2. Direct HTTP/HTTPS fetch fallback (Cloudflare public R2.dev or CDN) ──
    if (doc.file_path && (doc.file_path.startsWith('http://') || doc.file_path.startsWith('https://'))) {
      try {
        const fetchRes = await fetch(doc.file_path);
        if (fetchRes.ok) {
          const arrayBuffer = await fetchRes.arrayBuffer();
          return res.send(Buffer.from(arrayBuffer));
        }
      } catch (httpErr) {
        console.warn('[Document] Direct HTTP fetch failed:', httpErr.message);
      }
    }

    // ── 3. Local disk fallback (development) ─────────────────────────
    if (doc.file_path) {
      const cleanPath = doc.file_path.startsWith('/') ? doc.file_path : `/${doc.file_path}`;
      const localPath = path.join(__dirname, '..', cleanPath);
      if (fs.existsSync(localPath)) {
        return fs.createReadStream(localPath).pipe(res);
      }

      if (!doc.file_path.startsWith('/uploads/')) {
        const uploadsPath = path.join(__dirname, '..', 'uploads', cleanPath);
        if (fs.existsSync(uploadsPath)) {
          return fs.createReadStream(uploadsPath).pipe(res);
        }
      }
    }

    // ── 4. Last resort: file bytes stored directly in DB (legacy) ──
    if (doc.file_data) {
      return res.send(doc.file_data);
    }

    return res.status(404).json({ success: false, message: 'File could not be located in storage.' });
  } catch (err) {
    console.error('[Document] serveDocument error:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Failed to load document.' });
    }
  }
}

const documentController = {
  // ── GET /api/documents/:id/view ────────────────────────────────
  async viewDocument(req, res) {
    return serveDocument(req, res, false);
  },

  // ── GET /api/documents/:id/download ────────────────────────────
  async downloadDocument(req, res) {
    return serveDocument(req, res, true);
  }
};

module.exports = documentController;