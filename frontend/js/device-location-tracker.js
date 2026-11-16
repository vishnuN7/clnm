/**
 * Dixit Lending Solution — Device Location & Login Tracker
 * Client-side employee location capture with institutional pre-prompt modal,
 * error handling, single-session capture enforcement, and manual retry.
 */
(function() {
  'use strict';

  const MODAL_ID = 'cln-location-modal';
  const TOAST_ID = 'cln-location-toast';

  function getCurrentUser() {
    try {
      const stored = sessionStorage.getItem('cln_user') || localStorage.getItem('cln_user');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  // Build the backend URL. On localhost the backend serves this page, so a relative
  // path works. In production the frontend (Netlify) and backend (Render) are on
  // different hosts, so we must use API_BASE from api.js (which already ends in /api).
  function apiUrl(path) {
    if (typeof API_BASE !== 'undefined' && API_BASE) {
      return String(API_BASE).replace(/\/$/, '') + path;
    }
    if (window.__CLN_API_BASE__) {
      return String(window.__CLN_API_BASE__).replace(/\/$/, '') + '/api' + path;
    }
    return '/api' + path;
  }

  function getAuthToken() {
    return sessionStorage.getItem('cln_token') || localStorage.getItem('cln_token') || '';
  }

  function getSessionId() {
    return sessionStorage.getItem('cln_session_id') || localStorage.getItem('cln_session_id') || '';
  }

  function getActivityId() {
    const raw = sessionStorage.getItem('cln_activity_id') || localStorage.getItem('cln_activity_id');
    return raw ? parseInt(raw, 10) : null;
  }

  function showToast(message, type = 'info') {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 100000;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        opacity: 0;
        transform: translateY(12px);
      `;
      document.body.appendChild(toast);
    }

    const isSuccess = type === 'success';
    const isError = type === 'error';
    toast.style.background = isSuccess ? '#059669' : (isError ? '#dc2626' : '#2563eb');
    toast.style.color = '#ffffff';
    toast.innerHTML = `
      <i class="fas ${isSuccess ? 'fa-check-circle' : (isError ? 'fa-exclamation-circle' : 'fa-info-circle')}"></i>
      <span>${escapeHtml(message)}</span>
    `;

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
    }, 4500);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  async function postLocationData(payload) {
    const token = getAuthToken();
    if (!token) return { success: false, message: 'Unauthenticated' };

    // The backend's allowed capture_status values use 'permission_denied';
    // 'denied' would be silently stored as 'pending'.
    if (payload && payload.capture_status === 'denied') {
      payload = { ...payload, capture_status: 'permission_denied' };
    }

    try {
      const res = await fetch(apiUrl('/login-activity/record-location'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.warn('[LocationTracker] Failed to send location record:', err);
      return { success: false, message: err.message };
    }
  }

  function removeModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.style.opacity = '0';
      setTimeout(() => {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
      }, 300);
    }
  }

  function showPermissionModal(onAllow, onDismiss) {
    if (document.getElementById(MODAL_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(10, 17, 26, 0.72);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      opacity: 0;
      transition: opacity 0.25s ease;
    `;

    overlay.innerHTML = `
      <div class="cln-loc-dialog" style="
        background: #ffffff;
        color: #1e293b;
        max-width: 480px;
        width: 100%;
        border-radius: 16px;
        padding: 28px 26px;
        box-shadow: 0 24px 48px rgba(0,0,0,0.28);
        border: 1px solid rgba(226, 232, 240, 0.9);
        position: relative;
        text-align: center;
        font-family: inherit;
        animation: clnModalPop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      ">
        <style>
          @keyframes clnModalPop {
            0% { transform: scale(0.92); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
          :root[data-theme='dark'] .cln-loc-dialog {
            background: #101721 !important;
            color: #f1f5f9 !important;
            border-color: rgba(123, 192, 67, 0.2) !important;
            box-shadow: 0 24px 48px rgba(0,0,0,0.5) !important;
          }
          :root[data-theme='dark'] .cln-loc-text-muted {
            color: #94a3b8 !important;
          }
        </style>

        <div style="
          width: 58px;
          height: 58px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(16, 185, 129, 0.15));
          color: #0284c7;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          margin-bottom: 18px;
        ">
          <i class="fas fa-location-dot"></i>
        </div>

        <div style="
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          background: rgba(16, 185, 129, 0.12);
          color: #059669;
          margin-bottom: 12px;
        ">
          <i class="fas fa-shield-alt"></i> Workplace Authentication
        </div>

        <h3 style="font-size: 20px; font-weight: 700; margin: 0 0 10px; line-height: 1.3;">
          Location Verification Required
        </h3>

        <p class="cln-loc-text-muted" style="font-size: 13.5px; line-height: 1.55; color: #64748b; margin: 0 0 22px;">
          To verify workplace login authenticity and protect client records, Dixit Lending Solution captures your approximate device coordinates.
          <br><br>
          <span style="font-size: 12.5px; font-weight: 600; color: #0284c7;">
            <i class="fas fa-info-circle"></i> Captured once upon sign-in. Background tracking is disabled.
          </span>
        </p>

        <div id="cln-loc-btn-group" style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          <button id="cln-loc-allow-btn" style="
            flex: 1 1 180px;
            padding: 12px 20px;
            background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
            color: #ffffff;
            border: none;
            border-radius: 10px;
            font-size: 13.5px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s ease;
          ">
            <i class="fas fa-check"></i>
            <span>Allow Location Access</span>
          </button>

          <button id="cln-loc-skip-btn" style="
            flex: 1 1 120px;
            padding: 12px 18px;
            background: transparent;
            color: #64748b;
            border: 1px solid rgba(148, 163, 184, 0.4);
            border-radius: 10px;
            font-size: 13.5px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
          ">
            Not Now
          </button>
        </div>

        <div id="cln-loc-loading" style="display: none; padding-top: 10px;">
          <div style="display: inline-flex; align-items: center; gap: 10px; font-size: 13.5px; font-weight: 600; color: #0284c7;">
            <i class="fas fa-spinner fa-spin" style="font-size: 18px;"></i>
            <span>Verifying device coordinates...</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });

    const allowBtn = document.getElementById('cln-loc-allow-btn');
    const skipBtn = document.getElementById('cln-loc-skip-btn');
    const btnGroup = document.getElementById('cln-loc-btn-group');
    const loading = document.getElementById('cln-loc-loading');

    allowBtn.addEventListener('click', () => {
      btnGroup.style.display = 'none';
      loading.style.display = 'block';
      if (typeof onAllow === 'function') onAllow();
    });

    skipBtn.addEventListener('click', () => {
      removeModal();
      if (typeof onDismiss === 'function') onDismiss();
    });
  }

  async function executeCapture(isManualRetry = false) {
    const sessionId = getSessionId();
    const activityId = getActivityId();

    if (!('geolocation' in navigator)) {
      await postLocationData({
        activity_id: activityId,
        session_id: sessionId,
        permission_status: 'denied',
        capture_status: 'unavailable',
        error_message: 'Geolocation API not supported by browser'
      });
      showToast('Geolocation is not supported by your browser.', 'error');
      notifyLocationUpdate({
        permission_status: 'denied',
        capture_status: 'unavailable'
      });
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const res = await postLocationData({
          activity_id: activityId,
          session_id: sessionId,
          latitude,
          longitude,
          accuracy,
          permission_status: 'granted',
          capture_status: 'captured'
        });

        // Only report success if the server actually saved the location
        if (!res || !res.success) {
          removeModal();
          showToast('Could not save your location. Please check your connection and retry.', 'error');
          notifyLocationUpdate({ permission_status: 'granted', capture_status: 'error' });
          return;
        }

        if (sessionId) {
          sessionStorage.setItem('cln_loc_captured_' + sessionId, 'true');
        }

        removeModal();
        showToast(
          isManualRetry ? 'Location updated successfully!' : 'Login location verified.',
          'success'
        );

        notifyLocationUpdate({
          permission_status: 'granted',
          capture_status: 'captured',
          latitude,
          longitude,
          accuracy,
          captured_at: new Date().toISOString()
        });
      },
      async (err) => {
        console.warn('[LocationTracker] Geolocation error:', err);
        let permStatus = 'denied';
        let capStatus = 'denied';

        if (err.code === err.PERMISSION_DENIED) {
          permStatus = 'denied';
          capStatus = 'denied';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          permStatus = 'granted';
          capStatus = 'unavailable';
        } else if (err.code === err.TIMEOUT) {
          permStatus = 'prompt';
          capStatus = 'timeout';
        }

        await postLocationData({
          activity_id: activityId,
          session_id: sessionId,
          permission_status: permStatus,
          capture_status: capStatus,
          error_message: err.message || 'Capture failed'
        });

        if (sessionId) {
          sessionStorage.setItem('cln_loc_captured_' + sessionId, 'attempted');
        }

        removeModal();

        const errorMsg = err.code === err.PERMISSION_DENIED
          ? 'Location access was denied. You can enable it in browser settings.'
          : (err.code === err.TIMEOUT ? 'Location request timed out. Please retry.' : 'Location unavailable.');

        showToast(errorMsg, err.code === err.PERMISSION_DENIED ? 'error' : 'info');

        notifyLocationUpdate({
          permission_status: permStatus,
          capture_status: capStatus,
          error_message: err.message
        });
      },
      options
    );
  }

  function notifyLocationUpdate(detail) {
    try {
      window.dispatchEvent(new CustomEvent('cln:location_updated', { detail }));
    } catch (e) {}
  }

  async function checkAndPrompt() {
    const user = getCurrentUser();
    if (!user || user.role !== 'employee') {
      // Location tracking strictly applies to employees
      return;
    }

    const sessionId = getSessionId();
    if (sessionId && sessionStorage.getItem('cln_loc_captured_' + sessionId) === 'true') {
      // Already captured for this session
      return;
    }

    // Check permission state if permissions API is available
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state === 'granted') {
          // Already granted: proceed silently without interrupting user
          executeCapture(false);
          return;
        } else if (status.state === 'denied') {
          // Already denied: record once and do not nag
          if (sessionId && !sessionStorage.getItem('cln_loc_captured_' + sessionId)) {
            sessionStorage.setItem('cln_loc_captured_' + sessionId, 'denied');
            const activityId = getActivityId();
            await postLocationData({
              activity_id: activityId,
              session_id: sessionId,
              permission_status: 'denied',
              capture_status: 'denied',
              error_message: 'Permission denied in browser preferences'
            });
            notifyLocationUpdate({
              permission_status: 'denied',
              capture_status: 'denied'
            });
          }
          return;
        }
      } catch (err) {
        // Fallback to showing explanation modal
      }
    }

    // Permission state is 'prompt' or unsupported: display our branded explanation dialog
    showPermissionModal(
      () => {
        executeCapture(false);
      },
      async () => {
        // User clicked "Not Now"
        const sessionId = getSessionId();
        const activityId = getActivityId();
        if (sessionId) {
          sessionStorage.setItem('cln_loc_captured_' + sessionId, 'dismissed');
        }
        await postLocationData({
          activity_id: activityId,
          session_id: sessionId,
          permission_status: 'prompt',
          capture_status: 'denied',
          error_message: 'Employee dismissed location prompt'
        });
        notifyLocationUpdate({
          permission_status: 'prompt',
          capture_status: 'denied'
        });
      }
    );
  }

  // Public API
  window.DeviceLocationTracker = {
    init: function() {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => checkAndPrompt());
      } else {
        setTimeout(checkAndPrompt, 400);
      }
    },
    retryCapture: function() {
      executeCapture(true);
    },
    fetchMyStatus: async function() {
      const token = getAuthToken();
      if (!token) return null;
      try {
        const res = await fetch(apiUrl('/login-activity/my-status'), {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.status) {
          notifyLocationUpdate(data.status);
          return data.status;
        }
      } catch (err) {
        console.warn('[LocationTracker] Failed to fetch status:', err);
      }
      return null;
    }
  };

  // Auto-initialize
  window.DeviceLocationTracker.init();
})();