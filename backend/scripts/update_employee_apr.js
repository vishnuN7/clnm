const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/employee/apr.html');
let content = fs.readFileSync(filePath, 'utf8');

// Ensure normalized \n for manipulation
const isCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

// 1. Add Card 4 HTML after Card 3
const card3EndTarget = `              <tbody id="history-tbody">
                <!-- Dynamically populated or filled with empty/loading state -->
              </tbody>
            </table>
          </div>
        </section>`;

const card4Html = `              <tbody id="history-tbody">
                <!-- Dynamically populated or filled with empty/loading state -->
              </tbody>
            </table>
          </div>
        </section>

        <!-- ═══════════════════════════════════════════════════════════ -->
        <!-- CARD 4: Attendance & Working Hours History                  -->
        <!-- ═══════════════════════════════════════════════════════════ -->
        <section class="apr-section-card" id="section-attendance-history" aria-label="Attendance Records History">
          <div class="apr-section-header">
            <div class="apr-header-info">
              <div class="apr-header-icon" style="background:rgba(16, 185, 129, 0.12); color:#10b981;">
                <!-- Calendar / Attendance history icon -->
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div>
                <h3 class="apr-section-title">Attendance & Working Hours History</h3>
                <p class="apr-section-subtitle">Permanent server-verified attendance and shift records</p>
              </div>
            </div>
            <div class="history-card-header-actions" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <div class="apr-timeline-filter-group">
                <select id="att-history-range" class="apr-select" onchange="loadAttendanceHistory()" style="padding:6px 12px; border-radius:8px; border:1px solid var(--border); background:var(--bg-card); color:var(--text-primary); font-size:13px; font-weight:500;">
                  <option value="last7" selected>Last 7 Days</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last30">Last 30 Days</option>
                  <option value="thisMonth">This Month</option>
                </select>
              </div>
              <button type="button" class="btn-history-refresh" id="btn-refresh-att-history" onclick="refreshAttendanceHistory()" title="Refresh Attendance History">
                <svg id="att-history-refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/></svg>
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <!-- Table Container -->
          <div class="table-scroll-wrapper" id="att-history-table-container">
            <table class="apr-data-table" aria-label="Attendance Records History Table">
              <thead>
                <tr>
                  <th scope="col">Work Date</th>
                  <th scope="col">First Clock-In</th>
                  <th scope="col">Last Clock-Out</th>
                  <th scope="col">Working Hours</th>
                  <th scope="col">Breaks Taken</th>
                  <th scope="col">Overtime</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody id="att-history-tbody">
              </tbody>
            </table>
          </div>
        </section>`;

if (!content.includes(card3EndTarget)) {
  console.error('card3EndTarget not found!');
  process.exit(1);
}

content = content.replace(card3EndTarget, card4Html);

// 2. Update initEmployeeAPR, setupTimers, event listeners
const oldInit = `    // Initial data load
    loadDashboard();
    loadBreakHistory();

    // Setup live timers
    setupTimers();

    // Setup visibility & focus synchronization
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        loadDashboard({ silent: true });
        loadBreakHistory({ silent: true });
      }
    });

    window.addEventListener('focus', () => {
      loadDashboard({ silent: true });
    });`;

const newInit = `    // Initial data load
    loadDashboard();
    loadBreakHistory();
    loadAttendanceHistory();

    // Setup live timers
    setupTimers();

    // Setup visibility & focus synchronization
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        loadDashboard({ silent: true });
        loadBreakHistory({ silent: true });
        loadAttendanceHistory({ silent: true });
      }
    });

    window.addEventListener('focus', () => {
      loadDashboard({ silent: true });
      loadAttendanceHistory({ silent: true });
    });`;

if (!content.includes(oldInit)) {
  console.error('oldInit not found!');
  process.exit(1);
}

content = content.replace(oldInit, newInit);

// 3. Update break click handlers to also refresh attendance history
content = content.replace(
  'await Promise.all([loadDashboard(), loadBreakHistory()]);',
  'await Promise.all([loadDashboard(), loadBreakHistory(), loadAttendanceHistory({ silent: true })]);'
);
content = content.replace(
  'await Promise.all([loadDashboard(), loadBreakHistory()]);',
  'await Promise.all([loadDashboard(), loadBreakHistory(), loadAttendanceHistory({ silent: true })]);'
);

// 4. Add loadAttendanceHistory and helper functions before refreshBreakHistory
const refreshBreakTarget = `  async function refreshBreakHistory() {
    const icon = document.getElementById('history-refresh-icon');
    if (icon) icon.classList.add('spin-animation');
    await loadBreakHistory();
    if (icon) {
      setTimeout(() => { icon.classList.remove('spin-animation'); }, 600);
    }
  }`;

