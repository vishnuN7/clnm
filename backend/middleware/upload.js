const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');

// ─── Decide storage: R2 in production, local disk in development ───────────

const useR2 = process.env.NODE_ENV === 'production' &&
              process.env.R2_ACCOUNT_ID &&
              process.env.R2_ACCESS_KEY_ID &&
              process.env.R2_SECRET_KEY &&
              process.env.R2_BUCKET_NAME;

// ─── Cloudflare R2 Client ──────────────────────────────────────────────────

let r2Client;
if (useR2) {
  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_KEY,
    },
  });
}

// ─── File filter (same for both storages) ─────────────────────────────────
// Checks BOTH the file extension AND the browser-reported MIME type — a
// quick, cheap barrier against someone simply renaming a file to .pdf.
// (True content-based/magic-byte verification is applied separately, after
// the file lands on disk — see verifyFileSignature below. It can't happen
// here because multer's fileFilter runs before the file body is available
// for streaming storage like multer-s3 or diskStorage.)

const ALLOWED_MIME_BY_EXT = {
  '.pdf':  ['application/pdf'],
  '.jpg':  ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png':  ['image/png'],
  '.webp': ['image/webp'],
};

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedMimes = ALLOWED_MIME_BY_EXT[ext];

  if (!allowedMimes) {
    return cb(new Error('Only PDF, JPG, PNG, and WEBP files are allowed.'));
  }
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(new Error(`File content does not match its .${ext.slice(1)} extension.`));
  }
  cb(null, true);
};

// ─── Magic-byte signature check (local disk storage only) ─────────────────
// Confirms the file's actual first bytes match a real PDF/JPEG/PNG/WEBP
// signature, not just its extension or declared MIME type. Call this after
// a local-disk upload completes; delete the file if it returns false.
const FILE_SIGNATURES = [
  { ext: '.pdf',  bytes: [0x25, 0x50, 0x44, 0x46] },             // %PDF
  { ext: '.jpg',  bytes: [0xFF, 0xD8, 0xFF] },                    // JPEG/JFIF
  { ext: '.jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { ext: '.png',  bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { ext: '.webp', bytes: [0x52, 0x49, 0x46, 0x46] },              // RIFF (WEBP container)
];

function verifyFileSignature(localPath, ext) {
  const rule = FILE_SIGNATURES.find(r => r.ext === ext.toLowerCase());
  if (!rule) return false;
  try {
    const fd = fs.openSync(localPath, 'r');
    const buf = Buffer.alloc(rule.bytes.length);
    fs.readSync(fd, buf, 0, rule.bytes.length, 0);
    fs.closeSync(fd);
    return rule.bytes.every((b, i) => buf[i] === b);
  } catch {
    return false;
  }
}

// ─── Unified post-upload verification (R2 or local disk) ──────────────────
// Call this right after a file is uploaded (R2 or disk). If it returns
// false, the caller should reject the request and delete the file via
// upload.deleteFile(fileUrl) — the extension/MIME check already passed by
// this point, but this confirms the actual bytes really are what they claim.
async function verifyUploadedFile(file, ext) {
  const rule = FILE_SIGNATURES.find(r => r.ext === ext.toLowerCase());
  if (!rule) return false;

  if (useR2 && file.key) {
    try {
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const command = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: file.key,
        Range: `bytes=0-${rule.bytes.length - 1}`,
      });
      const obj = await r2Client.send(command);
      const chunks = [];
      for await (const chunk of obj.Body) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      return rule.bytes.every((b, i) => buf[i] === b);
    } catch (err) {
      console.error('[Storage] verifyUploadedFile (R2) error:', err.message);
      return false;
    }
  }

  if (file.path) {
    return verifyFileSignature(file.path, ext);
  }
  return false;
}

// ─── Storage: Cloudflare R2 ────────────────────────────────────────────────

