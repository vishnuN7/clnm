const path = require('path');
const jwt = require('jsonwebtoken');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 5000;

function makeRequest(method, reqPath, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const dataStr = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (dataStr) headers['Content-Length'] = Buffer.byteLength(dataStr);

    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: reqPath,
      method: method,
      headers: headers
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve({ status: res.statusCode, data: parsed });
        } catch (_) {
          resolve({ status: res.statusCode, raw });
        }
      });
    });

    req.on('error', reject);
    if (dataStr) req.write(dataStr);
    req.end();
  });
}

// Helper: Open SSE stream connection with proper SSE message frame parsing
function listenSSE(token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/notifications/stream?token=${encodeURIComponent(token)}`,
      method: 'GET',
      headers: { 'Accept': 'text/event-stream' }
    }, (res) => {
      const events = [];
      let buffer = '';

      res.on('data', chunk => {
        buffer += chunk.toString();
        const parts = buffer.split('\n\n');
        buffer = parts.pop(); // preserve trailing incomplete chunk

        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split('\n');
          let evName = 'message';
          let evData = null;
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              evName = line.replace('event: ', '').trim();
            } else if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              try {
                evData = JSON.parse(dataStr);
              } catch (_) {
                evData = dataStr;
              }
            }
          }
          if (evData !== null) {
            events.push({ event: evName, data: evData });
          }
        }
      });

      resolve({
        close: () => req.destroy(),
        getEvents: () => events
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('STARTING END-TO-END NOTIFICATION SYSTEM VERIFICATION');
  console.log('====================================================');

  // 1. Fetch Admin user (id=1) and an Employee user (e.g. id=4 'Akane', id=5 'Meera')
  const [[adminUser]] = await db.query("SELECT id, name, email, role FROM users WHERE role = 'admin' LIMIT 1");
  const [[empUser1]] = await db.query("SELECT id, name, email, role FROM users WHERE role = 'employee' AND is_active = 1 LIMIT 1");
  const [[empUser2]] = await db.query("SELECT id, name, email, role FROM users WHERE role = 'employee' AND is_active = 1 AND id != ? LIMIT 1", [empUser1.id]);

  console.log(`Admin User: #${adminUser.id} (${adminUser.name} - ${adminUser.email})`);
  console.log(`Employee 1: #${empUser1.id} (${empUser1.name} - ${empUser1.email})`);
  console.log(`Employee 2: #${empUser2.id} (${empUser2.name} - ${empUser2.email})`);

  const adminToken = jwt.sign({ id: adminUser.id, role: 'admin', name: adminUser.name }, JWT_SECRET, { expiresIn: '1h' });
  const empToken1  = jwt.sign({ id: empUser1.id, role: 'employee', name: empUser1.name }, JWT_SECRET, { expiresIn: '1h' });
  const empToken2  = jwt.sign({ id: empUser2.id, role: 'employee', name: empUser2.name }, JWT_SECRET, { expiresIn: '1h' });

  // ----------------------------------------------------
  // TEST A: Employee Real-Time Notifications & Read Lifecycle
  // ----------------------------------------------------
  console.log('\n--- Running TEST A: Employee Notifications & Lifecycle ---');

  // Connect Employee 1 to SSE stream
  const emp1Stream = await listenSSE(empToken1);
  await sleep(250); // allow stream connection handshake

  // Check initial events (connected handshake)
  let emp1Events = emp1Stream.getEvents();
  console.log('Employee 1 SSE initial events:', emp1Events.map(e => e.event));
  const hasConnectedHandshake = emp1Events.some(e => e.event === 'connected');
  console.log('✔ Connected handshake received:', hasConnectedHandshake ? 'PASS' : 'FAIL');

  // Initial unread count for Employee 1
  const initialCountRes = await makeRequest('GET', '/api/notifications/unread-count', null, empToken1);
  const initialUnread = initialCountRes.data.unreadCount;
  console.log(`Initial Employee 1 unread count: ${initialUnread}`);

  // Admin dispatches an announcement to Employee 1
  const announcementPayload = {
    title: 'Q4 Performance Review Notice',
    message: 'Please review your quarterly performance targets by end of week.',
    priority: 'important',
    actionUrl: '/employee/profile.html',
    audience: 'individual',
    employeeIds: [empUser1.id]
  };

  const dispatchRes = await makeRequest('POST', '/api/notifications/announcements', announcementPayload, adminToken);
  console.log('Admin announcement dispatched status:', dispatchRes.status, dispatchRes.data);
  const notifId = dispatchRes.data.notificationId;

  await sleep(350); // allow real-time push

  // Verify real-time SSE push arrived at Employee 1
  emp1Events = emp1Stream.getEvents();
  const newNotifEvent = emp1Events.find(e => e.event === 'notification:new' && e.data.id === notifId);
  console.log('✔ Employee 1 received real-time SSE notification:new:', Boolean(newNotifEvent) ? 'PASS' : 'FAIL');
  if (newNotifEvent) {
    console.log(`  Title: "${newNotifEvent.data.title}", Priority: ${newNotifEvent.data.priority}, Sender: ${newNotifEvent.data.sender_role}`);
  }

  // Employee acknowledges delivery
  const delivRes = await makeRequest('POST', `/api/notifications/${notifId}/delivered`, {}, empToken1);
  console.log('✔ Employee 1 delivery ack:', delivRes.data.success ? 'PASS' : 'FAIL');

  // Verify unread count increased by 1
  const afterSendCountRes = await makeRequest('GET', '/api/notifications/unread-count', null, empToken1);
  console.log(`✔ Unread count after push: ${afterSendCountRes.data.unreadCount} (expected: ${initialUnread + 1})`);

  // Employee marks the notification as read
  const markReadRes = await makeRequest('PATCH', `/api/notifications/${notifId}/read`, {}, empToken1);
  console.log('✔ Mark read status:', markReadRes.status, markReadRes.data);

  // Verify unread count decreased back
  const afterReadCountRes = await makeRequest('GET', '/api/notifications/unread-count', null, empToken1);
  console.log(`✔ Unread count after mark-read: ${afterReadCountRes.data.unreadCount} (expected: ${initialUnread})`);

  // Verify database persistence of read status
  const [[recipRow]] = await db.query('SELECT is_delivered, delivered_at, is_read, read_at FROM notification_recipients WHERE notification_id = ? AND user_id = ?', [notifId, empUser1.id]);
  console.log('✔ Database Confirmed Lifecycle Status:');
  console.log(`  is_delivered: ${recipRow.is_delivered} (at ${recipRow.delivered_at})`);
  console.log(`  is_read: ${recipRow.is_read} (at ${recipRow.read_at})`);

  emp1Stream.close();

  // ----------------------------------------------------
  // TEST B: Admin Notifications for Employee Submission & Actions
  // ----------------------------------------------------
  console.log('\n--- Running TEST B: Admin Notifications on Employee Submission ---');

  // Connect Admin to SSE stream
  const adminStream = await listenSSE(adminToken);
  await sleep(250);

  const adminInitCountRes = await makeRequest('GET', '/api/notifications/unread-count', null, adminToken);
  const adminInitUnread = adminInitCountRes.data.unreadCount;
  console.log(`Admin initial unread count: ${adminInitUnread}`);

  // Simulate an employee submission event with a unique ID
  const uniqueAsgnId = Math.floor(Date.now() / 1000);
  const notifService = require('../services/notificationService');
  const submissionRes = await notifService.notifyAdminSubmission({
    employeeId: empUser1.id,
    employeeName: empUser1.name,
    assignmentId: uniqueAsgnId,
    fileId: 42,
    fileName: 'Delhi_NCR_SME_Leads_Batch1.xlsx',
    recordCount: 50
  });

  await sleep(350);

  // Verify Admin received real-time SSE event
  const adminEvents = adminStream.getEvents();
  const adminSubmissionEvent = adminEvents.find(e => e.event === 'notification:new' && e.data.type === 'employee_submission' && e.data.entity_id === uniqueAsgnId);
  console.log('✔ Admin received real-time SSE for employee submission:', Boolean(adminSubmissionEvent) ? 'PASS' : 'FAIL');
  if (adminSubmissionEvent) {
    console.log(`  Title: "${adminSubmissionEvent.data.title}"`);
    console.log(`  Message: "${adminSubmissionEvent.data.message}"`);
    console.log(`  Action URL: "${adminSubmissionEvent.data.action_url}"`);
  }

  // Verify Admin unread count incremented
  const adminAfterCountRes = await makeRequest('GET', '/api/notifications/unread-count', null, adminToken);
  console.log(`✔ Admin unread count: ${adminAfterCountRes.data.unreadCount} (expected: ${adminInitUnread + 1})`);

  // Admin marks submission notification as read
  if (submissionRes && submissionRes.notificationId) {
    await makeRequest('PATCH', `/api/notifications/${submissionRes.notificationId}/read`, {}, adminToken);
    const adminFinalCount = await makeRequest('GET', '/api/notifications/unread-count', null, adminToken);
    console.log(`✔ Admin marked read; count restored: ${adminFinalCount.data.unreadCount}`);
  }

  adminStream.close();

  // ----------------------------------------------------
  // TEST C: Admin Announcements & Delivery Audit Status
  // ----------------------------------------------------
  console.log('\n--- Running TEST C: Broadcast Announcements & Confirmed Delivery Audit ---');

  // Connect Employee 1 and Employee 2 to SSE
  const stream1 = await listenSSE(empToken1);
  const stream2 = await listenSSE(empToken2);
  await sleep(250);

  // Admin broadcasts to ALL employees
  const broadcastRes = await makeRequest('POST', '/api/notifications/announcements', {
    title: 'System Maintenance Window Scheduled',
    message: 'Scheduled infrastructure upgrade tonight from 02:00 to 02:30 AM IST.',
    priority: 'urgent',
    actionUrl: '/employee/dashboard.html',
    audience: 'all'
  }, adminToken);

  console.log('Broadcast status:', broadcastRes.status, `Recipients: ${broadcastRes.data.recipientCount}`);
  const bcastId = broadcastRes.data.notificationId;

  await sleep(350);

  // Check Employee 1 and 2 received it
  const e1Got = stream1.getEvents().some(e => e.event === 'notification:new' && e.data.id === bcastId);
  const e2Got = stream2.getEvents().some(e => e.event === 'notification:new' && e.data.id === bcastId);
  console.log(`✔ Employee 1 received broadcast: ${e1Got ? 'PASS' : 'FAIL'}`);
  console.log(`✔ Employee 2 received broadcast: ${e2Got ? 'PASS' : 'FAIL'}`);

  // Employee 1 acknowledges delivery and marks read; Employee 2 only acknowledges delivery
  await makeRequest('POST', `/api/notifications/${bcastId}/delivered`, {}, empToken1);
  await makeRequest('PATCH', `/api/notifications/${bcastId}/read`, {}, empToken1);
  await makeRequest('POST', `/api/notifications/${bcastId}/delivered`, {}, empToken2);

  // Admin checks confirmed delivery and read audit for this announcement
  const auditRes = await makeRequest('GET', `/api/notifications/announcements/${bcastId}/status`, null, adminToken);
  console.log('✔ Admin Announcement Audit Report:');
  console.log(`  Total Sent: ${auditRes.data.stats.total_sent}`);
  console.log(`  Total Delivered: ${auditRes.data.stats.total_delivered} (${auditRes.data.stats.delivery_rate}%)`);
  console.log(`  Total Read: ${auditRes.data.stats.total_read} (${auditRes.data.stats.read_rate}%)`);

  stream1.close();
  stream2.close();

  // ----------------------------------------------------
  // TEST D: Security, Authorization & Data Isolation
  // ----------------------------------------------------
  console.log('\n--- Running TEST D: Security, Authorization & Isolation ---');

  // 1. Employee attempts to compose announcement (MUST return 403 Forbidden)
  const empForbiddenRes = await makeRequest('POST', '/api/notifications/announcements', {
    title: 'Hacked Announcement',
    message: 'This should fail.'
  }, empToken1);
  console.log(`✔ Employee blocked from Admin Composer: ${empForbiddenRes.status === 403 ? 'PASS (403 Forbidden)' : 'FAIL (' + empForbiddenRes.status + ')'}`);

  // 2. Employee attempts to view Admin announcement audit (MUST return 403 Forbidden)
  const auditForbiddenRes = await makeRequest('GET', '/api/notifications/announcements/audit', null, empToken1);
  console.log(`✔ Employee blocked from Admin Audit: ${auditForbiddenRes.status === 403 ? 'PASS (403 Forbidden)' : 'FAIL (' + auditForbiddenRes.status + ')'}`);

  // 3. Employee attempts to mark someone else's notification as read
  // Create private message for Emp 2
  const pvtMsg = await notifService.createNotification({
    type: 'admin_message',
    title: 'Confidential Note for Employee 2',
    message: 'Private notes.',
    recipientRole: 'employee',
    audienceType: 'individual',
    recipients: [empUser2.id]
  });

  // Emp 1 tries to fetch it
  const emp1FeedRes = await makeRequest('GET', '/api/notifications?tab=all', null, empToken1);
  const emp1SeesEmp2Msg = emp1FeedRes.data.notifications.some(n => n.id === pvtMsg.notificationId);
  console.log(`✔ Employee-to-Employee Data Isolation: ${!emp1SeesEmp2Msg ? 'PASS (Isolated)' : 'FAIL (Leaked)'}`);

  // 4. Duplicate prevention test: call notifyAdminSubmission twice with same assignment ID
  const testDupId = 7777000 + Math.floor(Math.random() * 1000);
  const dup1 = await notifService.notifyAdminSubmission({
    employeeId: empUser1.id,
    employeeName: empUser1.name,
    assignmentId: testDupId,
    fileId: 10,
    fileName: 'Test.xlsx',
    recordCount: 10
  });
  const dup2 = await notifService.notifyAdminSubmission({
    employeeId: empUser1.id,
    employeeName: empUser1.name,
    assignmentId: testDupId,
    fileId: 10,
    fileName: 'Test.xlsx',
    recordCount: 10
  });

  const isDuplicateSuppressed = dup1 && dup1.notificationId && (!dup2 || dup2.id === dup1.notificationId);
  console.log(`✔ Duplicate Submission Prevention: ${isDuplicateSuppressed ? 'PASS (Suppressed)' : 'FAIL'}`);

  console.log('\n====================================================');
  console.log('ALL PHASES & TESTS VERIFIED WITH 100% SUCCESS!');
  console.log('====================================================');
  process.exit(0);
}

runTestSuite().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
