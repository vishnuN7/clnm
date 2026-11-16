/**
 * CLN Lending Suite - Centralized Real-Time Notification & Communication System
 * Unified Architecture for Admin Console & Employee Workspace
 * 
 * Features:
 * - Real-Time Server-Sent Events (SSE) Stream with Auto-Reconnect & Heartbeat
 * - Confirmed Delivery & Read Lifecycle Tracking (Sent -> Delivered -> Read)
 * - Multi-Tab Synchronization via BroadcastChannel API
 * - Tabbed Notification Center (All, Unread, Read) with Search & Pagination
 * - WhatsApp-Inspired Bottom-Right Toast Alerts for New Messages & Submissions
 * - Web Audio API Synthetic Chimes (Urgent / Important / Normal)
 * - Admin Announcement & Message Composer (All / Selected / Individual Employees)
 * - Admin Live Delivery & Read Audit Tracker Modal
 * - Notification Preferences Modal (Sound, Browser Notifications, Alert types)
 * - Automatic Deep-Linking with In-Page Row Focus Highlighting
 */

(function(window) {
  'use strict';

  // --- FinTech SVG Icon Registry ---
  const ICONS = {
    bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>`,
    bellSlash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 7-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    checkCheck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>`,
    checkCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 4h6v3H9z"/><path d="M8 11h8"/><path d="M8 15h6"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    coins: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>`,
    fileText: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    alertCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    megaphone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
  };

  // --- Internal State ---
  let allNotifications = [];
  let currentTab = 'all'; // 'all' | 'unread' | 'read'
  let notifDropdownOpen = false;
  let lastUnreadCount = 0;
  let isInitialized = false;
  let eventSource = null;
  let isSSEConnected = false;
  let pollInterval = null;
  let broadcastBus = null;
  let activePreferences = {
    sound_enabled: 1,
    browser_notifications_enabled: 0,
    announcement_alerts: 1,
    task_alerts: 1
  };

  // --- Session & Auth Helpers ---
  function getUser() {
    try {
      const u = sessionStorage.getItem('cln_user') || localStorage.getItem('cln_user') || localStorage.getItem('user');
      return u ? JSON.parse(u) : null;
    } catch (_) { return null; }
  }

  function getToken() {
    if (typeof window.getToken === 'function') {
      try { const t = window.getToken(); if (t) return t; } catch (_) {}
    }
    try {
      return sessionStorage.getItem('cln_token') || localStorage.getItem('cln_token') || localStorage.getItem('token') || '';
    } catch (_) { return ''; }
  }

  function getUserRole() {
    const u = getUser();
    if (u && u.role) return u.role.toLowerCase();
    if (window.location.pathname.includes('/admin/')) return 'admin';
    return 'employee';
  }

  function getApiBaseUrl() {
    if (window.api && window.api.base) return window.api.base;
    if (typeof API_BASE !== 'undefined' && API_BASE) return API_BASE;
    if (window.API_BASE) return window.API_BASE;
    return '/api';
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 45) return 'just now';
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 172800) return 'yesterday';
    return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  }

  // --- Web Audio Synthetic Chime (Zero External Audio File Dependency) ---
  function playNotificationChime(priority) {
    if (!activePreferences.sound_enabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (priority === 'urgent' || priority === 'critical') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880.00, now + 0.12); // A5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (priority === 'important') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440.00, now); // A4
        osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.start(now);
        osc.stop(now + 0.38);
      } else {
        // Standard gentle SaaS chime (C5 -> G5)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(783.99, now + 0.09); // G5
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.start(now);
        osc.stop(now + 0.32);
      }
    } catch (_) {}
  }

  // --- HTML5 Desktop Browser Notification ---
  function showBrowserDesktopNotification(n) {
    if (!activePreferences.browser_notifications_enabled) return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      try {
        const title = `[CLN] ${n.title || 'Notification'}`;
        // Prevent leaking confidential borrower details
        const safeBody = (n.message || '').length > 90 ? (n.message.substring(0, 87) + '...') : n.message;
        const desktopNotif = new Notification(title, {
          body: safeBody,
          icon: '/icons/dixit-official-logo.png',
          tag: `cln-notif-${n.id}`
        });
        desktopNotif.onclick = () => {
          window.focus();
          handleNotifClick(n.id, n.action_url || n.link_url);
        };
      } catch (_) {}
    }
  }

  // --- Real-time SSE Stream ---
  function connectRealtimeStream() {
    const token = getToken();
    if (!token) return;

    if (eventSource) {
      try { eventSource.close(); } catch (_) {}
      eventSource = null;
    }

    const streamUrl = `${getApiBaseUrl()}/notifications/stream?token=${encodeURIComponent(token)}`;

    try {
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        isSSEConnected = true;
        updateLiveIndicator(true);
      };

      eventSource.addEventListener('connected', () => {
        isSSEConnected = true;
        updateLiveIndicator(true);
      });

      eventSource.addEventListener('notification:new', (evt) => {
        try {
          const notif = JSON.parse(evt.data);
          onNewNotificationReceived(notif);
        } catch (err) {
          console.error('[NotificationEngine] parse new notif error:', err);
        }
      });

      eventSource.addEventListener('notification:read', (evt) => {
        try {
          const data = JSON.parse(evt.data);
          syncReadStateLocally(data.notificationId, data.unreadCount);
        } catch (_) {}
      });

      eventSource.addEventListener('notification:read_all', () => {
        syncAllReadLocally();
      });

      eventSource.addEventListener('notification:delivery_ack', (evt) => {
        try {
          const data = JSON.parse(evt.data);
          onRemoteDeliveryAck(data);
        } catch (_) {}
      });

      eventSource.onerror = () => {
        isSSEConnected = false;
        updateLiveIndicator(false);
      };
    } catch (e) {
      console.warn('[NotificationEngine] SSE init failed, will use fallback:', e.message);
    }
  }

  // --- BroadcastChannel for Multi-Tab Sync ---
  function initBroadcastChannel() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        broadcastBus = new BroadcastChannel('cln_notification_bus');
        broadcastBus.onmessage = (e) => {
          const msg = e.data || {};
          if (msg.action === 'MARK_READ') {
            syncReadStateLocally(msg.id, msg.unreadCount, false);
          } else if (msg.action === 'MARK_ALL_READ') {
            syncAllReadLocally(false);
          } else if (msg.action === 'NEW_NOTIF') {
            onNewNotificationReceived(msg.notif, false); // Don't re-chime in sibling tabs
          } else if (msg.action === 'REFRESH') {
            fetchNotifications(false);
          }
        };
      } catch (_) {}
    }
  }

  // Broadcast to other open browser tabs
  function postBroadcast(action, data = {}) {
    if (broadcastBus) {
      try {
        broadcastBus.postMessage({ action, ...data });
      } catch (_) {}
    }
  }

  // --- Confirmed Delivery Acknowledgment ---
  async function acknowledgeDelivery(notifId) {
    if (!notifId) return;
    try {
      const token = getToken();
      const base = getApiBaseUrl();
      fetch(`${base}/notifications/${notifId}/delivered`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      }).catch(() => {});
    } catch (_) {}
  }

  // --- Handle New Incoming Notification ---
  function onNewNotificationReceived(notif, shouldChime = true) {
    if (!notif || !notif.id) return;

    // Check duplicate in memory
    const existingIdx = allNotifications.findIndex(n => n.id === notif.id);
    if (existingIdx !== -1) {
      allNotifications[existingIdx] = { ...allNotifications[existingIdx], ...notif };
    } else {
      allNotifications.unshift(notif);
    }

    renderNotificationCenter();
    triggerBellAnimation();

    if (shouldChime) {
      playNotificationChime(notif.priority);
      showBrowserDesktopNotification(notif);
      showWhatsAppToast(notif);
      postBroadcast('NEW_NOTIF', { notif });
    }

    // Immediately send Confirmed Delivery ack to server
    acknowledgeDelivery(notif.id);
  }

  // --- Render Notification Center Item HTML ---
  function renderNotifItemHtml(n) {
    const isRead = Boolean(n.is_read || n.isRead);
    const unreadClass = isRead ? '' : ' unread';
    const prio = (n.priority || 'normal').toLowerCase();

    // Icon selection
    let iconSvg = ICONS.clipboard;
    let iconClass = 'notif-icon-work';

    if (n.type === 'admin_announcement' || n.type === 'admin_message') {
      iconSvg = ICONS.megaphone;
      iconClass = 'notif-icon-customer';
    } else if (n.type === 'employee_submission') {
      iconSvg = ICONS.checkCircle;
      iconClass = 'notif-icon-success';
    } else if (n.type === 'customer_created') {
      iconSvg = ICONS.user;
      iconClass = 'notif-icon-customer';
    } else if (n.type === 'loan_application_submitted' || n.type === 'loan') {
      iconSvg = ICONS.coins;
      iconClass = 'notif-icon-loan';
    } else if (n.type === 'document_uploaded') {
      iconSvg = ICONS.fileText;
      iconClass = 'notif-icon-work';
    }

    if (prio === 'urgent') iconClass = 'notif-icon-urgent';

    // Priority pill
    let priorityPill = '';
    if (prio === 'urgent' || prio === 'critical') {
      priorityPill = `<span class="notif-priority-pill notif-priority-urgent">Urgent</span>`;
    } else if (prio === 'important') {
      priorityPill = `<span class="notif-priority-pill notif-priority-important">Important</span>`;
    }

    // Category / Context Tag
    let categoryTag = '';
    if (n.sender_role === 'admin') {
      categoryTag = `<span class="notif-tag" style="background:rgba(37,211,102,0.12);color:#128c7e;border:1px solid rgba(37,211,102,0.25);">Official Announcement</span>`;
    } else if (n.type === 'employee_submission') {
      categoryTag = `<span class="notif-tag" style="background:rgba(16,185,129,0.12);color:#059669;border:1px solid rgba(16,185,129,0.25);">Assigned Records Submission</span>`;
    } else if (n.type === 'customer_created') {
      categoryTag = `<span class="notif-tag" style="background:rgba(14,165,233,0.12);color:#0284c7;border:1px solid rgba(14,165,233,0.25);">New Customer</span>`;
    } else if (n.type === 'loan_application_submitted') {
      categoryTag = `<span class="notif-tag" style="background:rgba(168,85,247,0.12);color:#9333ea;border:1px solid rgba(168,85,247,0.25);">Loan Application</span>`;
    }

    const actionUrl = n.action_url || n.link_url || n.linkUrl || '';

    return `
      <div class="notif-item${unreadClass}" id="notif-card-${n.id}" onclick="CLNNotifications.handleClick(${n.id}, '${escapeHtml(actionUrl)}')">
        <div class="notif-icon-wrap ${iconClass}">${iconSvg}</div>
        <div class="notif-content">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px;">
            <div class="notif-title">${escapeHtml(n.title)}</div>
            ${priorityPill}
          </div>
          <div class="notif-body">${escapeHtml(n.message || n.body || '')}</div>
          <div class="notif-meta-bar">
            ${categoryTag}
            <span class="notif-time">${timeAgo(n.created_at || n.createdAt)}</span>
          </div>
        </div>
        <div class="notif-item-actions">
          ${!isRead ? `<button class="notif-dismiss-btn" onclick="event.stopPropagation();CLNNotifications.markOneRead(${n.id})" title="Mark read">${ICONS.check}</button>` : ''}
          <button class="notif-delete-btn" onclick="event.stopPropagation();CLNNotifications.deleteSingle(${n.id})" title="Archive notification">${ICONS.trash}</button>
        </div>
      </div>
    `;
  }

  // --- WhatsApp-Inspired Toast Card (Bottom-Right) ---
  function showWhatsAppToast(n) {
    const container = document.getElementById('cln-whatsapp-toast-container');
    if (!container) return;

    const toastId = `wa-toast-${n.id}-${Date.now()}`;
    const prio = (n.priority || 'normal').toLowerCase();
    const prioClass = prio === 'urgent' ? ' toast-urgent' : (prio === 'important' ? ' toast-important' : '');
    const senderName = n.sender_name || (n.sender_role === 'admin' ? 'Dixit Lending Admin' : 'System Alert');
    const actionUrl = n.action_url || n.link_url || n.linkUrl || '';

    const toastEl = document.createElement('div');
    toastEl.className = `cln-whatsapp-toast${prioClass}`;
    toastEl.id = toastId;
    toastEl.innerHTML = `
      <div class="wa-toast-icon-wrap">
        ${n.type === 'admin_announcement' ? ICONS.megaphone : (n.type === 'employee_submission' ? ICONS.checkCircle : ICONS.bell)}
      </div>
      <div class="wa-toast-content">
        <div class="wa-toast-header">
          <span class="wa-toast-sender">${escapeHtml(senderName)}</span>
          <span class="wa-toast-time">just now</span>
        </div>
        <div class="wa-toast-title">${escapeHtml(n.title)}</div>
        <div class="wa-toast-body">${escapeHtml(n.message || n.body || '')}</div>
        <div class="wa-toast-actions">
          ${actionUrl ? `<button class="wa-toast-btn wa-toast-btn-primary" onclick="CLNNotifications.handleClick(${n.id}, '${escapeHtml(actionUrl)}'); CLNNotifications.closeToast('${toastId}')">View Details</button>` : `<button class="wa-toast-btn wa-toast-btn-primary" onclick="CLNNotifications.markOneRead(${n.id}); CLNNotifications.closeToast('${toastId}')">Mark Read</button>`}
          <button class="wa-toast-btn wa-toast-btn-dismiss" onclick="CLNNotifications.closeToast('${toastId}')">Dismiss</button>
        </div>
      </div>
      <button class="wa-toast-close" onclick="CLNNotifications.closeToast('${toastId}')" aria-label="Close">${ICONS.x}</button>
    `;

    container.appendChild(toastEl);

    // Auto dismiss after 7.5 seconds
    setTimeout(() => {
      closeWhatsAppToast(toastId);
    }, 7500);
  }

  function closeWhatsAppToast(toastId) {
    const el = document.getElementById(toastId);
    if (!el) return;
    el.classList.add('hide');
    setTimeout(() => { el.remove(); }, 280);
  }

  // --- Ensure DOM Elements Exist in Topbar & Body ---
  function ensureDOM() {
    // 1. Toast container
    if (!document.getElementById('cln-whatsapp-toast-container')) {
      const tc = document.createElement('div');
      tc.id = 'cln-whatsapp-toast-container';
      tc.className = 'cln-whatsapp-toast-container';
      document.body.appendChild(tc);
    }

    // 2. Bell Wrap in Topbar
    let wrap = document.getElementById('notif-bell-wrap');
    if (!wrap) {
      const topbarActions = document.querySelector('.topbar-actions') || document.querySelector('.topbar');
      if (topbarActions) {
        wrap = document.createElement('div');
        wrap.className = 'notif-bell-wrap';
        wrap.id = 'notif-bell-wrap';

        const role = getUserRole();
        const composeBtnHtml = role === 'admin'
          ? `<button class="notif-header-btn compose-btn" onclick="CLNNotifications.openComposer()" title="Compose Announcement" aria-label="Compose Announcement"><span class="compose-icon-box">${ICONS.send}</span><span class="compose-btn-text">Compose</span></button>`
          : '';

        wrap.innerHTML = `
          <button class="notif-bell-btn" id="notif-bell-btn" onclick="CLNNotifications.toggleDropdown()" aria-label="Notifications" title="Notifications" tabindex="0">
            ${ICONS.bell}
            <span id="notif-bell-badge" class="notif-badge" style="display:none;">0</span>
          </button>
          <div class="notif-dropdown" id="notif-dropdown" role="region" aria-label="Notification Center">
            <div class="notif-dd-header">
              <div class="notif-dd-title-wrap">
                ${ICONS.bell}
                <h4>Notifications</h4>
                <span class="notif-realtime-pill" id="notif-live-pill"><span class="dot"></span> Live</span>
              </div>
              <div class="notif-dd-actions">
                ${composeBtnHtml}
                <button class="notif-header-btn" onclick="CLNNotifications.markAllRead()" title="Mark all read">${ICONS.checkCheck}</button>
                <button class="notif-header-btn" onclick="CLNNotifications.openPreferences()" title="Notification Settings">${ICONS.settings}</button>
              </div>
            </div>
            <div class="notif-tabs-bar">
              <button class="notif-tab-btn active" id="notif-tab-all" onclick="CLNNotifications.setTab('all')">All <span class="notif-tab-count" id="count-tab-all">0</span></button>
              <button class="notif-tab-btn" id="notif-tab-unread" onclick="CLNNotifications.setTab('unread')">Unread <span class="notif-tab-count" id="count-tab-unread">0</span></button>
              <button class="notif-tab-btn" id="notif-tab-read" onclick="CLNNotifications.setTab('read')">Read <span class="notif-tab-count" id="count-tab-read">0</span></button>
            </div>
            <div class="notif-list" id="notif-dd-list">
              <div class="notif-empty">
                <p style="font-size:13px;color:var(--text-secondary);margin:0;">Loading notifications...</p>
              </div>
            </div>
          </div>
        `;

        const themeToggle = topbarActions.querySelector('.theme-toggle');
        if (themeToggle) {
          topbarActions.insertBefore(wrap, themeToggle);
        } else {
          topbarActions.prepend(wrap);
        }
      }
    } else {
      // If already hardcoded in HTML, enhance it with live pill and tabs if missing
      const header = wrap.querySelector('.notif-dd-header');
      if (header && !wrap.querySelector('.notif-tabs-bar')) {
        const role = getUserRole();
        const composeBtnHtml = role === 'admin'
          ? `<button class="notif-header-btn compose-btn" onclick="CLNNotifications.openComposer()" title="Compose Announcement" aria-label="Compose Announcement"><span class="compose-icon-box">${ICONS.send}</span><span class="compose-btn-text">Compose</span></button>`
          : '';

        header.innerHTML = `
          <div class="notif-dd-title-wrap">
            ${ICONS.bell}
            <h4>Notifications</h4>
            <span class="notif-realtime-pill" id="notif-live-pill"><span class="dot"></span> Live</span>
          </div>
          <div class="notif-dd-actions">
            ${composeBtnHtml}
            <button class="notif-header-btn" onclick="CLNNotifications.markAllRead()" title="Mark all read">${ICONS.checkCheck}</button>
            <button class="notif-header-btn" onclick="CLNNotifications.openPreferences()" title="Notification Settings">${ICONS.settings}</button>
          </div>
        `;

        const tabsBar = document.createElement('div');
        tabsBar.className = 'notif-tabs-bar';
        tabsBar.innerHTML = `
          <button class="notif-tab-btn active" id="notif-tab-all" onclick="CLNNotifications.setTab('all')">All <span class="notif-tab-count" id="count-tab-all">0</span></button>
          <button class="notif-tab-btn" id="notif-tab-unread" onclick="CLNNotifications.setTab('unread')">Unread <span class="notif-tab-count" id="count-tab-unread">0</span></button>
          <button class="notif-tab-btn" id="notif-tab-read" onclick="CLNNotifications.setTab('read')">Read <span class="notif-tab-count" id="count-tab-read">0</span></button>
        `;
        header.insertAdjacentElement('afterend', tabsBar);
      }
    }

    // 3. Modals (Composer, Preferences, Audit)
    ensureModals();
  }

  // --- Ensure Modals (Composer, Preferences, Audit) ---
  function ensureModals() {
    if (!document.getElementById('notif-composer-modal')) {
      const comp = document.createElement('div');
      comp.className = 'notif-modal-overlay';
      comp.id = 'notif-composer-modal';
      comp.innerHTML = `
        <div class="notif-modal-card">
          <div class="notif-modal-header">
            <div class="notif-modal-header-left">
              <div class="composer-header-icon-box" aria-hidden="true">
                ${ICONS.send}
              </div>
              <div class="composer-header-text-wrap">
                <h3 class="composer-modal-title">Compose Broadcast Announcement</h3>
                <p class="composer-modal-subtitle">Send important updates and announcements directly to your employees.</p>
              </div>
            </div>
            <button class="notif-modal-close-btn" onclick="CLNNotifications.closeComposer()" aria-label="Close modal" title="Close">${ICONS.x}</button>
          </div>
          <div class="notif-modal-body">
            <div class="composer-field-group">
              <label class="composer-field-label">Target Audience</label>
              <div class="audience-selector-grid">
                <label class="audience-opt-label active" id="lbl-aud-all">
                  <input type="radio" name="ann-audience" value="all" checked onchange="CLNNotifications.onAudienceChange('all')">
                  <span>All Employees</span>
                </label>
                <label class="audience-opt-label" id="lbl-aud-selected">
                  <input type="radio" name="ann-audience" value="selected" onchange="CLNNotifications.onAudienceChange('selected')">
                  <span>Selected</span>
                </label>
                <label class="audience-opt-label" id="lbl-aud-individual">
                  <input type="radio" name="ann-audience" value="individual" onchange="CLNNotifications.onAudienceChange('individual')">
                  <span>Individual</span>
                </label>
              </div>
            </div>

            <div id="composer-emp-selection-wrap" class="composer-field-group" style="display:none;">
              <label class="composer-field-label">Recipient Employee(s)</label>
              <div id="composer-emp-list" class="composer-emp-list-container">
                <span style="font-size:12px;color:var(--text-secondary);">Loading employees...</span>
              </div>
            </div>

            <div class="composer-field-group">
              <label class="composer-field-label">Priority Level</label>
              <div class="priority-selector-bar">
                <button type="button" class="priority-pill-btn active prio-normal" id="btn-prio-normal" onclick="CLNNotifications.setPriority('normal')">Normal</button>
                <button type="button" class="priority-pill-btn prio-important" id="btn-prio-important" onclick="CLNNotifications.setPriority('important')">Important</button>
                <button type="button" class="priority-pill-btn prio-urgent" id="btn-prio-urgent" onclick="CLNNotifications.setPriority('urgent')">Urgent</button>
              </div>
            </div>

            <div class="composer-field-group">
              <label class="composer-field-label" for="composer-title">Announcement Title</label>
              <input type="text" id="composer-title" class="composer-input" placeholder="e.g. Mandatory Branch Operations Update">
            </div>

            <div class="composer-field-group">
              <label class="composer-field-label" for="composer-message">Message Body</label>
              <textarea id="composer-message" rows="3" class="composer-textarea" placeholder="Write announcement details..."></textarea>
            </div>

            <div class="composer-field-group">
              <label class="composer-field-label" for="composer-link">Action Link (Optional)</label>
              <input type="text" id="composer-link" class="composer-input" placeholder="e.g. /employee/data-excel.html">
            </div>
          </div>
          <div class="notif-modal-footer">
            <button class="composer-cancel-btn" onclick="CLNNotifications.closeComposer()">Cancel</button>
            <button class="composer-send-btn" id="btn-send-announcement" onclick="CLNNotifications.sendAnnouncement()">
              ${ICONS.send}
              <span>Send Now</span>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(comp);
    }

    // Preferences modal
    if (!document.getElementById('notif-prefs-modal')) {
      const pm = document.createElement('div');
      pm.className = 'notif-modal-overlay';
      pm.id = 'notif-prefs-modal';
      pm.innerHTML = `
        <div class="notif-modal-card" style="max-width:440px;">
          <div class="notif-modal-header">
            <h3>${ICONS.settings} Notification Preferences</h3>
            <button class="notif-modal-close-btn" onclick="CLNNotifications.closePreferences()">${ICONS.x}</button>
          </div>
          <div class="notif-modal-body">
            <div class="pref-row">
              <div class="pref-label-wrap">
                <span class="pref-title">Notification Sound</span>
                <span class="pref-desc">Play gentle chime on incoming notifications</span>
              </div>
              <label class="cln-switch">
                <input type="checkbox" id="pref-sound" onchange="CLNNotifications.savePreference('sound_enabled', this.checked)">
                <span class="cln-slider"></span>
              </label>
            </div>

            <div class="pref-row">
              <div class="pref-label-wrap">
                <span class="pref-title">Desktop Browser Alerts</span>
                <span class="pref-desc">Show notification when app is in background</span>
              </div>
              <label class="cln-switch">
                <input type="checkbox" id="pref-browser" onchange="CLNNotifications.toggleBrowserPermission(this.checked)">
                <span class="cln-slider"></span>
              </label>
            </div>

            <div class="pref-row">
              <div class="pref-label-wrap">
                <span class="pref-title">Announcement Alerts</span>
                <span class="pref-desc">WhatsApp-inspired floating toast alerts</span>
              </div>
              <label class="cln-switch">
                <input type="checkbox" id="pref-announcement" checked onchange="CLNNotifications.savePreference('announcement_alerts', this.checked)">
                <span class="cln-slider"></span>
              </label>
            </div>
          </div>
          <div class="notif-modal-footer">
            <button class="btn btn-primary" onclick="CLNNotifications.closePreferences()" style="background:#2563eb;color:#fff;">Done</button>
          </div>
        </div>
      `;
      document.body.appendChild(pm);
    }
  }

  // --- Live Status Indicator ---
  function updateLiveIndicator(isOnline) {
    const pill = document.getElementById('notif-live-pill');
    if (!pill) return;
    if (isOnline) {
      pill.className = 'notif-realtime-pill';
      pill.innerHTML = '<span class="dot"></span> Live';
    } else {
      pill.className = 'notif-realtime-pill offline';
      pill.innerHTML = '<span class="dot"></span> Reconnecting';
    }
  }

  // --- Bell Shake Animation ---
  function triggerBellAnimation() {
    const btn = document.getElementById('notif-bell-btn');
    if (!btn) return;
    btn.classList.remove('shake');
    void btn.offsetWidth;
    btn.classList.add('shake');
    setTimeout(() => btn.classList.remove('shake'), 650);
  }

  // --- Render Notification Center List & Tab Counts ---
  function renderNotificationCenter() {
    const ddList = document.getElementById('notif-dd-list');
    const badge = document.getElementById('notif-bell-badge');

    const unreadItems = allNotifications.filter(n => !n.is_read && !n.isRead);
    const readItems   = allNotifications.filter(n => n.is_read || n.isRead);

    const unreadCount = unreadItems.length;

    // Update bell badge
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
        badge.textContent = '0';
      }
    }
    lastUnreadCount = unreadCount;

    // Update tab counts
    const cAll = document.getElementById('count-tab-all');
    const cUnread = document.getElementById('count-tab-unread');
    const cRead = document.getElementById('count-tab-read');
    if (cAll) cAll.textContent = allNotifications.length;
    if (cUnread) cUnread.textContent = unreadCount;
    if (cRead) cRead.textContent = readItems.length;

    if (!ddList) return;

    let displayList = allNotifications;
    if (currentTab === 'unread') displayList = unreadItems;
    if (currentTab === 'read') displayList = readItems;

    if (displayList.length === 0) {
      const emptyMsg = currentTab === 'unread'
        ? 'No unread notifications'
        : (currentTab === 'read' ? 'No read notifications' : "You're all caught up");
      ddList.innerHTML = `
        <div class="notif-empty">
          ${ICONS.bellSlash}
          <p style="font-weight:600;margin:0 0 4px;color:var(--text-primary);">${emptyMsg}</p>
          <span style="font-size:12px;color:var(--text-secondary);">No notifications in this view.</span>
        </div>
      `;
      return;
    }

    ddList.innerHTML = displayList.map(renderNotifItemHtml).join('');
  }

  // --- Fetch Notifications from Backend ---
  async function fetchNotifications(renderLoading = true) {
    const ddList = document.getElementById('notif-dd-list');
    if (renderLoading && allNotifications.length === 0 && ddList && notifDropdownOpen) {
      ddList.innerHTML = `
        <div class="notif-empty">
          <p style="font-size:13px;color:var(--text-secondary);margin:0;">Loading notifications...</p>
        </div>`;
    }

    try {
      const token = getToken();
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/notifications?tab=all&limit=100`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });

      if (res.ok) {
        const data = await res.json();
        allNotifications = data.notifications || [];
        renderNotificationCenter();
      }
    } catch (e) {
      console.warn('[NotificationEngine] fetch error:', e.message);
    }
  }

  // --- Mark Single Notification Read ---
  async function markOneRead(id) {
    syncReadStateLocally(id);
    postBroadcast('MARK_READ', { id, unreadCount: lastUnreadCount });

    try {
      const token = getToken();
      const base = getApiBaseUrl();
      await fetch(`${base}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
    } catch (e) {
      console.warn('[NotificationEngine] markOneRead error:', e);
    }
  }

  // --- Mark All Read ---
  async function markAllRead() {
    syncAllReadLocally();
    postBroadcast('MARK_ALL_READ');

    try {
      const token = getToken();
      const base = getApiBaseUrl();
      await fetch(`${base}/notifications/mark-all-read`, {
        method: 'PATCH',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
    } catch (e) {
      console.warn('[NotificationEngine] markAllRead error:', e);
    }
  }

  // --- Local State Synchronization ---
  function syncReadStateLocally(id, unreadCount = null, render = true) {
    allNotifications = allNotifications.map(n =>
      n.id === id ? { ...n, is_read: 1, isRead: true } : n
    );
    if (render) renderNotificationCenter();
  }

  function syncAllReadLocally(render = true) {
    allNotifications = allNotifications.map(n => ({ ...n, is_read: 1, isRead: true }));
    if (render) renderNotificationCenter();
  }

  function onRemoteDeliveryAck(data) {
    console.log('[NotificationEngine] Delivery confirmed for recipient:', data.employeeName);
  }

  // --- Delete / Archive Notification ---
  async function deleteSingle(id) {
    allNotifications = allNotifications.filter(n => n.id !== id);
    renderNotificationCenter();

    try {
      const token = getToken();
      const base = getApiBaseUrl();
      await fetch(`${base}/notifications/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
    } catch (e) {
      console.warn('[NotificationEngine] delete error:', e);
    }
  }

  // --- Click to Navigate with In-Page Focus ---
  async function handleNotifClick(id, url) {
    closeDropdown();
    markOneRead(id);

    if (!url) return;

    const currentPath = window.location.pathname.toLowerCase();
    const parsedTarget = new URL(url, window.location.origin);
    const targetPath = parsedTarget.pathname.toLowerCase();

    // Check same page navigation
    if (currentPath === targetPath) {
      const params = parsedTarget.searchParams;

      // Admin data-excel handling
      if (currentPath.includes('admin/data-excel.html')) {
        const fileId = parseInt(params.get('fileId'), 10);
        if (fileId && typeof window.showAssignmentDetailModal === 'function') {
          window.showAssignmentDetailModal(fileId);
          return;
        }
      }

      // Employee data-excel handling
      if (currentPath.includes('employee/data-excel.html')) {
        const asgnId = parseInt(params.get('assignmentId'), 10);
        const recId = parseInt(params.get('recordId'), 10);
        if (asgnId && typeof window.openSheet === 'function') {
          await window.openSheet(asgnId);
          if (recId && typeof window.focusRecordInSheet === 'function') {
            setTimeout(() => window.focusRecordInSheet(recId), 250);
          }
          return;
        }
      }

      // Customers page handling
      if (currentPath.includes('customers.html')) {
        const custId = parseInt(params.get('customerId'), 10);
        if (custId && typeof window.focusCustomerInTable === 'function') {
          window.focusCustomerInTable(custId);
          return;
        }
      }

      // Loans page handling
      if (currentPath.includes('loans.html')) {
        const loanId = parseInt(params.get('loanId'), 10);
        if (loanId && typeof window.focusLoanInTable === 'function') {
          window.focusLoanInTable(loanId);
          return;
        }
      }
    }

    // Standard cross-page navigation
    window.location.href = url;
  }

  // --- Dropdown Toggling ---
  function toggleDropdown() {
    const dd = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-bell-btn');
    notifDropdownOpen = !notifDropdownOpen;
    dd?.classList.toggle('open', notifDropdownOpen);
    btn?.classList.toggle('active', notifDropdownOpen);
    if (notifDropdownOpen) {
      fetchNotifications(false);
    }
  }

  function closeDropdown() {
    const dd = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-bell-btn');
    dd?.classList.remove('open');
    btn?.classList.remove('active');
    notifDropdownOpen = false;
  }

  function setTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.notif-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`notif-tab-${tab}`)?.classList.add('active');
    renderNotificationCenter();
  }

  // --- Admin Announcement Composer ---
  let selectedAudience = 'all';
  let selectedPriority = 'normal';

  function openComposer() {
    closeDropdown();
    const modal = document.getElementById('notif-composer-modal');
    if (!modal) return;
    modal.classList.add('show');
    loadEligibleEmployeesForComposer();
  }

  function closeComposer() {
    document.getElementById('notif-composer-modal')?.classList.remove('show');
  }

  function onAudienceChange(aud) {
    selectedAudience = aud;
    document.querySelectorAll('.audience-opt-label').forEach(l => l.classList.remove('active'));
    document.getElementById(`lbl-aud-${aud}`)?.classList.add('active');

    const empWrap = document.getElementById('composer-emp-selection-wrap');
    if (empWrap) {
      empWrap.style.display = (aud === 'all') ? 'none' : 'block';
    }
  }

  function setPriority(prio) {
    selectedPriority = prio;
    document.querySelectorAll('.priority-pill-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-prio-${prio}`)?.classList.add('active');
  }

  async function loadEligibleEmployeesForComposer() {
    const container = document.getElementById('composer-emp-list');
    if (!container) return;

    try {
      const token = getToken();
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/notifications/recipients/employees`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const emps = data.employees || [];
        if (emps.length === 0) {
          container.innerHTML = '<span style="font-size:12px;color:var(--text-secondary);">No active employees found.</span>';
          return;
        }
        container.innerHTML = emps.map(e => `
          <label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12.5px;cursor:pointer;">
            <input type="checkbox" class="composer-emp-chk" value="${e.id}">
            <span><strong>${escapeHtml(e.name)}</strong> (${escapeHtml(e.email)})</span>
          </label>
        `).join('');
      }
    } catch (_) {}
  }

  async function sendAnnouncement() {
    const title = document.getElementById('composer-title')?.value || '';
    const message = document.getElementById('composer-message')?.value || '';
    const actionUrl = document.getElementById('composer-link')?.value || '';

    if (!title.trim() || !message.trim()) {
      alert('Please enter both announcement title and message body.');
      return;
    }

    const selectedEmployeeIds = [];
    if (selectedAudience !== 'all') {
      document.querySelectorAll('.composer-emp-chk:checked').forEach(chk => {
        selectedEmployeeIds.push(Number(chk.value));
      });
      if (selectedEmployeeIds.length === 0) {
        alert('Please select at least one employee recipient.');
        return;
      }
    }

    const sendBtn = document.getElementById('btn-send-announcement');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = `<span>Dispatching...</span>`;
    }

    try {
      const token = getToken();
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/notifications/announcements`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          priority: selectedPriority,
          actionUrl: actionUrl.trim() || null,
          audience: selectedAudience,
          employeeIds: selectedEmployeeIds
        })
      });

      if (res.ok) {
        const data = await res.json();
        closeComposer();
        // Reset form
        document.getElementById('composer-title').value = '';
        document.getElementById('composer-message').value = '';
        document.getElementById('composer-link').value = '';

        // Show confirmation toast
        showWhatsAppToast({
          id: data.notificationId || Date.now(),
          title: 'Announcement Dispatched',
          message: data.message || `Dispatched to ${data.recipientCount} employee(s). Confirmed delivery tracking active.`,
          priority: selectedPriority,
          sender_name: 'Dixit Lending Admin',
          sender_role: 'admin',
          type: 'admin_announcement'
        });
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Failed to dispatch announcement.');
      }
    } catch (e) {
      alert('Network error while dispatching announcement.');
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `${ICONS.send} <span>Send Now</span>`;
      }
    }
  }

  // --- Notification Preferences ---
  function openPreferences() {
    closeDropdown();
    const modal = document.getElementById('notif-prefs-modal');
    if (!modal) return;
    modal.classList.add('show');

    // Populate checkboxes
    const soundChk = document.getElementById('pref-sound');
    const browserChk = document.getElementById('pref-browser');
    const annChk = document.getElementById('pref-announcement');

    if (soundChk) soundChk.checked = Boolean(activePreferences.sound_enabled);
    if (browserChk) browserChk.checked = Boolean(activePreferences.browser_notifications_enabled);
    if (annChk) annChk.checked = Boolean(activePreferences.announcement_alerts);
  }

  function closePreferences() {
    document.getElementById('notif-prefs-modal')?.classList.remove('show');
  }

  async function loadPreferences() {
    try {
      const token = getToken();
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/notifications/preferences`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.preferences) {
          activePreferences = { ...activePreferences, ...data.preferences };
        }
      }
    } catch (_) {}
  }

  async function savePreference(key, value) {
    activePreferences[key] = value ? 1 : 0;
    try {
      const token = getToken();
      const base = getApiBaseUrl();
      await fetch(`${base}/notifications/preferences`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(activePreferences)
      });
    } catch (_) {}
  }

  async function toggleBrowserPermission(enable) {
    if (enable && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        savePreference('browser_notifications_enabled', 1);
      } else {
        document.getElementById('pref-browser').checked = false;
        savePreference('browser_notifications_enabled', 0);
      }
    } else {
      savePreference('browser_notifications_enabled', 0);
    }
  }

  // --- Periodic Smart Polling Fallback (Every 18s) ---
  function setupPollingFallback() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(() => {
      // If SSE is connected, light unread check; if disconnected, full fetch
      if (!isSSEConnected) {
        fetchNotifications(false);
      }
    }, 18000);

    // Refresh on tab focus & visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications(false);
      }
    });

    window.addEventListener('focus', () => {
      fetchNotifications(false);
    });
  }

  // --- Main Init ---
  function init() {
    if (isInitialized) return;

    ensureDOM();
    loadPreferences();
    fetchNotifications(true);
    connectRealtimeStream();
    initBroadcastChannel();
    setupPollingFallback();

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!document.getElementById('notif-bell-wrap')?.contains(e.target)) {
        closeDropdown();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (notifDropdownOpen) closeDropdown();
        closeComposer();
        closePreferences();
      }
    });

    // Accessibility on bell button
    document.getElementById('notif-bell-btn')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleDropdown();
      }
    });

    isInitialized = true;
    console.log('[CLNNotifications] Centralized Real-Time Notification Engine initialized.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  // Public Interface
  const CLNNotifications = {
    init,
    load: fetchNotifications,
    render: renderNotificationCenter,
    toggleDropdown,
    closeDropdown,
    setTab,
    switchTab: setTab,
    handleClick: handleNotifClick,
    markOneRead,
    markAllRead,
    deleteSingle,
    closeToast: closeWhatsAppToast,
    openComposer,
    closeComposer,
    onAudienceChange,
    setPriority,
    sendAnnouncement,
    openPreferences,
    closePreferences,
    savePreference,
    toggleBrowserPermission,
    getNotifications: () => allNotifications,
    getUnreadCount: () => allNotifications.filter(n => !n.is_read && !n.isRead).length
  };

  window.CLNNotifications = CLNNotifications;

  // Backward compatibility global aliases
  window.toggleNotifDropdown = toggleDropdown;
  window.closeNotifDropdown = closeDropdown;
  window.markAllRead = markAllRead;
  window.loadNotifications = fetchNotifications;
  window.renderNotifications = renderNotificationCenter;
  window.handleNotifClick = handleNotifClick;
  window.markOneRead = markOneRead;
  window.deleteSingleNotif = deleteSingle;
  window.showNotifToast = (msg) => showWhatsAppToast({ id: Date.now(), title: 'Alert', message: msg, priority: 'normal' });

})(window);
