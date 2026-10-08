// ── API Base URL ──────────────────────────────────────────────
// Dynamically detect API URL to support different environments
const API_BASE = (() => {
  const { protocol, hostname, host } = window.location;
  const configuredBase = window.__CLN_API_BASE__;

  if (configuredBase) {
    return configuredBase.replace(/\/$/, '') + '/api';
  }

  // If frontend is opened as a local file, target local backend.
  if (protocol === 'file:') {
    return 'http://localhost:5000/api';
  }

  // In local dev, use the local backend. Preserve same-origin when already on :5000.
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    if (host.endsWith(':5000')) {
      return `${protocol}//${host}/api`;
    }

    return `${protocol}//${hostname}:5000/api`;
  }

  // In production, use same-origin API.
  return `${protocol}//${host}/api`;
})();

// Base URL for serving uploads (same host as API without the /api suffix)
const UPLOADS_BASE = API_BASE.replace(/\/api$/i, '');

// ── Theme controls ─────────────────────────────────────────────
const THEME_STORAGE_KEY = 'cln_theme';

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch (err) {
    return null;
  }
}

function getResolvedTheme() {
  const stored = getStoredTheme();
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setStoredTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (err) {}
}

function updateThemeColorMeta(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  meta.setAttribute('content', theme === 'dark' ? '#0c1219' : '#006b3c');
}

function runThemeChangeAnimation() {
  const root = document.documentElement;
  root.classList.remove('theme-transitioning');
  void root.offsetWidth;
  root.classList.add('theme-transitioning');
  window.clearTimeout(runThemeChangeAnimation.timer);
  runThemeChangeAnimation.timer = window.setTimeout(() => {
    root.classList.remove('theme-transitioning');
  }, 720);
}

function updateThemeToggleButtons() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  const nextLabel = next === 'light' ? 'sunrise mode' : 'night mode';
  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    if (!btn.classList.contains('orbit-theme-toggle')) return;
    btn.dataset.themeState = current;
    btn.setAttribute('aria-pressed', current === 'dark' ? 'true' : 'false');
    btn.setAttribute('aria-label', `Switch to ${nextLabel}`);
    btn.title = `Switch to ${nextLabel}`;
  });
}

function applyTheme(theme, options = {}) {
  const resolvedTheme = theme === 'light' || theme === 'dark' ? theme : getResolvedTheme();
  const previousTheme = document.documentElement.getAttribute('data-theme');
  const shouldAnimate = Boolean(options.animate && previousTheme && previousTheme !== resolvedTheme);

  document.documentElement.setAttribute('data-theme', resolvedTheme);
  setStoredTheme(resolvedTheme);
  updateThemeColorMeta(resolvedTheme);
  if (shouldAnimate) runThemeChangeAnimation();
  updateThemeToggleButtons();
  window.dispatchEvent(new CustomEvent('cln:themechange', { detail: { theme: resolvedTheme } }));
}

function createOrbitThemeToggleMarkup() {
  return `
    <span class="orbit-atmosphere" aria-hidden="true">
      <span class="orbit-cloud orbit-cloud-a"></span>
      <span class="orbit-cloud orbit-cloud-b"></span>
      <span class="orbit-star orbit-star-a"></span>
      <span class="orbit-star orbit-star-b"></span>
      <span class="orbit-star orbit-star-c"></span>
      <span class="orbit-star orbit-star-d"></span>
      <svg class="orbit-galaxy" viewBox="0 0 92 42" aria-hidden="true" focusable="false">
        <path d="M20 28c14-14 38-16 54-4" />
        <path d="M30 31c10-8 24-9 34-3" />
      </svg>
    </span>
    <svg class="orbit-path" viewBox="0 0 92 42" aria-hidden="true" focusable="false">
      <path d="M21 21C32 8 58 8 71 21" />
    </svg>
    <span class="orbit-orb" aria-hidden="true">
      <span class="orbit-orb-core">
        <svg class="orbit-orb-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="4.2"></circle>
          <path d="M12 2.8v2.5M12 18.7v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.8 12h2.5M18.7 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8"></path>
        </svg>
        <svg class="orbit-orb-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M16.8 15.9A7.4 7.4 0 0 1 8.1 7.2 7.6 7.6 0 1 0 16.8 15.9Z"></path>
        </svg>
      </span>
    </span>`;
}

