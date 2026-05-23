// ── API Base URL ──────────────────────────────────────────────
// Dynamically detect API URL to support different environments
const API_BASE = (() => {
  const { protocol, hostname, host } = window.location;

  // If frontend is opened as a local file, target local backend.
  if (protocol === 'file:') {
    return 'http://srv-d88q4feq1p3s73f74150:5000/api';
  }

  // In local dev, frontend may run on :8080/:3000 while backend runs on :5000.
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//srv-d88q4feq1p3s73f74150:5000/api`;
  }

  // In production, use same-origin API.
  return `${protocol}//${host}/api`;
})();

// Base URL for serving uploads (same host as API without the /api suffix)
const UPLOADS_BASE = API_BASE.replace(/\/api$/i, '');

// ── Theme controls ─────────────────────────────────────────────
const THEME_STORAGE_KEY = 'cln_theme';

function getStoredTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY);
}

function getResolvedTheme() {
  const stored = getStoredTheme();
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateThemeToggleButtons() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? 'Light' : 'Dark';
  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    btn.textContent = label;
    btn.setAttribute('aria-label', `Switch to ${next} theme`);
    btn.title = `Switch to ${next} theme`;
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  updateThemeToggleButtons();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function createThemeToggleButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary btn-sm theme-toggle';
  btn.addEventListener('click', toggleTheme);
  return btn;
}

function mountThemeToggle() {
  if (document.querySelector('.topbar')) {
    const topbar = document.querySelector('.topbar');
    let actions = topbar.querySelector('.topbar-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'topbar-actions';
      topbar.appendChild(actions);
    }
    if (!actions.querySelector('.theme-toggle')) {
      actions.prepend(createThemeToggleButton());
    }
  } else if (!document.querySelector('.theme-toggle-floating')) {
    const floatingBtn = createThemeToggleButton();
    floatingBtn.classList.add('theme-toggle-floating');
    document.body.appendChild(floatingBtn);
  }

  updateThemeToggleButtons();
}

function initTheme() {
  applyTheme(getResolvedTheme());
  mountThemeToggle();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const localDevHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (localDevHost) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    }).catch(() => {});

    if (window.caches && typeof window.caches.keys === 'function') {
      window.caches.keys().then((keys) => {
        keys.forEach((key) => window.caches.delete(key));
      }).catch(() => {});
    }
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

registerServiceWorker();

// ── Token helpers ─────────────────────────────────────────────
const getToken = () => localStorage.getItem('cln_token');
const getUser  = () => JSON.parse(localStorage.getItem('cln_user') || 'null');

const setSession = (token, user) => {
  localStorage.setItem('cln_token', token);
  localStorage.setItem('cln_user', JSON.stringify(user));
};

const clearSession = () => {
  localStorage.removeItem('cln_token');
  localStorage.removeItem('cln_user');
};

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

    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, data: { message: 'Network error. Is the server running?' } };
  }
}

const api = {
  get:    (path)         => apiRequest('GET',    path),
  post:   (path, body)   => apiRequest('POST',   path, body),
  patch:  (path, body)   => apiRequest('PATCH',  path, body),
  delete: (path)         => apiRequest('DELETE', path),
  upload: (path, form)   => apiRequest('POST',   path, form, true),
  // Expose base URLs for other UI code
  base: API_BASE,
  uploadsBase: UPLOADS_BASE,
};

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
  return user;
}

// ── Render sidebar user ───────────────────────────────────────
function renderSidebarUser() {
  const user = getUser();
  if (!user) return;
  const nameEl = document.getElementById('sidebar-user-name');
  const roleEl = document.getElementById('sidebar-user-role');
  const avatarEl = document.getElementById('sidebar-user-avatar');
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.role;
  if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
}

// ── Logout ────────────────────────────────────────────────────
function logout() {
  clearSession();
  window.location.href = '/index.html';
}

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
function formatCurrency(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata'
  });
}

function statusBadge(status) {
  const cls = { Pending: 'badge-pending', Approved: 'badge-approved', Rejected: 'badge-rejected' };
  return `<span class="badge ${cls[status] || ''}">${status}</span>`;
}

function buildQueryString(params) {
  const qs = Object.entries(params).filter(([,v]) => v).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return qs ? `?${qs}` : '';
}