const attHistoryJs = `  async function refreshBreakHistory() {
    const icon = document.getElementById('history-refresh-icon');
    if (icon) icon.classList.add('spin-animation');
    await loadBreakHistory();
    if (icon) {
      setTimeout(() => { icon.classList.remove('spin-animation'); }, 600);
    }
  }

  // ── Attendance Records History Loader & Renderer ─────────────────────
  let attendanceHistoryData = [];

  async function loadAttendanceHistory(options = {}) {
    const tbody = document.getElementById('att-history-tbody');
    if (!tbody) return;

    if (!options.silent && (!attendanceHistoryData || attendanceHistoryData.length === 0)) {
      tbody.innerHTML = \`
        <tr>
          <td colspan="7" style="padding: 24px; text-align: center;">
            <div class="apr-loading-skeleton">
              <div class="skeleton-bar" style="width:100%;"></div>
              <div class="skeleton-bar" style="width:85%;"></div>
            </div>
          </td>
        </tr>
      \`;
    }

    const range = document.getElementById('att-history-range')?.value || 'last7';

    try {
      const res = await api.get(\`/apr/employee/attendance/history?dateRange=\${encodeURIComponent(range)}\`);
      if (!res?.ok) {
        if (!attendanceHistoryData || attendanceHistoryData.length === 0) {
          showAttendanceHistoryErrorState();
        }
        return;
      }

      attendanceHistoryData = res.data.data || [];
      renderAttendanceHistoryRows(attendanceHistoryData);
    } catch (err) {
      console.error('[Employee APR] loadAttendanceHistory error:', err);
      if (!attendanceHistoryData || attendanceHistoryData.length === 0) {
        showAttendanceHistoryErrorState();
      }
    }
  }

  function renderAttendanceHistoryRows(records) {
    const tbody = document.getElementById('att-history-tbody');
    if (!tbody) return;

    if (!records || records.length === 0) {
      tbody.innerHTML = \`
        <tr>
          <td colspan="7" style="padding: 0;">
            <div class="apr-empty-state-box">
              <div class="apr-empty-icon-circle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <h4 class="apr-empty-heading">No attendance records found</h4>
              <p class="apr-empty-text">Your permanent server attendance records will appear here.</p>
            </div>
          </td>
        </tr>
      \`;
      return;
    }

    tbody.innerHTML = records.map(r => {
      const dateStr = safeFormatDate(r.work_date);
      const firstLoginStr = safeFormatTime(r.first_login);
      const lastLogoutStr = r.last_logout ? safeFormatTime(r.last_logout) : (r.status === 'Working' ? '<span style="color:#10b981;font-weight:700;">In Progress</span>' : '—');
      const workHoursStr = r.working_hours_human || \`\${r.working_hours}h\`;
      const breaksStr = r.total_breaks > 0 ? \`\${r.total_breaks} (\${r.break_human})\` : 'None';
      const overtimeStr = r.overtime > 0 ? \`<span style="color:#10b981;font-weight:700;">\${r.overtime_human}</span>\` : '—';

      let statusBadge = '<span class="status-pill working"><span class="status-pill-dot"></span> Working</span>';
      if (r.status === 'Completed') {
        statusBadge = '<span class="status-pill logged-out"><span class="status-pill-dot"></span> Completed</span>';
      } else if (r.status === 'Late') {
        statusBadge = '<span class="status-pill" style="background:rgba(234, 88, 12, 0.12); color:#ea580c;"><span class="status-pill-dot" style="background:#ea580c;"></span> Late</span>';
      } else if (r.status === 'Present') {
        statusBadge = '<span class="status-pill working"><span class="status-pill-dot"></span> Present</span>';
      }

      return \`
        <tr>
          <td><span style="font-weight:600;">\${dateStr}</span></td>
          <td>\${firstLoginStr}</td>
          <td>\${lastLogoutStr}</td>
          <td><strong>\${workHoursStr}</strong></td>
          <td>\${breaksStr}</td>
          <td>\${overtimeStr}</td>
          <td>\${statusBadge}</td>
        </tr>
      \`;
    }).join('');
  }

  function showAttendanceHistoryErrorState() {
    const tbody = document.getElementById('att-history-tbody');
    if (!tbody) return;
    tbody.innerHTML = \`
      <tr>
        <td colspan="7" style="padding: 0;">
          <div class="apr-error-state-box">
            <div class="apr-error-icon-circle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <p class="apr-error-text">Unable to load attendance history.</p>
            <button type="button" class="btn-apr-retry" onclick="loadAttendanceHistory()">
              \${ICONS.refresh}
              <span>Retry</span>
            </button>
          </div>
        </td>
      </tr>
    \`;
  }

  async function refreshAttendanceHistory() {
    const icon = document.getElementById('att-history-refresh-icon');
    if (icon) icon.classList.add('spin-animation');
    await loadAttendanceHistory();
    if (icon) {
      setTimeout(() => { icon.classList.remove('spin-animation'); }, 600);
    }
  }`;

if (!content.includes(refreshBreakTarget)) {
  console.error('refreshBreakTarget not found!');
  process.exit(1);
}

content = content.replace(refreshBreakTarget, attHistoryJs);

// Restore CRLF if original was CRLF
if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated frontend/employee/apr.html!');
process.exit(0);
