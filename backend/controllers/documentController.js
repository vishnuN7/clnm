const DocumentModel = require('../models/documentModel');
const CustomerModel = require('../models/customerModel');
const path = require('path');
const fs = require('fs');

const useR2 = process.env.NODE_ENV === 'production' &&
              process.env.R2_ACCOUNT_ID &&
              process.env.R2_ACCESS_KEY_ID &&
              process.env.R2_SECRET_KEY &&
              process.env.R2_BUCKET_NAME;

let r2Client;
if (useR2) {
  const { S3Client } = require('@aws-sdk/client-s3');
  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_KEY,
    },
  });
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
 * Checks whether the logged-in user is allowed to view this document:
 * - Admins can view any document
 * - Employees can only view documents for customers they personally added
 */
async function canAccessDocument(user, doc) {
  if (!doc) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'employee') {
    const customer = await CustomerModel.findById(doc.customer_id);
    return !!customer && customer.added_by === user.id;
  }
  return false;
}

const documentController = {
  // ── GET /api/documents/:id/view ────────────────────────────────
  // Streams the actual file bytes through the backend so that documents
  // are never reachable via a public/guessable URL. Requires a valid
  // Authorization header, and checks the requester actually owns
  // (or administers) the related customer before releasing any data.
  async viewDocument(req, res) {
    try {
      const { id } = req.params;
      const doc = await DocumentModel.findById(id);
      if (!doc) {
        return res.status(404).json({ success: false, message: 'Document not found.' });
      }

      const allowed = await canAccessDocument(req.user, doc);
      if (!allowed) {
        return res.status(403).json({ success: false, message: 'You do not have permission to view this document.' });
      }

      const contentType = contentTypeFor(doc.file_name);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
      // Never let this response be cached by shared/proxy caches
      res.setHeader('Cache-Control', 'private, no-store');

      // ── R2-hosted file ──────────────────────────────────────────
      if (useR2 && doc.file_path && doc.file_path.startsWith(process.env.R2_PUBLIC_URL)) {
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const key = doc.file_path.replace(`${process.env.R2_PUBLIC_URL}/`, '');
        const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
        const object = await r2Client.send(command);
        return object.Body.pipe(res);
      }

      // ── Local disk fallback (development) ───────────────────────
      if (doc.file_path && doc.file_path.startsWith('/uploads/')) {
        const localPath = path.join(__dirname, '..', doc.file_path);
        if (fs.existsSync(localPath)) {
          return fs.createReadStream(localPath).pipe(res);
        }
      }

      // ── Last resort: file bytes stored directly in DB (legacy) ──
      if (doc.file_data) {
        return res.send(doc.file_data);
      }

      return res.status(404).json({ success: false, message: 'File could not be located in storage.' });
    } catch (err) {
      console.error('[Document] viewDocument error:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load document.' });
    }
  }
};

module.exports = documentController;