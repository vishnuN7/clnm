/**
 * Office network restriction (employees only).
 *
 * The backend runs in the cloud, so it cannot see the office's private LAN.
 * It sees the office's PUBLIC IP (shared by everyone behind the same router).
 * Employees are allowed only when that public IP is in OFFICE_ALLOWED_IPS.
 *
 * Env (Render):
 *   OFFICE_ALLOWED_IPS = comma-separated IPs or IPv4 CIDRs, e.g. "103.21.4.55,2405:201::1,49.36.0.0/24"
 *   OFFICE_RESTRICTION  = "off" to disable. If OFFICE_ALLOWED_IPS is empty the check is skipped
 *                         (fail-open, so a missing variable can never lock everyone out).
 * Admins are never restricted.
 */
const geolocationService = require('../services/geolocationService');

function ipv4ToInt(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

function ipv6ToBig(ip) {
  try {
    let h = ip.split('%')[0];
    if (h.includes('::')) {
      const [a, b] = h.split('::');
      const L = a ? a.split(':') : [], R = b ? b.split(':') : [];
      h = [...L, ...Array(8 - L.length - R.length).fill('0'), ...R].join(':');
    }
    const g = h.split(':');
    if (g.length !== 8) return null;
    return g.reduce((acc, x) => (acc << 16n) + BigInt(parseInt(x || '0', 16)), 0n);
  } catch (e) { return null; }
}

function matches(ip, rule) {
  if (!rule) return false;
  if (rule.includes('/') && (rule.includes(':') || ip.includes(':'))) {
    const [base, bitsStr] = rule.split('/');
    const bits = BigInt(parseInt(bitsStr, 10));
    const a = ipv6ToBig(ip), b = ipv6ToBig(base);
    if (a === null || b === null || bits < 0n || bits > 128n) return false;
    const shift = 128n - bits;
    return (a >> shift) === (b >> shift);
  }
  if (rule.includes('/')) {
    const [base, bitsStr] = rule.split('/');
    const bits = parseInt(bitsStr, 10);
    const a = ipv4ToInt(ip), b = ipv4ToInt(base);
    if (a === null || b === null || !(bits >= 0 && bits <= 32)) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((a & mask) >>> 0) === ((b & mask) >>> 0);
  }
  return ip.toLowerCase() === rule.toLowerCase();
}

function getRules() {
  return (process.env.OFFICE_ALLOWED_IPS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

/** Returns { allowed, ip } for the current request. */
function checkOfficeNetwork(req) {
  const rules = getRules();
  const ip = geolocationService.extractClientIp(req);
  if ((process.env.OFFICE_RESTRICTION || '').toLowerCase() === 'off' || rules.length === 0) {
    if (!global.__officeWarned) {
      global.__officeWarned = true;
      console.warn('[OfficeNetwork] RESTRICTION INACTIVE: OFFICE_ALLOWED_IPS is empty or OFFICE_RESTRICTION=off. All employee IPs are allowed.');
    }
    return { allowed: true, ip };
  }
  const allowed = !!ip && rules.some(r => matches(ip, r));
  if (!global.__officeLogged) {
    global.__officeLogged = true;
    console.log(`[OfficeNetwork] Restriction ACTIVE with ${rules.length} rule(s): ${rules.join(', ')}`);
  }
  console.log(`[OfficeNetwork] employee request from ${ip} -> ${allowed ? 'allowed' : 'BLOCKED'}`);
  return { allowed, ip };
}

const OFFICE_ONLY_MESSAGE =
  'Access denied. Employees can only sign in from the office network (office Wi-Fi/LAN). Please connect to the office network and try again.';

module.exports = { checkOfficeNetwork, OFFICE_ONLY_MESSAGE };