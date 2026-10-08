/**
 * Geolocation Service
 * Provides robust IP address extraction, localhost/private network detection,
 * multi-tier caching (in-memory + database table), and external GeoIP lookups
 * with automatic fallback between providers (ip-api.com and ipapi.co).
 */

const db = require('../config/db');

// In-memory cache for ultra-fast lookups during runtime (TTL: 24 hours)
const memCache = new Map();
const MEM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MEM_CACHE_SIZE = 10000;

/**
 * Extracts and cleans the real client IP address from an Express request,
 * properly handling reverse proxies (Cloudflare, Nginx, Render, load balancers).
 * Strips IPv6-mapped IPv4 prefixes (::ffff:).
 */
function extractClientIp(req) {
  if (!req) return null;

  let rawIp = null;

  // 1. Cloudflare header
  if (req.headers && req.headers['cf-connecting-ip']) {
    rawIp = req.headers['cf-connecting-ip'];
  }
  // 2. Nginx / reverse proxy standard real IP
  else if (req.headers && req.headers['x-real-ip']) {
    rawIp = req.headers['x-real-ip'];
  }
  // 3. Standard proxy header (take client/left-most IP)
  else if (req.headers && req.headers['x-forwarded-for']) {
    const list = String(req.headers['x-forwarded-for']).split(',');
    rawIp = list[0]?.trim();
  }
  // 4. Express req.ip (configured with trust proxy)
  else if (req.ip) {
    rawIp = req.ip;
  }
  // 5. Connection / socket remote address
  else if (req.socket && req.socket.remoteAddress) {
    rawIp = req.socket.remoteAddress;
  } else if (req.connection && req.connection.remoteAddress) {
    rawIp = req.connection.remoteAddress;
  }

  if (!rawIp) return null;

  let cleanIp = String(rawIp).trim();
  // Strip IPv6-mapped IPv4 prefix
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.substring(7);
  }

  // Basic validation for IP format (IPv4 or IPv6 or localhost)
  if (cleanIp === '::1' || cleanIp === '127.0.0.1' || cleanIp === 'localhost') {
    return cleanIp;
  }

  // IPv4 or IPv6 pattern
  const isIpv4 = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(cleanIp);
  const isIpv6 = cleanIp.includes(':');

  if (isIpv4 || isIpv6) {
    return cleanIp;
  }

  return null;
}

/**
 * Checks whether an IP address is a localhost address.
 */
function isLocalhost(ip) {
  if (!ip) return true;
  const n = String(ip).trim().toLowerCase();
  return (
    n === '::1' ||
    n === '127.0.0.1' ||
    n === 'localhost' ||
    n.startsWith('127.') ||
    n === '0.0.0.0'
  );
}

/**
 * Checks whether an IP is within private RFC 1918 or link-local address spaces.
 */
function isPrivateIp(ip) {
  if (!ip) return false;
  const s = String(ip).trim();

  // 10.0.0.0 - 10.255.255.255
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) return true;
  // 172.16.0.0 - 172.31.255.255
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(s)) return true;
  // 192.168.0.0 - 192.168.255.255
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(s)) return true;
  // 169.254.0.0 - 169.254.255.255 (link-local)
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(s)) return true;
  // IPv6 unique local / link-local
  if (/^(fc|fd|fe80)/i.test(s)) return true;

  return false;
}

/**
 * Formats a clean Admin-friendly location string:
 * - "City, Region, Country" (e.g. "Pune, Maharashtra, India")
 * - "Region, Country" (e.g. "Maharashtra, India")
 * - "Country" (e.g. "India")
 * - "Localhost / Development" for localhost
 * - "Private Network / LAN" for private IPs
 */
function formatLocationName(geo) {
  if (!geo) return 'Localhost / Development';
  if (geo.is_localhost) return 'Localhost / Development';
  if (geo.is_private) return 'Private Network / LAN';

  const parts = [];
  const city = geo.city && geo.city.trim() !== '' && geo.city !== 'N/A' ? geo.city.trim() : null;
  const region = geo.region && geo.region.trim() !== '' && geo.region !== 'N/A' ? geo.region.trim() : null;
  const country = geo.country && geo.country.trim() !== '' && geo.country !== 'N/A' ? geo.country.trim() : null;

  if (city) parts.push(city);
  if (region && region !== city) parts.push(region);
  if (country) parts.push(country);

  if (parts.length > 0) {
    return parts.join(', ');
  }

  return 'Location unavailable';
}

/**
 * Ensures the persistent ip_geolocation_cache table exists in the database.
 */
async function ensureCacheTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ip_geolocation_cache (
        ip_address VARCHAR(64) PRIMARY KEY,
        city VARCHAR(100) NULL,
        region VARCHAR(100) NULL,
        country VARCHAR(100) NULL,
        country_code VARCHAR(10) NULL,
        isp VARCHAR(150) NULL,
        latitude DECIMAL(10, 7) NULL,
        longitude DECIMAL(10, 7) NULL,
        source VARCHAR(50) NULL,
        resolved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_resolved_at (resolved_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    console.error('[Geolocation] Failed to ensure ip_geolocation_cache table:', err.message);
  }
}