function svgIcon(inner, width = 16, height = 16) {
  return `<svg viewBox="0 0 24 24" width="${width}" height="${height}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
}

const ICON_SVG = {
  chartColumn: svgIcon('<path d="M4 20V10"/><path d="M4 20H20"/><path d="M8 20V7"/><path d="M12 20V4"/><path d="M16 20v-9"/>'),
  users: svgIcon('<path d="M17 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-1A4.5 4.5 0 0 0 7 19.5V21"/><circle cx="11.5" cy="8" r="3.5"/><path d="M19 21v-1a3.5 3.5 0 0 0-2.5-3.35"/><path d="M16.5 4.75a3 3 0 0 1 0 5.9"/>'),
  clipboardList: svgIcon('<rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5h6v3H9z"/><path d="M8 11h8"/><path d="M8 15h8"/>'),
  briefcase: svgIcon('<path d="M10 7V6a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 12h18"/><path d="M9 12v2h6v-2"/>'),
  fileLines: svgIcon('<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M9 12h6"/><path d="M9 16h6"/>'),
  chartLine: svgIcon('<path d="M4 19h16"/><path d="M6 16l4-4 3 3 5-7"/><path d="M18 8h-3"/><path d="M18 8v3"/>'),
  search: svgIcon('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/>'),
  clock: svgIcon('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
  user: svgIcon('<circle cx="12" cy="8" r="3.5"/><path d="M5 20v-1a7 7 0 0 1 14 0v1"/>'),
  info: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 16v-5"/><path d="M12 8h.01"/>'),
  envelope: svgIcon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>'),
  lock: svgIcon('<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
  arrowLeft: svgIcon('<path d="M10 6 4 12l6 6"/><path d="M4 12h16"/>'),
  plus: svgIcon('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  checkCircle: svgIcon('<circle cx="12" cy="12" r="9"/><path d="m8 12 2.8 2.8L16 9.5"/>'),
  xCircle: svgIcon('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/>'),
  download: svgIcon('<path d="M12 3v10"/><path d="m8 10 4 4 4-4"/><path d="M5 20h14"/>'),
  rotateLeft: svgIcon('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
  logout: svgIcon('<path d="M10 17l5-5-5-5"/><path d="M15 12H4"/><path d="M20 4v16"/>'),
  bars: svgIcon('<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>'),
  hourglass: svgIcon('<path d="M6 4h12"/><path d="M6 20h12"/><path d="M8 4c0 3 4 4 4 8s-4 5-4 8"/><path d="M16 4c0 3-4 4-4 8s4 5 4 8"/>'),
  eye: svgIcon('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>'),
  eyeOff: svgIcon('<path d="M3 3l18 18"/><path d="M10.5 10.5a2.5 2.5 0 1 0 3 3"/><path d="M6.2 6.2C3.9 7.9 2 12 2 12s3.5 6 10 6c1.3 0 2.5-.2 3.6-.6"/><path d="M14.6 4.6C13.8 4.2 12.9 4 12 4c-6.5 0-10 8-10 8a20.1 20.1 0 0 0 4.8 5.7"/>'),
  upload: svgIcon('<path d="M12 16V4"/><path d="m8 8 4-4 4 4"/><path d="M4 20h16"/>'),
  folder: svgIcon('<path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  bank: svgIcon('<path d="M4 10h16"/><path d="M6 10V7l6-3 6 3v3"/><path d="M5 20h14"/><path d="M7 20v-7"/><path d="M12 20v-7"/><path d="M17 20v-7"/>'),
  cube: svgIcon('<path d="M12 2 4 6v12l8 4 8-4V6z"/><path d="M12 2v8l8-4"/><path d="M4 6l8 4 8-4"/>'),
  calculator: svgIcon('<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>'),
  chartPie: svgIcon('<path d="M11 3a9 9 0 1 0 9 9h-9z"/><path d="M14 3.5V10h6.5A7 7 0 0 0 14 3.5z"/>'),
  addressBook: svgIcon('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h.01"/><circle cx="12" cy="10" r="2.5"/><path d="M8.5 17a3.8 3.8 0 0 1 7 0"/>'),
  camera: svgIcon('<path d="M7 7h1.5L10 5h4l1.5 2H17a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3z"/><circle cx="12" cy="13" r="3"/>'),
  phone: svgIcon('<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L9.1 10.6a16 16 0 0 0 4.3 4.3l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z"/>'),
  at: svgIcon('<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>'),
  calendarDays: svgIcon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/>'),
  trash: svgIcon('<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/>'),
  sliders: svgIcon('<path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h2"/><path d="M10 12h10"/><circle cx="8" cy="12" r="2"/><path d="M4 18h12"/><path d="M20 18h0"/><circle cx="18" cy="18" r="2"/>'),
  shield: svgIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  bell: svgIcon('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>'),
  listCheck: svgIcon('<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="m3 6 1 1 2-2"/><path d="m3 12 1 1 2-2"/><path d="m3 18 1 1 2-2"/>'),
  key: svgIcon('<circle cx="7.5" cy="14.5" r="3.5"/><path d="M10 12l8-8"/><path d="M15 7l2 2"/><path d="M13 9l2 2"/>'),
  userShield: svgIcon('<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 10.5-4"/><path d="M17 22s4-2 4-5v-3l-4-1.5-4 1.5v3c0 3 4 5 4 5z"/>'),
  x: svgIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  check: svgIcon('<path d="m5 12 4 4L19 6"/>'),
  desktop: svgIcon('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>'),
  userPlus: svgIcon('<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M18 8v6"/><path d="M15 11h6"/>'),
  idCard: svgIcon('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M13 10h5"/><path d="M13 14h4"/><path d="M6 16c.6-1.2 1.6-2 3-2s2.4.8 3 2"/>'),
  alertTriangle: svgIcon('<path d="M12 3 22 20H2z"/><path d="M12 9v5"/><path d="M12 17h.01"/>'),
  circle: svgIcon('<circle cx="12" cy="12" r="9"/>'),
  coffee: svgIcon('<path d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/><path d="M6 2v2"/><path d="M10 2v2"/><path d="M14 2v2"/>'),
  utensils: svgIcon('<path d="M4 3v8"/><path d="M7 3v8"/><path d="M4 7h3"/><path d="M6 11v10"/><path d="M17 3v18"/><path d="M14 3h3a3 3 0 0 1 0 6h-3"/>'),
  play: svgIcon('<path d="M8 5v14l11-7z"/>'),
  stop: svgIcon('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  files: svgIcon('<path d="M8 7V5a2 2 0 0 1 2-2h6l4 4v9a2 2 0 0 1-2 2h-2"/><path d="M16 3v5h5"/><path d="M4 9h8l4 4v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"/><path d="M12 9v5h5"/>'),
  pauseCircle: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M10 8v8"/><path d="M14 8v8"/>'),
  archiveX: svgIcon('<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 12l4 4"/><path d="M14 12l-4 4"/>'),
  mapPin: svgIcon('<path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  badgeCheck: svgIcon('<path d="M8.5 3.5 12 2l3.5 1.5L19 3l2 3-1 3.5 1 3.5-2 3-3.5-.5L12 22l-3.5-6.5L5 16l-2-3 1-3.5L3 6l2-3z"/><path d="m8.5 11.5 2.2 2.2 4.8-5"/>'),
  calendarCheck: svgIcon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 10h18"/><path d="m8 16 2.5 2.5L16 13"/>'),
  uploadCloud: svgIcon('<path d="M16 16l-4-4-4 4"/><path d="M12 12v9"/><path d="M20 16.6A5 5 0 0 0 18 7h-1.3A7 7 0 0 0 3.8 10.1A4.5 4.5 0 0 0 5 19h2"/><path d="M16 19h3"/>'),
  indianRupee: svgIcon('<path d="M6 4h12"/><path d="M6 8h12"/><path d="M7 4h4a4 4 0 0 1 0 8H7l6 8"/>'),
  message: svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  ellipsisVertical: svgIcon('<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>'),
  bolt: svgIcon('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  userSlash: svgIcon('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/>'),
  award: svgIcon('<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>'),
  trophy: svgIcon('<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>'),
  fileCsv: svgIcon('<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M8 15h.01"/><path d="M12 15h.01"/><path d="M16 15h.01"/>'),
  filePdf: svgIcon('<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M9 12h2a1 1 0 0 1 0 2H9v3"/><path d="M9 14h2"/>'),
  fileExcel: svgIcon('<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="m9 12 6 6"/><path d="m15 12-6 6"/>'),
  print: svgIcon('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
  calendarAlt: svgIcon('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
  circleDot: svgIcon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>'),
  powerOff: svgIcon('<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>'),
  businessTime: svgIcon('<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect x="2" y="6" width="20" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><polyline points="12 11.5 12 13 13 13"/>'),
  stopwatch: svgIcon('<circle cx="12" cy="14" r="8"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="14" x2="15" y2="17"/>'),
  bullseye: svgIcon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  fire: svgIcon('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
  towerBroadcast: svgIcon('<path d="M4.9 19.1A10 10 0 0 1 4.9 4.9"/><path d="M7.8 16.2A6 6 0 0 1 7.8 7.8"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M19.1 4.9a10 10 0 0 1 0 14.2"/>'),
  medal: svgIcon('<circle cx="12" cy="15" r="5"/><path d="m8.5 8.5 3.5-6 3.5 6"/><path d="M12 2.5V8"/><path d="m14 10 3-7"/><path d="m10 10-3-7"/>'),
  sort: svgIcon('<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>'),
  sortUp: svgIcon('<path d="m7 14 5-5 5 5"/>'),
  sortDown: svgIcon('<path d="m7 10 5 5 5-5"/>'),
  rotateRight: svgIcon('<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>'),
  spinner: svgIcon('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>'),
  database: svgIcon('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>'),
  tableList: svgIcon('<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9"/><path d="M3 9h18"/><path d="M9 21V9"/>'),
  arrowsUpDown: svgIcon('<polyline points="7 15 12 20 17 15"/><line x1="12" y1="4" x2="12" y2="20"/><polyline points="7 9 12 4 17 9"/>'),
  chevronLeft: svgIcon('<path d="m15 18-6-6 6-6"/>'),
  chevronRight: svgIcon('<path d="m9 18 6-6-6-6"/>'),
  chevronDown: svgIcon('<path d="m6 9 6 6 6-6"/>'),
  chevronUp: svgIcon('<path d="m18 15-6-6-6 6"/>'),
  userCircle: svgIcon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>'),
  infinity: svgIcon('<path d="M18.178 8c5.096 0 5.096 8 0 8-2.612 0-3.52-1.996-5.178-4-1.658 2.004-2.566 4-5.178 4-5.096 0-5.096-8 0-8 2.612 0 3.52 1.996 5.178 4 1.658-2.004 2.566-4 5.178-4z"/>'),
  inbox: svgIcon('<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>')
};

if (typeof window !== 'undefined') {
  window.ICON_SVG = ICON_SVG;
}

const LUCIDE_MAP = {
  chartColumn: 'layout-dashboard',
  users: 'users',
  clipboardList: 'clipboard-list',
  briefcase: 'briefcase',
  fileLines: 'file-text',
  chartLine: 'line-chart',
  search: 'search',
  clock: 'clock',
  user: 'user',
  info: 'info',
  envelope: 'mail',
  lock: 'lock',
  arrowLeft: 'arrow-left',
  plus: 'plus',
  checkCircle: 'check-circle',
  xCircle: 'x-circle',
  download: 'download',
  rotateLeft: 'rotate-ccw',
  logout: 'log-out',
  bars: 'menu',
  hourglass: 'hourglass',
  eye: 'eye',
  eyeOff: 'eye-off',
  upload: 'upload',
  folder: 'folder',
  bank: 'landmark',
  cube: 'box',
  calculator: 'calculator',
  message: 'message-square'
};

function iconMarkup(name) {
  if (window.lucide) {
    const lucideName = LUCIDE_MAP[name] || name;
    return `<i data-lucide="${lucideName}"></i>`;
  }
  return ICON_SVG[name] || ICON_SVG.chartColumn;
}

window.clnIcon = iconMarkup;

const FONT_AWESOME_ICON_MAP = new Map([
  ['fa-chart-pie', 'chartPie'],
  ['fa-users', 'users'],
  ['fa-address-book', 'addressBook'],
  ['fa-briefcase', 'briefcase'],
  ['fa-calculator', 'calculator'],
  ['fa-file-excel', 'fileExcel'],
  ['fa-chart-line', 'chartLine'],
  ['fa-right-from-bracket', 'logout'],
  ['fa-arrow-right-from-bracket', 'logout'],
  ['fa-arrow-right-to-bracket', 'logout'],
  ['fa-right-to-bracket', 'logout'],
  ['fa-bars', 'bars'],
  ['fa-user-gear', 'userShield'],
  ['fa-camera', 'camera'],
  ['fa-envelope', 'envelope'],
  ['fa-phone', 'phone'],
  ['fa-at', 'at'],
  ['fa-calendar-days', 'calendarDays'],
  ['fa-calendar-check', 'calendarCheck'],
  ['fa-calendar-alt', 'calendarAlt'],
  ['fa-calendar', 'calendarDays'],
  ['fa-clock', 'clock'],
  ['fa-trash-can', 'trash'],
  ['fa-trash', 'trash'],
  ['fa-trash-alt', 'trash'],
  ['fa-user', 'user'],
  ['fa-user-plus', 'userPlus'],
  ['fa-id-card', 'idCard'],
  ['fa-id-card-clip', 'idCard'],
  ['fa-building', 'bank'],
  ['fa-building-columns', 'bank'],
  ['fa-triangle-exclamation', 'alertTriangle'],
  ['fa-clipboard-check', 'checkCircle'],
  ['fa-cloud-arrow-up', 'uploadCloud'],
  ['fa-file-invoice', 'fileLines'],
  ['fa-clock-rotate-left', 'rotateLeft'],
  ['fa-circle-xmark', 'xCircle'],
  ['fa-file-pdf', 'filePdf'],
  ['fa-file-csv', 'fileCsv'],
  ['fa-print', 'print'],
  ['fa-phone-volume', 'phone'],
  ['fa-circle', 'circle'],
  ['fa-spinner', 'spinner'],
  ['fa-mug-hot', 'coffee'],
  ['fa-coffee', 'coffee'],
  ['fa-utensils', 'utensils'],
  ['fa-user-clock', 'clock'],
  ['fa-ellipsis-h', 'info'],
  ['fa-play', 'play'],
  ['fa-stop', 'stop'],
  ['fa-history', 'rotateLeft'],
  ['fa-sliders', 'sliders'],
  ['fa-shield-halved', 'shield'],
  ['fa-bell', 'bell'],
  ['fa-list-check', 'listCheck'],
  ['fa-circle-info', 'info'],
  ['fa-xmark', 'x'],
  ['fa-check', 'check'],
  ['fa-key', 'key'],
  ['fa-eye', 'eye'],
  ['fa-eye-slash', 'eyeOff'],
  ['fa-lock', 'lock'],
  ['fa-user-shield', 'userShield'],
  ['fa-circle-check', 'checkCircle'],
  ['fa-desktop', 'desktop'],
  ['fa-chrome', 'desktop'],
  ['fa-firefox-browser', 'desktop'],
  ['fa-safari', 'desktop'],
  ['fa-edge', 'desktop'],
  ['fa-ellipsis-vertical', 'ellipsisVertical'],
  ['fa-ellipsis-v', 'ellipsisVertical'],
  ['fa-bolt', 'bolt'],
  ['fa-user-slash', 'userSlash'],
  ['fa-user-check', 'checkCircle'],
  ['fa-user-xmark', 'xCircle'],
  ['fa-search', 'search'],
  ['fa-magnifying-glass', 'search'],
  ['fa-undo', 'rotateLeft'],
  ['fa-rotate', 'rotateRight'],
  ['fa-rotate-right', 'rotateRight'],
  ['fa-award', 'award'],
  ['fa-trophy', 'trophy'],
  ['fa-chart-column', 'chartColumn'],
  ['fa-circle-dot', 'circleDot'],
  ['fa-power-off', 'powerOff'],
  ['fa-business-time', 'businessTime'],
  ['fa-hourglass-half', 'hourglass'],
  ['fa-stopwatch', 'stopwatch'],
  ['fa-bullseye', 'bullseye'],
  ['fa-fire', 'fire'],
  ['fa-check-circle', 'checkCircle'],
  ['fa-pause-circle', 'pauseCircle'],
  ['fa-tower-broadcast', 'towerBroadcast'],
  ['fa-medal', 'medal'],
  ['fa-sort', 'sort'],
  ['fa-sort-up', 'sortUp'],
  ['fa-sort-down', 'sortDown'],
  ['fa-arrows-up-down', 'arrowsUpDown'],
  ['fa-sign-out-alt', 'logout'],
  ['fa-sync-alt', 'rotateRight'],
  ['fa-sync', 'rotateRight'],
  ['fa-chevron-left', 'chevronLeft'],
  ['fa-chevron-right', 'chevronRight'],
  ['fa-chevron-down', 'chevronDown'],
  ['fa-chevron-up', 'chevronUp'],
  ['fa-location-dot', 'mapPin'],
  ['fa-map-marker-alt', 'mapPin'],
  ['fa-user-circle', 'userCircle'],
  ['fa-phone-alt', 'phone'],
  ['fa-infinity', 'infinity'],
  ['fa-calendar-day', 'calendarDays'],
  ['fa-calendar-minus', 'calendarDays'],
  ['fa-calendar-week', 'calendarDays'],
  ['fa-calendar-range', 'calendarDays'],
  ['fa-rotate-left', 'rotateLeft'],
  ['fa-inbox', 'inbox'],
  ['fa-folder-open', 'folder'],
  ['fa-folder-closed', 'folder'],
  ['fa-filter', 'sliders'],
  ['fa-user-tie', 'user'],
  ['fa-pen-to-square', 'fileLines'],
  ['fa-download', 'download'],
  ['fa-upload', 'upload'],
  ['fa-database', 'database'],
  ['fa-table-list', 'tableList'],
  ['fa-satellite-dish', 'towerBroadcast'],
  ['fa-pause', 'pauseCircle']
]);

function resolveFontAwesomeIconName(el) {
  if (!el || !el.classList) return null;
  for (const className of el.classList) {
    if (FONT_AWESOME_ICON_MAP.has(className)) return FONT_AWESOME_ICON_MAP.get(className);
  }
  return null;
}

function collectFontAwesomeIconElements(root) {
  const selector = "i[class*='fa-'], .local-fa-icon[class*='fa-']";
  const elements = [];
  if (typeof Element !== 'undefined' && root instanceof Element && root.matches(selector)) {
    elements.push(root);
  }
  if (root.querySelectorAll) {
    elements.push(...root.querySelectorAll(selector));
  }
  return elements;
}

function isFontAwesomeAvailable() {
  if (typeof window !== 'undefined' && window.__clnFontAwesomeAvailable !== undefined) {
    return window.__clnFontAwesomeAvailable;
  }
  try {
    if (document.fonts && document.fonts.check && (document.fonts.check('16px "Font Awesome 6 Free"') || document.fonts.check('900 16px "Font Awesome 6 Free"'))) {
      if (typeof window !== 'undefined') window.__clnFontAwesomeAvailable = true;
      return true;
    }
  } catch (e) {}

  try {
    for (let i = 0; i < document.styleSheets.length; i++) {
      const href = document.styleSheets[i].href || '';
      if (href.includes('font-awesome') || href.includes('fontawesome')) {
        if (typeof window !== 'undefined') window.__clnFontAwesomeAvailable = true;
        return true;
      }
    }
  } catch (e) {}

  const link = document.querySelector('link[href*="font-awesome"], link[href*="fontawesome"]');
  if (link) {
    if (typeof window !== 'undefined') window.__clnFontAwesomeAvailable = true;
    return true;
  }

  if (typeof window !== 'undefined') window.__clnFontAwesomeAvailable = false;
  return false;
}
if (typeof window !== 'undefined') {
  window.isFontAwesomeAvailable = isFontAwesomeAvailable;
}

function applyFontAwesomeFallbackIcons(root = document) {
  // If Font Awesome is loaded and available, let native Font Awesome vector font glyphs render.
  // Do NOT overwrite with SVG fallbacks when Font Awesome is present.
  if (isFontAwesomeAvailable()) return;

  collectFontAwesomeIconElements(root).forEach((el) => {
    if (el.matches('[data-lucide]')) return;
    const iconName = resolveFontAwesomeIconName(el);
    if (!iconName) return;
    if (el.dataset.faIconized === iconName && el.querySelector('svg')) return;
    el.innerHTML = ICON_SVG[iconName] || ICON_SVG.info;
    el.dataset.faIconized = iconName;
    el.classList.add('local-fa-icon');
    el.setAttribute('aria-hidden', 'true');
  });
}

const LUCIDE_FALLBACK_ICON_MAP = new Map([
  ['archive-x', 'archiveX'],
  ['badge-check', 'badgeCheck'],
  ['calendar', 'calendarDays'],
  ['calendar-check', 'calendarCheck'],
  ['calendar-days', 'calendarDays'],
  ['check-circle', 'checkCircle'],
  ['check-circle-2', 'checkCircle'],
  ['circle-help', 'info'],
  ['files', 'files'],
  ['hourglass', 'hourglass'],
  ['indian-rupee', 'indianRupee'],
  ['landmark', 'bank'],
  ['map-pin', 'mapPin'],
  ['message-square', 'message'],
  ['message-square-text', 'message'],
  ['pause-circle', 'pauseCircle'],
  ['rotate-ccw', 'rotateLeft'],
  ['search', 'search'],
  ['sliders-horizontal', 'sliders'],
  ['upload-cloud', 'uploadCloud'],
  ['user-round', 'user'],
  ['x-circle', 'xCircle']
]);

function resolveLucideFallbackIconName(el) {
  const lucideName = el?.getAttribute?.('data-lucide');
  if (!lucideName) return null;
  return LUCIDE_FALLBACK_ICON_MAP.get(lucideName) || LUCIDE_MAP[lucideName] || null;
}

function collectLucideIconElements(root) {
  const selector = 'i[data-lucide], .local-lucide-icon[data-lucide]';
  const elements = [];
  if (typeof Element !== 'undefined' && root instanceof Element && root.matches(selector)) {
    elements.push(root);
  }
  if (root.querySelectorAll) {
    elements.push(...root.querySelectorAll(selector));
  }
  return elements;
}

function applyLucideFallbackIcons(root = document) {
  collectLucideIconElements(root).forEach((el) => {
    const iconName = resolveLucideFallbackIconName(el);
    if (!iconName) return;
    if (el.dataset.lucideIconized === iconName && el.querySelector('svg')) return;
    el.innerHTML = ICON_SVG[iconName] || ICON_SVG.info;
    el.dataset.lucideIconized = iconName;
    el.classList.add('local-lucide-icon');
    el.setAttribute('aria-hidden', 'true');
  });
}

const ICON_TEXT_MAP = new Map([
  ['📊', 'chartColumn'],
  ['👥', 'users'],
  ['📋', 'clipboardList'],
  ['💼', 'briefcase'],
  ['📄', 'fileLines'],
  ['📈', 'chartLine'],
  ['🔎', 'search'],
  ['🕒', 'clock'],
  ['👤', 'user'],
  ['ℹ️', 'info'],
  ['📧', 'envelope'],
  ['🔐', 'lock'],
  ['🔙', 'arrowLeft'],
  ['➕', 'plus'],
  ['✅', 'checkCircle'],
  ['❌', 'xCircle'],
  ['📥', 'download'],
  ['↺', 'rotateLeft'],
  ['🚪', 'logout'],
  ['☰', 'bars'],
  ['⏳', 'hourglass'],
  ['🏦', 'bank'],
  ['📁', 'folder'],
  ['📤', 'upload'],
  ['show', 'eye'],
  ['hide', 'eyeOff'],
  ['l', 'briefcase'],
  ['a', 'checkCircle'],
  ['c', 'users'],
  ['search', 'search'],
  ['cln', 'bank'],
  ['🧮', 'calculator'],
  ['💬', 'message']
]);

function resolveIconName(el) {
  const rawText = (el.textContent || '').trim();
  const normalized = rawText.toLowerCase();

  if (el.classList.contains('logo-icon')) return 'bank';
  if (el.classList.contains('search-icon')) return 'search';
  // Check if the element itself or its parent is the toggle-password button
  const toggleBtn = el.classList.contains('toggle-password') ? el : el.closest('.toggle-password');
  if (toggleBtn) return toggleBtn.classList.contains('visible') ? 'eyeOff' : 'eye';

  if (ICON_TEXT_MAP.has(rawText)) return ICON_TEXT_MAP.get(rawText);
  if (ICON_TEXT_MAP.has(normalized)) return ICON_TEXT_MAP.get(normalized);

  if (el.classList.contains('stat-icon')) {
    if (rawText === 'L') return 'briefcase';
    if (rawText === 'A') return 'checkCircle';
    if (rawText === 'C') return 'users';
  }

  return null;
}

function applyIconography(root = document) {
  if (window.lucide) {
    try {
      window.lucide.createIcons();
    } catch (err) {
      console.error('Lucide error:', err);
    }
  }

  const selector = '.emoji, .emoji-sm, .nav-icon, .stat-icon, .search-icon, .upload-icon, .empty-icon, .logo-icon, .toggle-password .eye-icon';
  const elements = root.querySelectorAll ? root.querySelectorAll(selector) : [];

  elements.forEach((el) => {
    if (el.querySelector('svg') || el.querySelector('i[data-lucide]')) return;
    // Skip .toggle-password buttons that already have SVG rendered directly inside them
    const parentToggle = el.closest ? el.closest('.toggle-password') : null;
    if (parentToggle && parentToggle.querySelector('svg')) return;
    const iconName = resolveIconName(el);
    if (!iconName) return;
    el.innerHTML = iconMarkup(iconName);
    el.dataset.iconized = iconName;
  });

  if (window.lucide) {
    try {
      window.lucide.createIcons();
    } catch (err) {}
  }
}

function applyActionButtonIcons(root = document) {
  const buttons = root.querySelectorAll ? root.querySelectorAll('.logout-btn, .mobile-menu-btn') : [];

  buttons.forEach((button) => {
    if (button.dataset.iconized === 'true') return;
    if (button.classList.contains('logout-btn')) {
      button.innerHTML = `${iconMarkup('logout')}<span>Logout</span>`;
      button.setAttribute('aria-label', 'Logout');
    } else if (button.classList.contains('mobile-menu-btn')) {
      button.innerHTML = `${iconMarkup('bars')}<span>Menu</span>`;
      button.setAttribute('aria-label', 'Open menu');
    }
    button.dataset.iconized = 'true';
  });

  if (window.lucide && buttons.length > 0) {
    try {
      window.lucide.createIcons();
    } catch (err) {}
  }
}

const THREE_CDN_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
let threeLibraryPromise = null;
let modelViewerState = null;

function isAdminPage() {
  return window.location.pathname.startsWith('/admin/');
}

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing && existing.dataset.loaded === 'true') {
      resolve();
      return;
    }

    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function ensureThreeLibrary() {
  if (window.THREE) return window.THREE;
  if (!threeLibraryPromise) {
    threeLibraryPromise = loadExternalScript(THREE_CDN_URL);
  }
  await threeLibraryPromise;
  return window.THREE;
}

function createModelViewerButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary btn-sm model-viewer-btn';
  btn.innerHTML = `${iconMarkup('cube')}<span>3D Model</span>`;
  btn.setAttribute('aria-label', 'Open 3D model viewer');
  btn.addEventListener('click', openModelViewer);
  return btn;
}

function ensureModelViewerModal() {
  let overlay = document.getElementById('model-viewer-overlay');
  if (overlay) return overlay;
  if (!isAdminPage()) return null;

  overlay = document.createElement('div');
  overlay.className = 'modal-overlay model-viewer-overlay';
  overlay.id = 'model-viewer-overlay';
  overlay.innerHTML = `
    <div class="model-viewer-dock" role="dialog" aria-modal="true" aria-labelledby="model-viewer-title">
      <div class="model-viewer-dock-header">
        <div>
          <p class="model-viewer-kicker">Admin-only scene</p>
          <h3 id="model-viewer-title">3D Model</h3>
        </div>
        <button class="modal-close" type="button" data-close-model-viewer aria-label="Close 3D viewer">Close</button>
      </div>
      <div class="model-viewer-stage">
        <div class="model-viewer-canvas" id="model-viewer-canvas"></div>
        <div class="model-viewer-hud">
          <span>Drag</span>
          <span>Zoom</span>
          <span>Reset</span>
        </div>
      </div>
      <div class="model-viewer-dock-footer">
        <button class="btn btn-secondary btn-sm" type="button" data-reset-model-viewer>Reset view</button>
        <button class="btn btn-secondary btn-sm" type="button" data-close-model-viewer>Close</button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModelViewer();
  });
  overlay.querySelectorAll('[data-close-model-viewer]').forEach((button) => {
    button.addEventListener('click', closeModelViewer);
  });
  overlay.querySelector('[data-reset-model-viewer]')?.addEventListener('click', resetModelViewer);
  document.body.appendChild(overlay);
  return overlay;
}