const r2Storage = useR2
  ? multerS3({
      s3: r2Client,
      bucket: process.env.R2_BUCKET_NAME,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (req, file, cb) => {
        const customerId = req.params.customerId || 'general';
        const ext  = path.extname(file.originalname).toLowerCase();
        const base = path.basename(file.originalname, ext)
                         .replace(/\s+/g, '_')
                         .replace(/[^a-zA-Z0-9_-]/g, '');
        const key = `customer_${customerId}/${base}-${Date.now()}${ext}`;
        cb(null, key);
      },
      metadata: (req, file, cb) => {
        cb(null, { uploadedBy: String(req.user?.id || 'unknown') });
      },
    })
  : null;

// ─── Storage: Local Disk (development fallback) ────────────────────────────

const uploadsBase = path.join(__dirname, '..', 'uploads');
if (!useR2 && !fs.existsSync(uploadsBase)) {
  fs.mkdirSync(uploadsBase, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const customerId = req.params.customerId || 'general';
    const dir = path.join(uploadsBase, `customer_${customerId}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
                     .replace(/\s+/g, '_')
                     .replace(/[^a-zA-Z0-9_-]/g, '');
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

// ─── Export multer instance ────────────────────────────────────────────────

const upload = multer({
  storage:    useR2 ? r2Storage : diskStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ─── Helper: get the public URL of an uploaded file ───────────────────────
// In R2: file.location is set by multer-s3 automatically.
// In local disk: build a path relative to /uploads.

upload.getFileUrl = (req, file) => {
  if (useR2) {
    // Build the public URL manually — file.location points to the
    // private S3 API endpoint, not the public R2.dev URL
    return `${process.env.R2_PUBLIC_URL}/${file.key}`;
  }
  const customerId = req.params.customerId || 'general';
  return `/uploads/customer_${customerId}/${file.filename}`;
};

// ─── Helper: profile pictures ─────────────────────────────────────────────

const profilePicStorage = useR2
  ? multerS3({
      s3: r2Client,
      bucket: process.env.R2_BUCKET_NAME,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (req, file, cb) => {
        const ext  = path.extname(file.originalname).toLowerCase();
        const key  = `profile_pics/avatar_${req.user?.id || 'unknown'}_${Date.now()}${ext}`;
        cb(null, key);
      },
    })
  : multer.diskStorage({
      destination: (req, file, cb) => {
        const dir = path.join(uploadsBase, 'profile_pics');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `avatar_${req.user?.id || 'unknown'}_${Date.now()}${ext}`);
      },
    });

const kycStorage = useR2
  ? multerS3({
      s3: r2Client,
      bucket: process.env.R2_BUCKET_NAME,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const key = `kyc_docs/kyc_${req.user?.id || 'unknown'}_doc_${Date.now()}${ext}`;
        cb(null, key);
      },
    })
  : multer.diskStorage({
      destination: (req, file, cb) => {
        const dir = path.join(uploadsBase, 'kyc_docs');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `kyc_${req.user?.id || 'unknown'}_doc_${Date.now()}${ext}`);
      },
    });

upload.profilePic = multer({
  storage: profilePicStorage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
});

upload.kyc = multer({
  storage: kycStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ─── Helper: delete a file from R2 (or local disk) given its stored URL ───

upload.deleteFile = async (fileUrl) => {
  if (!fileUrl) return;
  try {
    if (useR2 && fileUrl.startsWith(process.env.R2_PUBLIC_URL)) {
      const key = fileUrl.replace(`${process.env.R2_PUBLIC_URL}/`, '');
      await r2Client.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
      }));
      console.log(`[R2] Deleted file: ${key}`);
    } else if (!useR2 && fileUrl.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, '..', fileUrl);
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    }
  } catch (err) {
    console.error('[Storage] Failed to delete file:', fileUrl, err.message);
  }
};

console.log(`File storage: ${useR2 ? 'Cloudflare R2 ☁️' : 'Local disk 💾'}`);

upload.verifyUploadedFile = verifyUploadedFile;

module.exports = upload;
