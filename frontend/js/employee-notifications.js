/**
 * CLN Lending Suite - Shared Employee Notification Center
 * Reusable across all Employee Workspace pages:
 *   - /employee/dashboard.html
 *   - /employee/add-customer.html
 *   - /employee/my-customers.html
 *   - /employee/loans.html
 *   - /employee/emi-calculator.html
 *   - /employee/apr.html
 *   - /employee/data-excel.html
 *   - /employee/profile.html
 */

(function() {
  'use strict';

  // Professional SVG Icon definitions (No emojis - Pure FinTech SaaS UI/UX)
  const NOTIF_ICONS = {
    bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>`,
    bellSlash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 7-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L9.1 10.6a16 16 0 0 0 4.3 4.3l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z"/></svg>`,
    clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 4h6v3H9z"/><path d="M8 11h8"/><path d="M8 15h6"/></svg>`,
    checkCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    cancelled: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    zap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    alertCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    coins: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
  };

  // State
  let allNotifications = [];
  let notifDropdownOpen = false;
  let lastUnreadCount = 0;
  let notifPollInterval = null;
  let pendingDeleteNotifId = null;
  let isInitialized = false;

  // Helper: Escape HTML to avoid XSS
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Helper: Today in IST (YYYY-MM-DD)
  function getTodayIST() {
    try {
      return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    } catch (e) {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }

  // Helper: Format relative timestamp with Asia/Kolkata context
  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 50) return 'just now';
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 172800) return 'yesterday';
    return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  }

  // Helper: Parse date to YYYY-MM-DD
  function parseYMD(dateVal) {
    if (!dateVal) return '';
    let str = String(dateVal);
    if (str.includes('T')) str = str.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Helper: Callback Due tag formatting
  function callbackDueLabel(callbackDate, callbackPeriod) {
    const ymd = parseYMD(callbackDate);
    if (!ymd) return '';

    const todayIST = getTodayIST();
    const periodStr = callbackPeriod && callbackPeriod !== 'anytime' ? ` (${callbackPeriod})` : '';

    const parts = ymd.split('-');
    const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const dateFormatted = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : ymd;

    if (ymd === todayIST) {
      return `<span class="notif-tag tag-due">${NOTIF_ICONS.zap} Due Today${periodStr} &bull; ${dateFormatted}</span>`;
    }
    if (ymd < todayIST) {
      return `<span class="notif-tag tag-overdue">${NOTIF_ICONS.alertCircle} Overdue${periodStr} &bull; ${dateFormatted}</span>`;
    }
    return `<span class="notif-tag tag-upcoming">${NOTIF_ICONS.calendar} Upcoming${periodStr} &bull; ${dateFormatted}</span>`;
  }

  // Build a single notification item HTML
  function buildNotifItemHtml(n) {
    const isCallback = n.type === 'callback_reminder';
    const isCancelled = n.title && n.title.toLowerCase().includes('cancel');
    const isSuccess = n.type === 'work_completed' || (n.title && n.title.toLowerCase().includes('completed'));
    const isAssignment = n.type === 'work_assigned' || n.type === 'assignment' || n.reference_type === 'assignment' || (n.title && n.title.toLowerCase().includes('assignment'));
    const isExpiring = n.type === 'assignment_expiring' || n.type === 'assignment_expired' || (n.title && n.title.toLowerCase().includes('expir'));
    const isCustomer = n.type === 'customer' || (n.title && n.title.toLowerCase().includes('customer') && !isCallback);
    const isLoan = n.type === 'loan' || (n.title && n.title.toLowerCase().includes('loan'));
    const unreadClass = (n.is_read || n.isRead) ? '' : ' unread';

    let iconClass = 'notif-icon-work';
    let iconSvg = NOTIF_ICONS.clipboard;

    if (isCancelled) {
      iconClass = 'notif-icon-cancelled';
      iconSvg = NOTIF_ICONS.cancelled;
    } else if (isExpiring) {
      iconClass = 'notif-icon-urgent';
      iconSvg = NOTIF_ICONS.clock;
    } else if (isCallback) {
      iconClass = 'notif-icon-callback';
      iconSvg = NOTIF_ICONS.phone;
    } else if (isLoan) {
      iconClass = 'notif-icon-loan';
      iconSvg = NOTIF_ICONS.coins;
    } else if (isCustomer) {
      iconClass = 'notif-icon-customer';
      iconSvg = NOTIF_ICONS.user;
    } else if (isSuccess) {
      iconClass = 'notif-icon-success';
      iconSvg = NOTIF_ICONS.checkCircle;
    }

    let tagHtml = '';
    if (isCallback && n.callback_date && n.reminder_status !== 'completed' && n.reminder_status !== 'cancelled') {
      tagHtml = callbackDueLabel(n.callback_date, n.callback_period);
    } else if (isCallback && (n.reminder_status === 'completed' || n.reminder_status === 'cancelled')) {
      const statusText = n.reminder_status === 'completed' ? 'Completed' : 'Cancelled';
      const icon = n.reminder_status === 'completed' ? NOTIF_ICONS.checkCircle : NOTIF_ICONS.cancelled;
      tagHtml = `<span class="notif-tag tag-completed">${icon} ${statusText}</span>`;
    } else if (isExpiring) {
      tagHtml = `<span class="notif-tag tag-overdue">${NOTIF_ICONS.alertCircle} Expiring</span>`;
    } else if (isAssignment && n.assignment_id) {
      tagHtml = `<span class="notif-tag" style="background:rgba(59,130,246,0.12);color:#2563eb;border:1px solid rgba(59,130,246,0.2);">${NOTIF_ICONS.clipboard} Assignment #${n.assignment_id}</span>`;
    } else if (isLoan && n.loan_id) {
      tagHtml = `<span class="notif-tag" style="background:rgba(168,85,247,0.12);color:#9333ea;border:1px solid rgba(168,85,247,0.2);">${NOTIF_ICONS.coins} Loan #LN-${n.loan_id}</span>`;
    } else if (isCustomer && n.customer_id) {
      tagHtml = `<span class="notif-tag" style="background:rgba(14,165,233,0.12);color:#0284c7;border:1px solid rgba(14,165,233,0.2);">${NOTIF_ICONS.user} Customer #${n.customer_id}</span>`;
    }

    // Priority pill
    let priorityHtml = '';
    const prio = (n.priority || 'normal').toLowerCase();
    if (prio === 'urgent' || prio === 'critical') {
      priorityHtml = `<span class="notif-priority-pill notif-priority-urgent">${prio}</span>`;
    } else if (prio === 'important') {
      priorityHtml = `<span class="notif-priority-pill notif-priority-important">important</span>`;
    }

    const dismissBtn = (isCallback && n.reminder_status === 'pending')
      ? `<button class="notif-dismiss-btn" onclick="event.stopPropagation();CLNNotifications.dismissReminder(${n.id})" title="Mark callback done">${NOTIF_ICONS.checkCircle} Done</button>`
      : '';

    const deleteBtn = `<button class="notif-delete-btn" onclick="event.stopPropagation();CLNNotifications.confirmDelete(${n.id})" title="Delete notification" aria-label="Delete notification">${NOTIF_ICONS.trash}</button>`;

    // Build smart link URL
    let linkUrl = n.link_url || n.linkUrl || '';
    if (!linkUrl) {
      if (n.assignment_id && n.record_id) {
        linkUrl = `/employee/data-excel.html?assignmentId=${encodeURIComponent(n.assignment_id)}&recordId=${encodeURIComponent(n.record_id)}`;
      } else if (n.assignment_id) {
        linkUrl = `/employee/data-excel.html?assignmentId=${encodeURIComponent(n.assignment_id)}`;
      } else if (n.customer_id) {
        linkUrl = `/employee/my-customers.html?customerId=${encodeURIComponent(n.customer_id)}`;
      } else if (n.loan_id) {
        linkUrl = `/employee/loans.html?loanId=${encodeURIComponent(n.loan_id)}`;
      } else {
        linkUrl = '/employee/dashboard.html';
      }
    }

    return `
      <div class="notif-item${unreadClass}" id="notif-item-${n.id}" onclick="CLNNotifications.handleClick(${n.id}, '${escapeHtml(linkUrl)}')">
        <div class="notif-icon-wrap ${iconClass}">${iconSvg}</div>
        <div class="notif-content">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <div class="notif-title">${escapeHtml(n.title)}</div>
            ${priorityHtml}
          </div>
          <div class="notif-body">${escapeHtml(n.message || n.body || '')}</div>
          <div class="notif-meta-bar">
            ${tagHtml}
            <span class="notif-time">${timeAgo(n.created_at || n.createdAt)}</span>
          </div>
        </div>
        <div class="notif-item-actions">
          ${dismissBtn}
          ${deleteBtn}
        </div>
      </div>
    `;
  }

  // Ensure bell HTML exists in topbar
  function ensureBellMarkup() {
    let wrap = document.getElementById('notif-bell-wrap');
    if (wrap) return wrap;

    const topbar = document.querySelector('.topbar');
    if (!topbar) return null;

    let actions = topbar.querySelector('.topbar-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'topbar-actions';
      topbar.appendChild(actions);
    }

    wrap = document.createElement('div');
    wrap.className = 'notif-bell-wrap';
    wrap.id = 'notif-bell-wrap';
    wrap.innerHTML = `
      <button class="notif-bell-btn" id="notif-bell-btn" onclick="CLNNotifications.toggleDropdown()" aria-label="Notifications" title="Notifications" tabindex="0">
        ${NOTIF_ICONS.bell}
        <span id="notif-bell-badge" class="notif-badge" style="display:none;">0</span>
      </button>
      <div class="notif-dropdown" id="notif-dropdown" role="region" aria-label="Notifications Panel">
        <div class="notif-dd-header">
          <div class="notif-dd-title-wrap">
            ${NOTIF_ICONS.bell}
            <h4>Notifications</h4>
          </div>
          <button class="notif-dd-link" onclick="CLNNotifications.markAllRead()">Mark all read</button>
        </div>
        <div class="notif-list" id="notif-dd-list"><div class="notif-empty">Loading notifications…</div></div>
      </div>
    `;

    // Insert before theme toggle if present, otherwise append
    const themeToggle = actions.querySelector('.theme-toggle');
    if (themeToggle) {
      actions.insertBefore(wrap, themeToggle);
    } else {
      actions.prepend(wrap);
    }

    return wrap;
  }

  // Ensure modal & toast markup exists in body
  function ensureModalMarkup() {
    if (!document.getElementById('delete-notif-modal')) {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.id = 'delete-notif-modal';
      modal.onclick = (e) => CLNNotifications.closeDeleteModalOnOverlay(e);
      modal.innerHTML = `
        <div class="modal" style="max-width:380px;text-align:center;padding:26px 22px;">
          <div style="width:48px;height:48px;border-radius:50%;background:rgba(239,68,68,0.12);color:#ef4444;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
            ${NOTIF_ICONS.trash}
          </div>
          <h4 style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">Delete Notification?</h4>
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.4;">This notification will be permanently removed from your feed.</p>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-secondary" onclick="CLNNotifications.closeDeleteModal()" style="flex:1;">Cancel</button>
            <button class="btn btn-danger" id="confirm-delete-notif-btn" style="flex:1;">Delete</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    if (!document.getElementById('notif-toast')) {
      const toast = document.createElement('div');
      toast.id = 'notif-toast';
      toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border);border-radius:10px;padding:10px 18px;font-size:13px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,0.2);z-index:9999;display:none;align-items:center;gap:8px;';
      document.body.appendChild(toast);
    }
  }

  // Filter out client-side expired items
  function filterActiveNotifications(list) {
    const now = Date.now();
    return (list || []).filter(n => {
      if (n.status === 'expired') return false;
      if (n.expires_at || n.expiresAt) {
        const expTime = new Date(n.expires_at || n.expiresAt).getTime();
        if (!isNaN(expTime) && expTime <= now) return false;
      }
      return true;
    });
  }

  // Render notifications to dropdown & update badge
  function renderNotifications() {
    const ddList    = document.getElementById('notif-dd-list');
    const bellBadge = document.getElementById('notif-bell-badge');
    const bellBtn   = document.getElementById('notif-bell-btn');

    // Filter active (non-expired)
    const active = filterActiveNotifications(allNotifications);
    const unread = active.filter(n => !n.is_read && !n.isRead).length;

    // Update bell badge
    if (bellBadge) {
      if (unread > 0) {
        bellBadge.textContent = unread > 99 ? '99+' : unread;
        bellBadge.style.display = 'flex';
        if (unread > lastUnreadCount && bellBtn) {
          bellBtn.classList.remove('shake');
          void bellBtn.offsetWidth;
          bellBtn.classList.add('shake');
          setTimeout(() => bellBtn?.classList.remove('shake'), 700);
        }
      } else {
        bellBadge.style.display = 'none';
        bellBadge.textContent = '0';
      }
    }
    lastUnreadCount = unread;

    if (!ddList) return;

    if (active.length === 0) {
      ddList.innerHTML = `
        <div class="notif-empty">
          ${NOTIF_ICONS.bellSlash}
          <p style="font-weight:600;margin:0 0 4px;color:var(--text-primary);">You're all caught up</p>
          <span style="font-size:12px;color:var(--text-secondary);">No new notifications right now.</span>
        </div>`;
      return;
    }

    ddList.innerHTML = active.map(n => buildNotifItemHtml(n)).join('');
  }

  // Helper: Retrieve active API client
  function getApiClient() {
    if (typeof window !== 'undefined' && window.api && typeof window.api.get === 'function') {
      return window.api;
    }
    if (typeof api !== 'undefined' && api && typeof api.get === 'function') {
      return api;
    }
    return null;
  }

  // Helper: Retrieve employee auth token
  function getAuthToken() {
    if (typeof getToken === 'function') {
      try {
        const t = getToken();
        if (t) return t;
      } catch (e) {}
    }
    try {
      return sessionStorage.getItem('cln_token') || localStorage.getItem('cln_token') || localStorage.getItem('token') || '';
    } catch (e) {
      return '';
    }
  }

  // Helper: Retrieve API base URL
  function getApiBaseUrl() {
    const client = getApiClient();
    if (client && client.base) return client.base;
    if (typeof API_BASE !== 'undefined' && API_BASE) return API_BASE;
    if (typeof window !== 'undefined' && window.API_BASE) return window.API_BASE;
    return '/api';
  }

  // Load notifications from API
  async function loadNotifications() {
    const ddList = document.getElementById('notif-dd-list');
    if (allNotifications.length === 0 && ddList && notifDropdownOpen) {
      ddList.innerHTML = `
        <div class="notif-empty">
          <p style="font-size:13px;color:var(--text-secondary);margin:0;">Loading notifications...</p>
        </div>`;
    }

    try {
      let res = null;
      const client = getApiClient();

      // Primary: Use standard CLN API client if available
      if (client && typeof client.get === 'function') {
        res = await client.get('/notifications');
        if (!res?.ok) res = await client.get('/employee/notifications');
      }

      // Secondary: Direct authenticated fetch with token and proper API_BASE
      if (!res?.ok) {
        const token = getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const base = getApiBaseUrl();

        const fetchRes = await fetch(`${base}/notifications`, { headers }).catch(() => null);
        if (fetchRes && fetchRes.ok) {
          const data = await fetchRes.json().catch(() => ({}));
          res = { ok: true, data };
        } else {
          const altRes = await fetch(`${base}/employee/notifications`, { headers }).catch(() => null);
          if (altRes && altRes.ok) {
            const data = await altRes.json().catch(() => ({}));
            res = { ok: true, data };
          }
        }
      }

      if (res?.ok) {
        const rawData = res.data || {};
        const items = Array.isArray(rawData)
          ? rawData
          : (rawData.notifications || rawData.data || []);
        allNotifications = filterActiveNotifications(items);
        renderNotifications();
      } else {
        if (allNotifications.length === 0 && ddList) {
          ddList.innerHTML = `
            <div class="notif-empty">
              ${NOTIF_ICONS.alertCircle}
              <p style="font-weight:600;margin:6px 0 2px;color:var(--text-primary);">Unable to load notifications.</p>
              <button class="notif-dd-link" onclick="CLNNotifications.load()" style="margin-top:6px;">Try again</button>
            </div>`;
        }
      }
    } catch (e) {
      console.error('[CLNNotifications] load error:', e);
      if (allNotifications.length === 0 && ddList) {
        ddList.innerHTML = `
          <div class="notif-empty">
            ${NOTIF_ICONS.alertCircle}
            <p style="font-weight:600;margin:6px 0 2px;color:var(--text-primary);">Unable to load notifications.</p>
            <button class="notif-dd-link" onclick="CLNNotifications.load()" style="margin-top:6px;">Try again</button>
          </div>`;
      }
    }
  }

  // Dropdown toggle
  function toggleNotifDropdown() {
    const dd = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-bell-btn');
    notifDropdownOpen = !notifDropdownOpen;
    dd?.classList.toggle('open', notifDropdownOpen);
    btn?.classList.toggle('active', notifDropdownOpen);
    if (notifDropdownOpen) {
      loadNotifications();
    }
  }

  function closeNotifDropdown() {
    const dd = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-bell-btn');
    dd?.classList.remove('open');
    btn?.classList.remove('active');
    notifDropdownOpen = false;
  }

  // Handle click on a notification item: marks read, navigates, and smart focuses
  async function handleNotifClick(id, url) {
    closeNotifDropdown();

    // Optimistically mark read in UI
    allNotifications = allNotifications.map(n =>
      n.id === id ? { ...n, is_read: 1, isRead: true, status: 'read' } : n
    );
    renderNotifications();

    // Call server to persist read status
    markOneReadOnServer(id).catch(e => console.error('[CLNNotifications] markOneRead error:', e));

    if (!url) return;

    // Check if destination is on the current page
    const currentPath = window.location.pathname.toLowerCase();
    const parsedTarget = new URL(url, window.location.origin);
    const targetPath = parsedTarget.pathname.toLowerCase();

    if (currentPath === targetPath) {
      // Same page in-place handling
      const targetParams = parsedTarget.searchParams;

      if (currentPath.includes('data-excel.html')) {
        const asgnId = parseInt(targetParams.get('assignmentId'), 10);
        const recId = parseInt(targetParams.get('recordId'), 10);
        const phone = targetParams.get('phone');

        if (asgnId && typeof window.openSheet === 'function') {
          await window.openSheet(asgnId);
          if ((recId || phone) && typeof window.focusRecordInSheet === 'function') {
            setTimeout(() => window.focusRecordInSheet(recId || null, phone || null), 250);
          }
          return;
        }
      } else if (currentPath.includes('my-customers.html')) {
        const custId = parseInt(targetParams.get('customerId'), 10);
        if (custId && typeof window.focusCustomerInTable === 'function') {
          window.focusCustomerInTable(custId);
          return;
        }
      } else if (currentPath.includes('loans.html')) {
        const loanId = parseInt(targetParams.get('loanId'), 10);
        if (loanId && typeof window.focusLoanInTable === 'function') {
          window.focusLoanInTable(loanId);
          return;
        }
      }
    }

    // Different page or standard navigation
    window.location.href = url;
  }

  // Server mark read helper
  async function markOneReadOnServer(id) {
    try {
      const client = getApiClient();
      let ok = false;
      if (client && typeof client.patch === 'function') {
        const res = await client.patch(`/notifications/${id}/read`, {});
        ok = res?.ok;
      }
      if (!ok) {
        const token = getAuthToken();
        const base = getApiBaseUrl();
        await fetch(`${base}/notifications/${id}/read`, {
          method: 'PATCH',
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (e) {
      console.error('[CLNNotifications] markOneReadOnServer error:', e);
    }
  }

  // Mark all as read (Optimistic & Server Synchronized)
  async function markAllRead() {
    allNotifications = allNotifications.map(n => ({ ...n, is_read: 1, isRead: true, status: 'read' }));
    renderNotifications();

    try {
      const client = getApiClient();
      let ok = false;
      if (client && typeof client.patch === 'function') {
        const res = await client.patch('/notifications/mark-all-read', {});
        ok = res?.ok;
      }
      if (!ok) {
        const token = getAuthToken();
        const base = getApiBaseUrl();
        await fetch(`${base}/notifications/mark-all-read`, {
          method: 'PATCH',
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json'
          }
        });
      }
      showNotifToast('All notifications marked as read');
    } catch (e) {
      console.error('[CLNNotifications] markAllRead error:', e);
    }
  }

  // Dismiss a callback reminder
  async function dismissReminder(notifId) {
    allNotifications = allNotifications.map(n =>
      n.id === notifId ? { ...n, is_read: 1, isRead: true, reminder_status: 'completed', status: 'read' } : n
    );
    renderNotifications();

    try {
      const client = getApiClient();
      let ok = false;
      if (client && typeof client.patch === 'function') {
        const res = await client.patch(`/notifications/${notifId}/dismiss`, {});
        ok = res?.ok;
      }
      if (!ok) {
        const token = getAuthToken();
        const base = getApiBaseUrl();
        await fetch(`${base}/notifications/${notifId}/dismiss`, {
          method: 'PATCH',
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json'
          }
        });
      }
      showNotifToast('Callback marked completed');
      await loadNotifications();
    } catch (e) {
      console.error('[CLNNotifications] dismissReminder error:', e);
    }
  }

  // Delete notification confirmation modal
  function confirmDeleteNotif(id) {
    pendingDeleteNotifId = id;
    const modal = document.getElementById('delete-notif-modal');
    const confirmBtn = document.getElementById('confirm-delete-notif-btn');
    if (!modal) return;
    modal.classList.add('show');
    if (confirmBtn) {
      confirmBtn.onclick = async function() {
        const deleteId = pendingDeleteNotifId;
        closeDeleteNotifModal();
        if (deleteId) await deleteSingleNotif(deleteId);
      };
    }
  }

  function closeDeleteNotifModal() {
    document.getElementById('delete-notif-modal')?.classList.remove('show');
    pendingDeleteNotifId = null;
  }

  function closeDeleteNotifModalOnOverlay(e) {
    if (e.target && e.target.id === 'delete-notif-modal') closeDeleteNotifModal();
  }

  // Delete single notification
  async function deleteSingleNotif(notifId) {
    allNotifications = allNotifications.filter(n => n.id !== notifId);
    renderNotifications();

    try {
      let ok = false;
      const client = getApiClient();
      if (client && typeof client.delete === 'function') {
        const res = await client.delete(`/notifications/${notifId}`);
        ok = res?.ok;
      }
      if (!ok) {
        const token = getAuthToken();
        const base = getApiBaseUrl();
        const res = await fetch(`${base}/notifications/${notifId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json'
          }
        });
        ok = res.ok;
      }

      if (ok) {
        showNotifToast('Notification deleted');
      } else {
        await loadNotifications();
      }
    } catch (err) {
      console.error('[CLNNotifications] delete error:', err);
      await loadNotifications();
    }
  }

  // Show floating toast
  function showNotifToast(message) {
    const toast = document.getElementById('notif-toast');
    if (!toast) return;
    toast.innerHTML = `${NOTIF_ICONS.check} ${escapeHtml(message)}`;
    toast.style.display = 'flex';
    setTimeout(() => { toast.style.display = 'none'; }, 2200);
  }

  // Polling & focus auto-refresh (Every 35 seconds, clean single interval)
  function setupNotificationPolling() {
    if (notifPollInterval) clearInterval(notifPollInterval);
    notifPollInterval = setInterval(loadNotifications, 35000);

    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        loadNotifications();
      }
    });

    window.addEventListener('focus', function() {
      loadNotifications();
    });

    // Cleanup interval on page unload to prevent leaks
    window.addEventListener('beforeunload', function() {
      if (notifPollInterval) {
        clearInterval(notifPollInterval);
        notifPollInterval = null;
      }
    });
  }

  // Initialize
  function init() {
    if (isInitialized) return;
    document.querySelector('.app-layout')?.classList.add('employee-page');
    ensureBellMarkup();
    ensureModalMarkup();

    // Close on outside click
    document.addEventListener('click', function(e) {
      if (!document.getElementById('notif-bell-wrap')?.contains(e.target)) {
        closeNotifDropdown();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && notifDropdownOpen) {
        closeNotifDropdown();
      }
    });

    // Enter / Space accessibility on bell button
    document.getElementById('notif-bell-btn')?.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleNotifDropdown();
      }
    });

    loadNotifications();
    setupNotificationPolling();
    isInitialized = true;
  }

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  // Public API
  const CLNNotifications = {
    init,
    load: loadNotifications,
    render: renderNotifications,
    toggleDropdown: toggleNotifDropdown,
    closeDropdown: closeNotifDropdown,
    handleClick: handleNotifClick,
    markOneRead: markOneReadOnServer,
    markAllRead,
    dismissReminder,
    confirmDelete: confirmDeleteNotif,
    closeDeleteModal: closeDeleteNotifModal,
    closeDeleteModalOnOverlay: closeDeleteNotifModalOnOverlay,
    deleteSingle: deleteSingleNotif,
    showToast: showNotifToast,
    getNotifications: () => allNotifications,
    getUnreadCount: () => filterActiveNotifications(allNotifications).filter(n => !n.is_read && !n.isRead).length
  };

  // Expose to window
  window.CLNNotifications = CLNNotifications;

  // Backward-compatible global aliases
  window.toggleNotifDropdown = toggleNotifDropdown;
  window.closeNotifDropdown = closeNotifDropdown;
  window.markAllRead = markAllRead;
  window.loadNotifications = loadNotifications;
  window.renderNotifications = renderNotifications;
  window.handleNotifClick = handleNotifClick;
  window.markOneRead = markOneReadOnServer;
  window.dismissReminder = dismissReminder;
  window.confirmDeleteNotif = confirmDeleteNotif;
  window.closeDeleteNotifModal = closeDeleteNotifModal;
  window.closeDeleteNotifModalOnOverlay = closeDeleteNotifModalOnOverlay;
  window.deleteSingleNotif = deleteSingleNotif;
  window.showNotifToast = showNotifToast;

})();