function buildAvatarModel(THREE) {
  const group = new THREE.Group();

  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xf7cdbd, roughness: 0.42, metalness: 0.015 });
  const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x5a345d, roughness: 0.66, metalness: 0.04 });
  const clothingMaterial = new THREE.MeshStandardMaterial({ color: 0x6b89d6, roughness: 0.7, metalness: 0.04 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xffb6d0, roughness: 0.28, metalness: 0.08, emissive: 0x361323, emissiveIntensity: 0.08 });
  const blushMaterial = new THREE.MeshStandardMaterial({ color: 0xff9dbf, roughness: 0.55, metalness: 0.02, transparent: true, opacity: 0.7 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x2a1a2f, roughness: 0.3, metalness: 0.06 });
  const eyeWhiteMaterial = new THREE.MeshStandardMaterial({ color: 0xfdf9f7, roughness: 0.45, metalness: 0.01 });
  const lipMaterial = new THREE.MeshStandardMaterial({ color: 0xde6b8a, roughness: 0.44, metalness: 0.01 });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.12, 1.9, 32, 1, true), clothingMaterial);
  torso.position.y = -1.52;
  group.add(torso);

  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(1.26, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2.2), clothingMaterial);
  shoulders.scale.set(1.0, 0.6, 0.84);
  shoulders.position.y = -0.65;
  group.add(shoulders);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 18), skinMaterial);
  neck.position.y = 0.15;
  group.add(neck);

  const face = new THREE.Mesh(new THREE.SphereGeometry(0.88, 40, 32), skinMaterial);
  face.position.y = 1.02;
  face.scale.set(1.03, 1.12, 0.92);
  group.add(face);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.96, 40, 32), hairMaterial);
  hairCap.position.set(0, 1.16, -0.05);
  hairCap.scale.set(1.0, 0.98, 0.95);
  group.add(hairCap);

  const sideHairLeft = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 8, 16), hairMaterial);
  sideHairLeft.position.set(-0.72, 0.9, -0.02);
  sideHairLeft.rotation.z = 0.15;
  group.add(sideHairLeft);

  const sideHairRight = sideHairLeft.clone();
  sideHairRight.position.x = 0.72;
  sideHairRight.rotation.z = -0.15;
  group.add(sideHairRight);

  const backHair = new THREE.Mesh(new THREE.SphereGeometry(0.94, 32, 24), hairMaterial);
  backHair.position.set(0, 0.92, -0.22);
  backHair.scale.set(1.05, 1.12, 0.95);
  group.add(backHair);

  const topBunLeft = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 16), hairMaterial);
  topBunLeft.position.set(-0.34, 1.62, -0.02);
  group.add(topBunLeft);

  const topBunRight = topBunLeft.clone();
  topBunRight.position.x = 0.34;
  group.add(topBunRight);

  const bowLeft = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), accentMaterial);
  bowLeft.position.set(-0.12, 1.64, 0.54);
  bowLeft.scale.set(1.2, 0.8, 0.45);
  group.add(bowLeft);

  const bowRight = bowLeft.clone();
  bowRight.position.x = 0.12;
  group.add(bowRight);

  const bowCenter = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 12), accentMaterial);
  bowCenter.position.set(0, 1.64, 0.56);
  bowCenter.scale.set(0.65, 0.65, 0.5);
  group.add(bowCenter);

  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), eyeMaterial);
  leftEye.position.set(-0.25, 1.0, 0.75);
  group.add(leftEye);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.23;
  group.add(rightEye);
  const leftHighlight = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), eyeWhiteMaterial);
  leftHighlight.position.set(-0.21, 1.03, 0.83);
  group.add(leftHighlight);
  const rightHighlight = leftHighlight.clone();
  rightHighlight.position.x = 0.26;
  group.add(rightHighlight);

  const leftLash = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.02), eyeMaterial);
  leftLash.position.set(-0.25, 1.12, 0.72);
  leftLash.rotation.z = -0.12;
  group.add(leftLash);
  const rightLash = leftLash.clone();
  rightLash.position.x = 0.25;
  rightLash.rotation.z = 0.12;
  group.add(rightLash);

  const blushLeft = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), blushMaterial);
  blushLeft.position.set(-0.42, 0.82, 0.68);
  blushLeft.scale.set(1.2, 0.8, 0.6);
  group.add(blushLeft);
  const blushRight = blushLeft.clone();
  blushRight.position.x = 0.42;
  group.add(blushRight);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), skinMaterial);
  nose.position.set(0, 0.88, 0.82);
  nose.scale.set(1.0, 0.8, 0.7);
  group.add(nose);

  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 10, 20, Math.PI), lipMaterial);
  smile.position.set(0, 0.72, 0.82);
  smile.rotation.z = Math.PI;
  group.add(smile);

  const necklaceChain = new THREE.Group();
  [0.02, -0.03, 0.05].forEach((yOffset, index) => {
    const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(index === 2 ? 0.1 : 0.08, 0), accentMaterial);
    gem.position.set(0, 0.0 - index * 0.2, 0.74 - index * 0.06);
    gem.rotation.set(index * 0.3, index * 0.5, index * 0.2);
    necklaceChain.add(gem);
  });
  necklaceChain.position.set(0, 0.06, 0);
  group.add(necklaceChain);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.07, 16, 36), clothingMaterial);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.34, 0.1);
  group.add(collar);

  const glow = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.02, 12, 64), new THREE.MeshStandardMaterial({ color: 0xffc5dd, roughness: 0.34, metalness: 0.08, emissive: 0x6f2c58, emissiveIntensity: 0.15 }));
  glow.rotation.x = Math.PI / 2;
  glow.position.set(0, 0.12, -0.92);
  group.add(glow);

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return group;
}

