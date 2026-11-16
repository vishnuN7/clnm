require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const express = require('express');
const db = require('../config/db');
const { initSocket } = require('../services/socketService');

// Start temporary test server
async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING PRIVATE COMMUNICATION TEST SUITE');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      throw new Error(`Test failed: ${message}`);
    }
  }

  // 1. Get Admin and Employee Users
  const [[adminUser]] = await db.query(`SELECT id, name, email, role FROM users WHERE role = 'admin' LIMIT 1`);
  const [[empUser]] = await db.query(`SELECT id, name, email, role, is_active FROM users WHERE role = 'employee' LIMIT 1`);

  assert(!!adminUser, `Found admin user: ${adminUser?.email} (ID: ${adminUser?.id})`);
  assert(!!empUser, `Found employee user: ${empUser?.email} (ID: ${empUser?.id})`);

  // Ensure employee has communication access
  await db.query(`
    INSERT INTO employee_communication_access (employee_id, has_access, updated_by)
    VALUES (?, 1, ?)
    ON DUPLICATE KEY UPDATE has_access = 1
  `, [empUser.id, adminUser.id]);

  // Ensure employee is active
  await db.query(`UPDATE users SET is_active = 1 WHERE id = ?`, [empUser.id]);

  // Generate test JWT tokens
  const jwt = require('jsonwebtoken');
  const adminToken = jwt.sign({ id: adminUser.id, email: adminUser.email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const empToken = jwt.sign({ id: empUser.id, email: empUser.email, role: 'employee' }, process.env.JWT_SECRET, { expiresIn: '1h' });

  // 2. Start app instance for testing
  const app = express();
  app.use(express.json());
  const server = http.createServer(app);
  initSocket(server, ['http://localhost:5000']);

  const commRoutes = require('../routes/privateCommunication');
  app.use('/api/private-communication', commRoutes);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/private-communication`;
  console.log(`  ℹ️ Test server running on port ${port}\n`);

  try {
    // ── Test 1: Employee Status ───────────────────────────────────────────
    console.log('[Phase 1: Status & Access Control]');
    const statusRes = await fetch(`${baseUrl}/employee/status`, {
      headers: { Authorization: `Bearer ${empToken}` }
    });
    const statusData = await statusRes.json();
    assert(statusRes.status === 200 && statusData.has_access === true, 'Employee has active communication access');

    // ── Test 2: Company Group Info ────────────────────────────────────────
    console.log('\n[Phase 2: Company Group Chat]');
    const infoRes = await fetch(`${baseUrl}/group/info`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const infoData = await infoRes.json();
    assert(infoRes.status === 200 && infoData.group.name === 'Company Group', 'Fetched Company Group metadata');
    assert(infoData.members.length >= 2, `Group has ${infoData.members.length} active members (Admins + Employees)`);

    // ── Test 3: Send Group Message (Admin) ────────────────────────────────
    const adminMsgRes = await fetch(`${baseUrl}/group/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ content: 'Welcome to Dixit Lending Solution Company Group! Please post updates here.' })
    });
    const adminMsgData = await adminMsgRes.json();
    assert(adminMsgRes.status === 201 && adminMsgData.data.id > 0, `Admin sent message to Company Group (ID: ${adminMsgData.data?.id})`);
    const welcomeMsgId = adminMsgData.data.id;

    // ── Test 4: Send Group Reply Message with @mention (Employee) ─────────
    const empMsgRes = await fetch(`${baseUrl}/group/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` },
      body: JSON.stringify({
        content: `Acknowledged @Admin! Daily loan disbursements file uploaded.`,
        reply_to_id: welcomeMsgId
      })
    });
    const empMsgData = await empMsgRes.json();
    assert(empMsgRes.status === 201 && empMsgData.data.reply_to_id === welcomeMsgId, `Employee replied to welcome message with @mention (ID: ${empMsgData.data?.id})`);
    const empMsgId = empMsgData.data.id;

    // ── Test 5: Emoji Reactions ───────────────────────────────────────────
    const reactRes = await fetch(`${baseUrl}/messages/${welcomeMsgId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` },
      body: JSON.stringify({ emoji: '👍' })
    });
    const reactData = await reactRes.json();
    assert(reactRes.status === 200 && reactData.reactions.some(r => r.emoji === '👍'), 'Employee added thumbs-up reaction to welcome message');

    // ── Test 6: Group Message Pinning ─────────────────────────────────────
    const pinRes = await fetch(`${baseUrl}/group/messages/${welcomeMsgId}/pin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const pinData = await pinRes.json();
    assert(pinRes.status === 200 && pinData.is_pinned === true, 'Admin successfully pinned welcome message');

    // ── Test 7: Fetch Group Messages ──────────────────────────────────────
    const fetchGrpRes = await fetch(`${baseUrl}/group/messages`, {
      headers: { Authorization: `Bearer ${empToken}` }
    });
    const fetchGrpData = await fetchGrpRes.json();
    assert(fetchGrpRes.status === 200 && fetchGrpData.messages.length >= 2, `Retrieved ${fetchGrpData.messages.length} unexpired group messages`);
    const pinnedMsg = fetchGrpData.messages.find(m => m.id === welcomeMsgId);
    assert(pinnedMsg && pinnedMsg.is_pinned === true, 'Pinned message flag verified in group message stream');
    assert(pinnedMsg && pinnedMsg.reactions.length > 0, 'Reactions list verified in group message stream');

    // ── Test 8: Admin Announcements ───────────────────────────────────────
    console.log('\n[Phase 3: Admin Announcements]');
    const annoRes = await fetch(`${baseUrl}/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: 'Monthly Performance Review Schedule',
        content: 'All loan officers must submit pending borrower verification docs by 5:00 PM today.',
        priority: 'Urgent',
        target_type: 'all'
      })
    });
    const annoData = await annoRes.json();
    assert(annoRes.status === 201 && annoData.announcement.id > 0, `Admin created Urgent announcement (ID: ${annoData.announcement.id})`);
    const annoId = annoData.announcement.id;

    // Employee fetches announcements
    const getEmpAnnoRes = await fetch(`${baseUrl}/announcements`, {
      headers: { Authorization: `Bearer ${empToken}` }
    });
    const getEmpAnnoData = await getEmpAnnoRes.json();
    assert(getEmpAnnoRes.status === 200 && getEmpAnnoData.announcements.some(a => a.id === annoId), 'Employee sees new announcement in feed');

    // Employee acknowledges announcement read
    const readAnnoRes = await fetch(`${baseUrl}/announcements/${annoId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${empToken}` }
    });
    const readAnnoData = await readAnnoRes.json();
    assert(readAnnoRes.status === 200 && readAnnoData.success === true, 'Employee acknowledged reading announcement');

    // Admin verifies announcement read count
    const getAdminAnnoRes = await fetch(`${baseUrl}/announcements`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const getAdminAnnoData = await getAdminAnnoRes.json();
    const adminAnno = getAdminAnnoData.announcements.find(a => a.id === annoId);
    assert(adminAnno && adminAnno.read_count >= 1, `Admin verified read count updated (${adminAnno?.read_count}/${adminAnno?.total_recipients})`);

    // Employee cannot publish announcements (RBAC check)
    const empPublishRes = await fetch(`${baseUrl}/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` },
      body: JSON.stringify({ title: 'Unauthorized', content: 'Should fail', priority: 'Normal' })
    });
    assert(empPublishRes.status === 403, 'RBAC check passed: Employee forbidden from publishing announcements (403)');

    // ── Test 9: 1-on-1 Conversations & OTP Verification ───────────────────
    console.log('\n[Phase 4: 1-on-1 Private Conversations & OTP]');
    const convsRes = await fetch(`${baseUrl}/admin/conversations`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const convsData = await convsRes.json();
    const empConv = convsData.conversations.find(c => c.employee_id === empUser.id);
    assert(!!empConv, `Admin located conversation with employee #${empUser.id}`);

    // Admin sends OTP to employee
    const otpRes = await fetch(`${baseUrl}/admin/conversations/${empConv.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        message_type: 'otp',
        otp_value: '654321',
        otp_case_reference: 'DLS-LN-2026-908',
        otp_purpose: 'Aadhaar e-KYC Verification'
      })
    });
    const otpData = await otpRes.json();
    assert(otpRes.status === 201 && otpData.data.message_type === 'otp', 'Admin sent secure OTP message to employee');

    // Employee reads conversation and checks OTP
    const empConvRes = await fetch(`${baseUrl}/employee/conversation`, {
      headers: { Authorization: `Bearer ${empToken}` }
    });
    const empConvData = await empConvRes.json();
    const receivedOtp = empConvData.messages.find(m => m.message_type === 'otp');
    assert(receivedOtp && receivedOtp.otp_value === '654321', `Employee received OTP "${receivedOtp?.otp_value}" for case "${receivedOtp?.otp_case_reference}"`);
    assert(receivedOtp && receivedOtp.remaining_seconds <= 900, `OTP has 15-minute expiration (${Math.round(receivedOtp?.remaining_seconds / 60)} mins remaining)`);

    // ── Test 10: Search Functionality ─────────────────────────────────────
    console.log('\n[Phase 5: Search]');
    const searchRes = await fetch(`${baseUrl}/search?q=disbursements&channel=group`, {
      headers: { Authorization: `Bearer ${empToken}` }
    });
    const searchData = await searchRes.json();
    assert(searchRes.status === 200 && searchData.results.length >= 1, `Full-text search located message with query "disbursements" (Found: ${searchData.results.length})`);

    // ── Test 11: 24-Hour Expiration & Cleanup ─────────────────────────────
    console.log('\n[Phase 6: 24-Hour Automated Cleanup Policy]');
    const { processExpiredMessages } = require('../utils/communicationCleanup');
    const cleanupResult = await processExpiredMessages();
    assert(typeof cleanupResult.processedCount === 'number', `Automated cleanup processor executed cleanly (Processed: ${cleanupResult.processedCount})`);

    // Verify pinned messages do NOT bypass 24h expiration
    const [[pinnedDbMsg]] = await db.query(`SELECT expires_at, TIMESTAMPDIFF(HOUR, NOW(), expires_at) as diff_hours FROM private_messages WHERE id = ?`, [welcomeMsgId]);
    assert(pinnedDbMsg && pinnedDbMsg.diff_hours <= 24, `Pinned message strictly maintains 24-hour expiration window (${pinnedDbMsg?.diff_hours} hours remaining)`);

    console.log('\n====================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log('====================================================\n');
  } finally {
    server.close();
  }
}

runTestSuite().then(() => process.exit(0)).catch((err) => {
  console.error('\n❌ TEST SUITE FAILURE:', err);
  process.exit(1);
});