/**
 * Stores resolved geolocation in memory cache and database cache.
 */
async function saveToCache(ip, geo) {
  if (!ip || isLocalhost(ip) || isPrivateIp(ip)) return;

  // 1. In-memory
  if (memCache.size >= MAX_MEM_CACHE_SIZE) {
    const oldestKey = memCache.keys().next().value;
    memCache.delete(oldestKey);
  }
  memCache.set(ip, {
    data: geo,
    expiresAt: Date.now() + MEM_CACHE_TTL_MS
  });

  // 2. Database table
  try {
    await db.query(`
      INSERT INTO ip_geolocation_cache 
        (ip_address, city, region, country, country_code, isp, latitude, longitude, source, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        city = VALUES(city),
        region = VALUES(region),
        country = VALUES(country),
        country_code = VALUES(country_code),
        isp = VALUES(isp),
        latitude = VALUES(latitude),
        longitude = VALUES(longitude),
        source = VALUES(source),
        updated_at = NOW()
    `, [
      ip,
      geo.city || null,
      geo.region || null,
      geo.country || null,
      geo.country_code || null,
      geo.isp || null,
      geo.latitude != null ? geo.latitude : null,
      geo.longitude != null ? geo.longitude : null,
      geo.source || 'unknown'
    ]);
  } catch (err) {
    console.error('[Geolocation] Cache DB insert error:', err.message);
  }
}

/**
 * Fetches geolocation from ip-api.com (primary provider).
 */