function initializeModelViewer() {
  const overlay = ensureModelViewerModal();
  if (!overlay) return null;

  const canvasHost = overlay.querySelector('#model-viewer-canvas');
  if (!canvasHost) return null;

  if (modelViewerState) {
    modelViewerState.canvasHost = canvasHost;
    if (modelViewerState.renderer && modelViewerState.renderer.domElement.parentElement !== canvasHost) {
      canvasHost.innerHTML = '';
      canvasHost.appendChild(modelViewerState.renderer.domElement);
    }
    modelViewerState.resize?.();
    return modelViewerState;
  }

  modelViewerState = {
    canvasHost,
    renderer: null,
    scene: null,
    camera: null,
    frameId: null,
    avatar: null,
    floatingRing: null,
    sparkleGroup: null,
    rotation: { x: -0.04, y: 0.3 },
    drag: { active: false, startX: 0, startY: 0, rotationX: 0, rotationY: 0 },
    zoom: 4.1,
    resize: null,
    reset: null,
    destroy: null
  };

  ensureThreeLibrary().then((THREE) => {
    if (!modelViewerState || modelViewerState.scene) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1220);
    scene.fog = new THREE.Fog(0x0a1220, 6, 12);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0.55, 4.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(1, 1, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvasHost.innerHTML = '';
    canvasHost.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0x9ec1ff, 2.5);
    keyLight.position.set(4, 5, 6);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffd4ad, 1.5);
    fillLight.position.set(-4, 1.5, 4);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0x5dd4c7, 1.6);
    rimLight.position.set(0, 3, -5);
    scene.add(rimLight);

    const avatar = buildAvatarModel(THREE);
    avatar.position.y = -0.22;
    scene.add(avatar);

    const floatingRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.15, 0.04, 16, 96),
      new THREE.MeshStandardMaterial({ color: 0x213a61, roughness: 0.3, metalness: 0.18, emissive: 0x0d1c31, emissiveIntensity: 0.25 })
    );
    floatingRing.rotation.x = Math.PI / 2;
    floatingRing.position.y = -0.18;
    scene.add(floatingRing);

    const sparkleGroup = new THREE.Group();
    for (let i = 0; i < 10; i += 1) {
      const sparkle = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.04 + (i % 3) * 0.01, 0),
        new THREE.MeshStandardMaterial({ color: 0xa5d6ff, roughness: 0.25, metalness: 0.35, emissive: 0x14304f, emissiveIntensity: 0.45 })
      );
      const angle = (Math.PI * 2 * i) / 10;
      sparkle.position.set(Math.cos(angle) * 2.7, 1.6 + Math.sin(i) * 0.25, Math.sin(angle) * 0.65);
      sparkle.rotation.set(i * 0.2, i * 0.3, i * 0.4);
      sparkleGroup.add(sparkle);
    }
    scene.add(sparkleGroup);

    const state = modelViewerState;
    state.scene = scene;
    state.camera = camera;
    state.renderer = renderer;
    state.avatar = avatar;
    state.floatingRing = floatingRing;
    state.sparkleGroup = sparkleGroup;

    state.reset = () => {
      state.rotation.x = 0;
      state.rotation.y = 0;
      state.zoom = 4.4;
      camera.position.set(0, 0.74, state.zoom);
      avatar.rotation.set(0, 0, 0);
      if (renderer) renderer.render(scene, camera);
    };

    state.resize = () => {
      const rect = canvasHost.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
      renderer.render(scene, camera);
    };

    state.destroy = () => {
      if (state.frameId) cancelAnimationFrame(state.frameId);
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
    };

    const onPointerDown = (event) => {
      state.drag.active = true;
      state.drag.startX = event.clientX;
      state.drag.startY = event.clientY;
      state.drag.rotationX = state.rotation.x;
      state.drag.rotationY = state.rotation.y;
      canvasHost.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event) => {
      if (!state.drag.active) return;
      const deltaX = (event.clientX - state.drag.startX) * 0.006;
      const deltaY = (event.clientY - state.drag.startY) * 0.005;
      state.rotation.y = state.drag.rotationY + deltaX;
      state.rotation.x = Math.max(-0.35, Math.min(0.25, state.drag.rotationX + deltaY));
    };

    const onPointerUp = (event) => {
      state.drag.active = false;
      canvasHost.releasePointerCapture?.(event.pointerId);
    };

    const onWheel = (event) => {
      event.preventDefault();
      state.zoom = Math.max(3.2, Math.min(6.0, state.zoom + event.deltaY * 0.002));
    };

    renderer.domElement.classList.add('model-viewer-canvas-element');
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const animate = () => {
      if (!modelViewerState || modelViewerState.scene !== scene) return;
      state.frameId = requestAnimationFrame(animate);
      avatar.rotation.y += (state.rotation.y - avatar.rotation.y) * 0.12;
      avatar.rotation.x += (state.rotation.x - avatar.rotation.x) * 0.12;
      avatar.position.y = -0.22 + Math.sin(Date.now() * 0.0012) * 0.02;
      floatingRing.rotation.z += 0.0018;
      sparkleGroup.rotation.y += 0.0015;
      camera.position.z += (state.zoom - camera.position.z) * 0.08;
      camera.lookAt(0, 0.72, 0.2);
      renderer.render(scene, camera);
    };

    window.addEventListener('resize', state.resize);
    state.resize();
    animate();
  }).catch((err) => {
    const host = overlay.querySelector('#model-viewer-canvas');
    if (host) {
      host.innerHTML = `<div class="model-viewer-error">${err.message || 'Failed to load 3D viewer.'}</div>`;
    }
  });

  return modelViewerState;
}

