const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// Derive a consistent 32-byte key from environment secret
const SECRET_KEY = (() => {
  const secret = process.env.DOCUMENT_ENCRYPTION_KEY || process.env.JWT_SECRET || 'cln-kyc-doc-default-key-2026';
  return crypto.createHash('sha256').update(secret).digest();
})();

/**
 * Encrypt sensitive document password with AES-256-GCM
 * @param {string} text Plaintext password
 * @returns {string|null} Encrypted string in "iv:authTag:encryptedHex" format
 */
function encrypt(text) {
  if (text === null || text === undefined || text === '') return null;
  const str = String(text);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(str, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt sensitive document password
 * @param {string} ciphertext Encrypted string in "iv:authTag:encryptedHex" format
 * @returns {string|null} Plaintext password or null if invalid
 */
function decrypt(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') return null;
  try {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      // Return as-is if unencrypted legacy value
      return ciphertext;
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[cryptoUtil] Decryption failed:', err.message);
    return null;
  }
}

module.exports = { encrypt, decrypt };