async function fetchFromIpApi(ip) {
  const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`;
  const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'success') {
    throw new Error(data.message || 'ip-api lookup returned fail status');
  }

  return {
    ip,
    city: data.city || null,
    region: data.regionName || null,
    country: data.country || null,
    country_code: data.countryCode || null,
    isp: data.isp || data.org || null,
    latitude: data.lat != null ? Number(data.lat) : null,
    longitude: data.lon != null ? Number(data.lon) : null,
    source: 'ip-api'
  };
}

/**
 * Fetches geolocation from ipapi.co (secondary fallback provider).
 */
async function fetchFromIpapiCo(ip) {
  const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'cln-crm-apr/1.0' },
    signal: AbortSignal.timeout(3500)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) {
    throw new Error(data.reason || 'ipapi.co returned error');
  }

  return {
    ip,
    city: data.city || null,
    region: data.region || null,
    country: data.country_name || null,
    country_code: data.country_code || null,
    isp: data.org || null,
    latitude: data.latitude != null ? Number(data.latitude) : null,
    longitude: data.longitude != null ? Number(data.longitude) : null,
    source: 'ipapi.co'
  };
}

/**
 * Resolves location for a single IP address.
 * Follows strict priority:
 * 1. Localhost check -> "Localhost / Development"
 * 2. Private IP check -> "Private Network / LAN"
 * 3. Memory cache
 * 4. DB cache table
 * 5. Primary external provider (ip-api.com)
 * 6. Fallback external provider (ipapi.co)
 */
async function resolveIpLocation(ip) {
  if (!ip || isLocalhost(ip)) {
    return {
      ip: ip || '::1',
      is_localhost: true,
      is_private: false,
      location: 'Localhost / Development',
      city: null,
      region: null,
      country: null,
      country_code: null,
      isp: 'Localhost Loopback',
      latitude: null,
      longitude: null,
      source: 'localhost'
    };
  }

  if (isPrivateIp(ip)) {
    return {
      ip,
      is_localhost: false,
      is_private: true,
      location: 'Private Network / LAN',
      city: null,
      region: null,
      country: null,
      country_code: null,
      isp: 'Internal Network',
      latitude: null,
      longitude: null,
      source: 'private_ip'
    };
  }

  // 1. Check in-memory cache
  const cachedMem = memCache.get(ip);
  if (cachedMem && cachedMem.expiresAt > Date.now()) {
    return {
      ...cachedMem.data,
      location: formatLocationName(cachedMem.data),
      is_localhost: false,
      is_private: false
    };
  }

  // 2. Check DB persistent cache
  try {
    const [rows] = await db.query(
      'SELECT city, region, country, country_code, isp, latitude, longitude, source FROM ip_geolocation_cache WHERE ip_address = ? LIMIT 1',
      [ip]
    );
    if (rows && rows.length > 0) {
      const row = rows[0];
      const geo = {
        ip,
        city: row.city,
        region: row.region,
        country: row.country,
        country_code: row.country_code,
        isp: row.isp,
        latitude: row.latitude != null ? Number(row.latitude) : null,
        longitude: row.longitude != null ? Number(row.longitude) : null,
        source: row.source || 'db_cache'
      };

      // Populate memory cache
      memCache.set(ip, {
        data: geo,
        expiresAt: Date.now() + MEM_CACHE_TTL_MS
      });

      return {
        ...geo,
        location: formatLocationName(geo),
        is_localhost: false,
        is_private: false
      };
    }
  } catch (err) {
    console.error('[Geolocation] Cache lookup DB error:', err.message);
  }

  // 3. Fetch from external provider (primary: ip-api.com)
  let geoResult = null;
  try {
    geoResult = await fetchFromIpApi(ip);
  } catch (err1) {
    console.warn(`[Geolocation] Primary provider failed for IP ${ip}: ${err1.message}. Trying secondary...`);
    try {
      geoResult = await fetchFromIpapiCo(ip);
    } catch (err2) {
      console.error(`[Geolocation] Secondary provider also failed for IP ${ip}: ${err2.message}`);
    }
  }

  if (geoResult) {
    geoResult.location = formatLocationName(geoResult);
    geoResult.is_localhost = false;
    geoResult.is_private = false;
    // Persist to cache
    saveToCache(ip, geoResult).catch(() => {});
    return geoResult;
  }

  // 4. Graceful fallback if completely unresolvable
  return {
    ip,
    is_localhost: false,
    is_private: false,
    location: 'Location unavailable',
    city: null,
    region: null,
    country: null,
    country_code: null,
    isp: null,
    latitude: null,
    longitude: null,
    source: 'failed'
  };
}

/**
 * Resolves locations for a batch of IPs efficiently.
 * Uses cache lookup and parallel fetching for uncached IPs.
 */
async function resolveMultipleIps(ipList) {
  const result = new Map();
  if (!Array.isArray(ipList) || ipList.length === 0) return result;

  const uniqueIps = Array.from(new Set(ipList.filter(Boolean)));
  const toLookup = [];

  for (const ip of uniqueIps) {
    if (isLocalhost(ip)) {
      result.set(ip, {
        ip,
        is_localhost: true,
        is_private: false,
        location: 'Localhost / Development',
        city: null,
        region: null,
        country: null,
        country_code: null,
        isp: 'Localhost Loopback',
        latitude: null,
        longitude: null,
        source: 'localhost'
      });
      continue;
    }
    if (isPrivateIp(ip)) {
      result.set(ip, {
        ip,
        is_localhost: false,
        is_private: true,
        location: 'Private Network / LAN',
        city: null,
        region: null,
        country: null,
        country_code: null,
        isp: 'Internal Network',
        latitude: null,
        longitude: null,
        source: 'private_ip'
      });
      continue;
    }

    // Check memory cache
    const mem = memCache.get(ip);
    if (mem && mem.expiresAt > Date.now()) {
      result.set(ip, {
        ...mem.data,
        location: formatLocationName(mem.data),
        is_localhost: false,
        is_private: false
      });
      continue;
    }

    toLookup.push(ip);
  }

  if (toLookup.length > 0) {
    // Check DB cache for batch
    try {
      const placeholders = toLookup.map(() => '?').join(',');
      const [rows] = await db.query(
        `SELECT ip_address, city, region, country, country_code, isp, latitude, longitude, source 
         FROM ip_geolocation_cache WHERE ip_address IN (${placeholders})`,
        toLookup
      );

      const foundInDb = new Set();
      for (const row of rows) {
        foundInDb.add(row.ip_address);
        const geo = {
          ip: row.ip_address,
          city: row.city,
          region: row.region,
          country: row.country,
          country_code: row.country_code,
          isp: row.isp,
          latitude: row.latitude != null ? Number(row.latitude) : null,
          longitude: row.longitude != null ? Number(row.longitude) : null,
          source: row.source || 'db_cache'
        };
        memCache.set(row.ip_address, { data: geo, expiresAt: Date.now() + MEM_CACHE_TTL_MS });
        result.set(row.ip_address, {
          ...geo,
          location: formatLocationName(geo),
          is_localhost: false,
          is_private: false
        });
      }

      // External lookups for any remaining
      const stillNeed = toLookup.filter(ip => !foundInDb.has(ip));
      if (stillNeed.length > 0) {
        // Resolve uncached IPs concurrently (batches of 5)
        for (let i = 0; i < stillNeed.length; i += 5) {
          const chunk = stillNeed.slice(i, i + 5);
          await Promise.all(
            chunk.map(async (ip) => {
              const res = await resolveIpLocation(ip);
              result.set(ip, res);
            })
          );
        }
      }
    } catch (err) {
      console.error('[Geolocation] Batch lookup error:', err.message);
    }
  }

  return result;
}

module.exports = {
  extractClientIp,
  isLocalhost,
  isPrivateIp,
  formatLocationName,
  ensureCacheTable,
  resolveIpLocation,
  resolveMultipleIps
};