function openModelViewer() {
  if (!isAdminPage()) return;
  const overlay = ensureModelViewerModal();
  if (!overlay) return;
  overlay.classList.add('show');
  initializeModelViewer();
  requestAnimationFrame(() => {
    modelViewerState?.resize?.();
  });
}

function closeModelViewer() {
  const overlay = document.getElementById('model-viewer-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
}

function resetModelViewer() {
  modelViewerState?.reset?.();
}

let iconObserverStarted = false;

function startIconObserver() {
  if (iconObserverStarted || !document.body || !window.MutationObserver) return;
  iconObserverStarted = true;

  const observer = new MutationObserver((mutations) => {
    let ranLucide = false;
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        applyFontAwesomeFallbackIcons(mutation.target);
        applyLucideFallbackIcons(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        applyIconography(node);
        applyFontAwesomeFallbackIcons(node);
        applyLucideFallbackIcons(node);
        applyActionButtonIcons(node);
        if (window.lucide) ranLucide = true;
      }
    }
    if (ranLucide) {
      try {
        window.lucide.createIcons();
      } catch (err) {}
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}

function toggleTheme(event) {
  if (event) event.preventDefault();
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark', { animate: true });
}

function createThemeToggleButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'theme-toggle orbit-theme-toggle';
  btn.innerHTML = createOrbitThemeToggleMarkup();
  btn.addEventListener('click', toggleTheme);
  updateThemeToggleButtons();
  return btn;
}

function mountThemeToggle() {
  if (document.body && (document.body.classList.contains('login-page') || document.querySelector('#theme-toggle-btn'))) {
    return;
  }
  if (document.querySelector('.topbar')) {
    const topbar = document.querySelector('.topbar');
    let actions = topbar.querySelector('.topbar-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'topbar-actions';
      topbar.appendChild(actions);
    }
    actions.querySelectorAll('.theme-toggle:not(.orbit-theme-toggle)').forEach((oldToggle) => {
      oldToggle.replaceWith(createThemeToggleButton());
    });

    const themeToggles = actions.querySelectorAll('.theme-toggle');
    themeToggles.forEach((toggle, index) => {
      if (index > 0) toggle.remove();
    });

    if (!actions.querySelector('.theme-toggle')) {
      const createdThemeToggle = createThemeToggleButton();
      actions.prepend(createdThemeToggle);
    }
  } else if (!document.querySelector('.theme-toggle-floating')) {
    const floatingBtn = createThemeToggleButton();
    floatingBtn.classList.add('theme-toggle-floating');
    document.body.appendChild(floatingBtn);
  }

  updateThemeToggleButtons();
}

function initTopbarDate() {
  const dateEls = document.querySelectorAll('#current-date, #topbar-date-text, .topbar-date-badge span');
  if (!dateEls.length) return;
  try {
    const formatted = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    dateEls.forEach((el) => {
      const text = el.textContent ? el.textContent.trim() : '';
      if (!text || text === 'Today' || text === '—' || text === '') {
        el.textContent = formatted;
      }
    });
  } catch (e) {}
}

function mountAppBackgroundArt() {
  if (
    !document.body ||
    document.querySelector('.app-bg-art') ||
    document.body.classList.contains('login-page') ||
    document.body.classList.contains('auth-page')
  ) {
    return;
  }

  const art = document.createElement('div');
  art.className = 'app-bg-art';
  art.setAttribute('aria-hidden', 'true');
  art.innerHTML = `
    <div class="app-glow-orb app-glow-tr"></div>
    <div class="app-glow-orb app-glow-bl"></div>
    <div class="app-ribbon-corner app-ribbon-tr">
      <svg class="app-ribbon-svg" viewBox="0 0 840 660" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="appTrGrad1" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#004d2a" stop-opacity="0.32" />
            <stop offset="50%" stop-color="#006b3c" stop-opacity="0.18" />
            <stop offset="100%" stop-color="#059669" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="appTrGrad2" x1="100%" y1="0%" x2="10%" y2="90%">
            <stop offset="0%" stop-color="#006b3c" stop-opacity="0.25" />
            <stop offset="55%" stop-color="#059669" stop-opacity="0.12" />
            <stop offset="100%" stop-color="#7bc043" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="appGoldTr" x1="100%" y1="0%" x2="0%" y2="80%">
            <stop offset="0%" stop-color="#f5e197" stop-opacity="0.55" />
            <stop offset="45%" stop-color="#d4af37" stop-opacity="0.6" />
            <stop offset="100%" stop-color="#d4af37" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d="M 380 0 C 490 90, 660 260, 840 480 L 840 0 Z" fill="url(#appTrGrad1)" />
        <path d="M 240 0 C 380 110, 580 300, 840 570 L 840 0 Z" fill="url(#appTrGrad2)" />
        <path d="M 235 0 C 375 110, 575 300, 840 565" stroke="url(#appGoldTr)" stroke-width="1.5" stroke-linecap="round" />
        <path d="M 375 0 C 485 90, 655 260, 840 475" stroke="url(#appGoldTr)" stroke-width="1.0" stroke-dasharray="8 6" opacity="0.6" />
      </svg>
    </div>
    <div class="app-ribbon-corner app-ribbon-bl">
      <svg class="app-ribbon-svg" viewBox="0 0 860 680" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="appBlGrad1" x1="0%" y1="100%" x2="90%" y2="10%">
            <stop offset="0%" stop-color="#004d2a" stop-opacity="0.32" />
            <stop offset="50%" stop-color="#006b3c" stop-opacity="0.18" />
            <stop offset="100%" stop-color="#059669" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="appBlGrad2" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#006b3c" stop-opacity="0.25" />
            <stop offset="55%" stop-color="#059669" stop-opacity="0.12" />
            <stop offset="100%" stop-color="#7bc043" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="appGoldBl" x1="0%" y1="100%" x2="80%" y2="10%">
            <stop offset="0%" stop-color="#f5e197" stop-opacity="0.55" />
            <stop offset="40%" stop-color="#d4af37" stop-opacity="0.6" />
            <stop offset="100%" stop-color="#d4af37" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d="M 0 350 C 180 390, 390 510, 560 680 L 0 680 Z" fill="url(#appBlGrad1)" />
        <path d="M 0 220 C 220 270, 480 440, 720 680 L 0 680 Z" fill="url(#appBlGrad2)" />
        <path d="M 0 215 C 220 265, 480 435, 720 675" stroke="url(#appGoldBl)" stroke-width="1.5" stroke-linecap="round" />
        <path d="M 0 345 C 180 385, 390 505, 560 675" stroke="url(#appGoldBl)" stroke-width="1.0" stroke-dasharray="8 6" opacity="0.6" />
      </svg>
    </div>
  `;
  document.body.prepend(art);
}

function setPageTitle(pageName) {
  const brandPrefix = 'Dixit Lending Solution';
  if (!pageName) {
    document.title = brandPrefix;
    return;
  }
  const clean = String(pageName)
    .replace(/^CLN\s*Lending\s*Suite\s*[—–-]\s*/i, '')
    .replace(/^Dixit\s*Lending\s*Solution\s*[—–-]\s*/i, '')
    .trim();
  document.title = clean ? `${brandPrefix} — ${clean}` : brandPrefix;
}

function ensureBrandTabBranding() {
  if (typeof document === 'undefined') return;
  if (document.title) {
    if (document.title.includes('CLN Lending Suite') || document.title.includes('CLN Employee')) {
      const clean = document.title
        .replace(/^CLN\s*Lending\s*Suite\s*[—–-]\s*/i, '')
        .replace(/^CLN\s*Employee\s*[—–-]\s*/i, '')
        .replace(/\s*[—–-]\s*CLN\s*Employee\s*$/i, '')
        .trim();
      document.title = `Dixit Lending Solution — ${clean}`;
    } else if (!document.title.startsWith('Dixit Lending Solution')) {
      document.title = `Dixit Lending Solution — ${document.title.trim()}`;
    }
  }

  let iconLink = document.querySelector('link[rel="icon"]');
  if (!iconLink) {
    iconLink = document.createElement('link');
    iconLink.rel = 'icon';
    iconLink.type = 'image/png';
    document.head.appendChild(iconLink);
  }
  iconLink.href = '/icons/dixit-official-logo.png';

  let appleLink = document.querySelector('link[rel="apple-touch-icon"]');
  if (!appleLink) {
    appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    document.head.appendChild(appleLink);
  }
  appleLink.href = '/icons/dixit-official-logo.png';
}

function initTheme() {
  ensureBrandTabBranding();
  applyTheme(getResolvedTheme());
  mountThemeToggle();
  mountAppBackgroundArt();
  initTopbarDate();
  applyIconography();
  applyFontAwesomeFallbackIcons();
  applyLucideFallbackIcons();
  applyActionButtonIcons();
  startIconObserver();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister();
    });
  }).catch(() => {});

  if (window.caches && typeof window.caches.keys === 'function') {
    window.caches.keys().then((keys) => {
      keys.forEach((key) => window.caches.delete(key));
    }).catch(() => {});
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

registerServiceWorker();

// ── Token helpers ─────────────────────────────────────────────
const getToken = () => {
  try {
    return sessionStorage.getItem('cln_token') || localStorage.getItem('cln_token') || null;
  } catch (e) {
    return null;
  }
};

const getUser = () => {
  try {
    const raw = sessionStorage.getItem('cln_user') || localStorage.getItem('cln_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const setSession = (token, user, keepSignedIn = false) => {
  try {
    if (keepSignedIn) {
      localStorage.setItem('cln_token', token);
      localStorage.setItem('cln_user', JSON.stringify(user));
      sessionStorage.removeItem('cln_token');
      sessionStorage.removeItem('cln_user');
    } else {
      sessionStorage.setItem('cln_token', token);
      sessionStorage.setItem('cln_user', JSON.stringify(user));
      localStorage.removeItem('cln_token');
      localStorage.removeItem('cln_user');
    }
  } catch (err) {}
};

const clearSession = () => {
  try {
    localStorage.removeItem('cln_token');
    localStorage.removeItem('cln_user');
    localStorage.removeItem('login_error');
    sessionStorage.removeItem('cln_token');
    sessionStorage.removeItem('cln_user');
    sessionStorage.removeItem('cln_quick_paste_details');
    sessionStorage.removeItem('cln_auto_loan_data');
    sessionStorage.removeItem('login_error');
    ['password', 'userPassword', 'employeePassword', 'savedPassword', 'loginPassword', 'credentials', 'savedCredentials'].forEach(k => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
  } catch (err) {}
};

// ── Secure document viewer ──────────────────────────────────────
// Documents (Aadhaar, PAN, loan files) are no longer reachable via a
// public URL. This fetches the file with the user's auth token attached,
// then opens it in a new tab as a local blob — the tab URL itself never
// contains the token or any guessable/shareable path to the file.
async function openSecureDocument(docId) {
  if (!docId) return;
  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/documents/${docId}/view`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.message || 'Unable to open this document.');
      return;
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
    // Release the memory a little while after opening
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch (err) {
    console.error('[openSecureDocument] error:', err);
    alert('Unable to open this document. Please try again.');
  }
}
window.openSecureDocument = openSecureDocument;

// ── Shared HTML escaping helper ─────────────────────────────────
// Prevents stored XSS: any user-supplied text (customer names, file
// names, remarks, notes, etc.) that gets inserted via innerHTML should
// be passed through this first. Several pages already define their own
// local copy of this — that's harmless, but pages that don't have one
// can now use this shared version instead of skipping escaping entirely.
if (typeof window.escapeHtml !== 'function') {
  window.escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Core fetch wrapper ────────────────────────────────────────
async function apiRequest(method, path, body = null, isFormData = false) {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const opts = { method, headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);

  try {
    const res = await fetch(`${API_BASE}${path}`, opts);
    const data = await res.json().catch(() => ({ message: res.statusText }));

    if (res.status === 401) {
      clearSession();
      window.location.href = '/index.html';
      return;
    }

    if (res.status === 403) {
      const user = getUser();
      if (user && user.role === 'employee') {
        clearSession();
        localStorage.setItem('login_error', data?.message || 'Access denied. Account is inactive or outside working hours.');
        window.location.href = '/index.html';
        return;
      }
    }

    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, data: { message: 'Network error. Is the server running?' } };
  }
}

const api = {
  get:    (path)         => apiRequest('GET',    path),
  post:   (path, body)   => apiRequest('POST',   path, body),
  put:    (path, body)   => apiRequest('PUT',    path, body),
  patch:  (path, body)   => apiRequest('PATCH',  path, body),
  delete: (path)         => apiRequest('DELETE', path),
  upload: (path, form)   => apiRequest('POST',   path, form, true),
  // Expose base URLs for other UI code
  base: API_BASE,
  uploadsBase: UPLOADS_BASE,
};

// Export to global window so all modules and pages can access window.api
window.api = api;
window.getToken = getToken;
window.getUser = getUser;
window.setSession = setSession;
window.clearSession = clearSession;
window.API_BASE = API_BASE;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.formatCurrency = formatCurrency;

// ── Auth guard ────────────────────────────────────────────────
function requireRole(role) {
  const user = getUser();
  if (!getToken() || !user) {
    window.location.href = '/index.html';
    return null;
  }
  if (role && user.role !== role) {
    window.location.href = '/index.html';
    return null;
  }
  // Enforce mandatory password change for employees with temporary credentials
  if (user.role === 'employee' && user.must_change_password) {
    const currentPath = window.location.pathname.toLowerCase();
    if (!currentPath.includes('profile.html')) {
      window.location.href = '/employee/profile.html?force_password_change=1';
      return null;
    }
  }
  return user;
}

// ── Render sidebar user ───────────────────────────────────────
function renderSidebarUser() {
  const user = getUser();
  if (!user) return;
  const nameEl   = document.getElementById('sidebar-user-name');
  const roleEl   = document.getElementById('sidebar-user-role');
  const avatarEl = document.getElementById('sidebar-user-avatar');
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.role === 'admin' ? 'Administrator' : user.role;

  if (avatarEl) {
    const pic = user.profile_picture;
    if (pic) {
      avatarEl.style.backgroundImage = `url('${pic}')`;
      avatarEl.style.backgroundSize  = 'cover';
      avatarEl.style.backgroundPosition = 'center';
      avatarEl.textContent = '';
    } else {
      avatarEl.style.backgroundImage = '';
      avatarEl.textContent = user.name.charAt(0).toUpperCase();
    }
  }

  // Make user-info block clickable → profile page
  const userInfoEl = document.querySelector('.user-info');
  if (userInfoEl && !userInfoEl.dataset.profileLinked) {
    userInfoEl.dataset.profileLinked = '1';
    userInfoEl.style.cursor = 'pointer';
    userInfoEl.title = 'View Profile';
    userInfoEl.setAttribute('role', 'link');
    userInfoEl.setAttribute('tabindex', '0');
    userInfoEl.setAttribute('aria-label', 'View Profile');
    const navigateToProfile = () => {
      const role = user.role;
      window.location.href = role === 'admin' ? '/admin/profile.html' : '/employee/profile.html';
    };
    userInfoEl.addEventListener('click', navigateToProfile);
    userInfoEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateToProfile();
      }
    });
  }

  // Note: profile picture is read from the cached cln_user object in localStorage.
  // Call refreshSidebarAvatar() from profile pages after uploading a new avatar.
}

// ── Refresh sidebar avatar from session cache ─────────────────
function refreshSidebarAvatar(profilePicUrl) {
  const avatarEl = document.getElementById('sidebar-user-avatar');
  if (!avatarEl) return;
  if (profilePicUrl) {
    avatarEl.style.backgroundImage = `url('${profilePicUrl}')`;
    avatarEl.style.backgroundSize  = 'cover';
    avatarEl.style.backgroundPosition = 'center';
    avatarEl.textContent = '';
  } else {
    avatarEl.style.backgroundImage = '';
    const user = getUser();
    avatarEl.textContent = user ? user.name.charAt(0).toUpperCase() : '?';
  }
  // Persist to user session
  const user = getUser();
  if (user) {
    user.profile_picture = profilePicUrl || null;
    const str = JSON.stringify(user);
    if (sessionStorage.getItem('cln_token')) {
      sessionStorage.setItem('cln_user', str);
    }
    if (localStorage.getItem('cln_token')) {
      localStorage.setItem('cln_user', str);
    }
  }
}

// ── FormData POST helper (uses correct cln_token key) ─────────
async function apiPostForm(endpoint, formData) {
  try {
    const token = getToken();
    const resp = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 401) { clearSession(); window.location.href = '/index.html'; return; }
    if (resp.status === 403) {
      const user = getUser();
      if (user && user.role === 'employee') {
        clearSession();
        localStorage.setItem('login_error', data?.message || 'Access denied. Account is inactive or outside working hours.');
        window.location.href = '/index.html';
        return;
      }
    }
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) { return { ok: false, data: { message: err.message } }; }
}

// ── Logout ────────────────────────────────────────────────────
async function logout() {
  try {
    await api.post('/auth/logout');
  } catch (err) {}
  clearSession();
  window.location.replace('/index.html');
}

// ── Back-Forward Cache (BFCache) Guard ────────────────────────
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    const path = window.location.pathname;
    if (path.includes('/employee/') || path.includes('/admin/')) {
      if (!getToken() || !getUser()) {
        clearSession();
        window.location.replace('/index.html');
      }
    }
  }
});

// ── Mobile Sidebar Toggle ─────────────────────────────────────
function toggleMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  if (sidebar) {
    sidebar.classList.toggle('mobile-open');
  }
  
  if (overlay) {
    overlay.classList.toggle('show');
  }
}

// Close sidebar when a nav item is clicked (for mobile)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const sidebar = document.querySelector('.sidebar');
      const overlay = document.querySelector('.sidebar-overlay');
      
      if (window.innerWidth <= 768) {
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (overlay) overlay.classList.remove('show');
      }
    });
  });
});

// ── Show toast-style alert ────────────────────────────────────
function showAlert(id, message, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${type} show`;
  el.textContent = message;
  if (type !== 'error') setTimeout(() => { el.classList.remove('show'); }, 4000);
}

// ── Format helpers ────────────────────────────────────────────
function parseDisplayDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00+05:30`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?$/.test(trimmed)) {
    const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    const parsed = new Date(`${normalized}+05:30`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCurrency(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

function formatDate(date) {
  const parsedDate = parseDisplayDate(date);
  if (!parsedDate) return '—';

  return parsedDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
}

function formatDateTime(date) {
  const parsedDate = parseDisplayDate(date);
  if (!parsedDate) return '—';

  return parsedDate.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
}

function formatTime(date) {
  const parsedDate = parseDisplayDate(date);
  if (!parsedDate) return '—';

  return parsedDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata'
  });
}

function statusBadge(status) {
  const cls = {
    Pending: 'badge-pending',
    'Under Review': 'badge-under-review',
    'Documents Pending': 'badge-documents-pending',
    Approved: 'badge-approved',
    'Loan Disbursed': 'badge-loan-disbursed',
    Cancelled: 'badge-cancelled',
    Rejected: 'badge-rejected',
    Hold: 'badge-hold',
    ABND: 'badge-abnd',
    Other: 'badge-other'
  };
  return `<span class="badge ${cls[status] || ''}">${status}</span>`;
}

function buildQueryString(params) {
  const qs = Object.entries(params).filter(([,v]) => v).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return qs ? `?${qs}` : '';
}
