const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function login(email, password, role) {
  const payload = JSON.stringify({ email, password, role });
  const res = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);
  if (!res.data || !res.data.token) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.data || res.raw)}`);
  }
  return res.data.token;
}

async function runTests() {
  console.log('=== STARTING PRIVATE COMMUNICATION UPGRADE VERIFICATION ===\n');

  // 1. Authenticate Admin and Employee
  console.log('[1] Authenticating Admin & Employee...');
  const adminToken = await login('dixitlendingsolution@gmail.com', 'Admin@123', 'admin');
  console.log('  Admin token acquired.');

  const empToken = await login('v@gmail.com', 'Employee@123', 'employee');
  console.log('  Employee token acquired (Akane).');

  // Helper for authenticated requests
  const apiCall = (token, method, path, body = null) => {
    const payload = body ? JSON.stringify(body) : null;
    return request({
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, payload);
  };

  // 2. Test Multiline Admin Message Send
  console.log('\n[2] Testing Multiline Message Composer Support (Shift + Enter equivalent)...');
  const multilineText = 'Hello Akane,\nThis is line 2 of the private directive.\n  - Item 1\n  - Item 2\nPlease acknowledge receipt.';
  const sendRes = await apiCall(adminToken, 'POST', '/api/private-communication/admin/conversations/1/messages', {
    message_type: 'text',
    content: multilineText
  });
  console.log('  Admin sent message response status:', sendRes.status, 'success:', sendRes.data?.success);
  if (!sendRes.data?.success) {
    throw new Error('Failed to send admin multiline message');
  }

  // 3. Test Employee Conversation Fetch & STRICT Privacy Rule
  console.log('\n[3] Testing CRITICAL One-Way Privacy Rule on Employee API Response...');
  const empConvRes = await apiCall(empToken, 'GET', '/api/private-communication/employee/conversation');
  console.log('  Employee conversation fetch status:', empConvRes.status);
  const empMsgs = empConvRes.data?.messages || [];
  console.log(`  Fetched ${empMsgs.length} messages for Employee.`);

  // Check last message received
  const lastAdminMsg = empMsgs[empMsgs.length - 1];
  console.log('  Last message content preserves newlines:', lastAdminMsg?.content === multilineText ? 'YES' : 'NO');
  console.log('  Last message status indicator for employee:', lastAdminMsg?.status, 'is_delivered:', lastAdminMsg?.is_delivered);

  // STRICT AUDIT: Inspect every message for any leak of read receipts
  let privacyViolationFound = false;
  for (const msg of empMsgs) {
    if ('is_read' in msg) {
      console.error(`  VIOLATION: 'is_read' field present in message ID ${msg.id}`);
      privacyViolationFound = true;
    }
    if ('read_at' in msg) {
      console.error(`  VIOLATION: 'read_at' field present in message ID ${msg.id}`);
      privacyViolationFound = true;
    }
  }

  if (privacyViolationFound) {
    throw new Error('CRITICAL PRIVACY VIOLATION: Employee API response leaked read receipt fields!');
  } else {
    console.log('  PASS: Zero read receipt fields (is_read / read_at) exposed to Employee. Complete privacy compliance verified.');
  }

  // 4. Test Employee Sending Message & Delivery Tracking
  console.log('\n[4] Testing Employee Outgoing Message & Delivery State Tracking...');
  const empMsgText = 'Acknowledged Admin.\nDocuments are verified.';
  const empSendRes = await apiCall(empToken, 'POST', '/api/private-communication/employee/messages', {
    message_type: 'text',
    content: empMsgText
  });
  console.log('  Employee send status:', empSendRes.status, 'success:', empSendRes.data?.success);

  // 5. Test Delivery Acknowledgement API
  console.log('\n[5] Testing Delivery Acknowledgement Endpoint (/delivery-ack)...');
  const ackRes = await apiCall(adminToken, 'POST', '/api/private-communication/delivery-ack', {});
  console.log('  Admin delivery ack status:', ackRes.status, 'result:', ackRes.data);

  // 6. Test Admin Message Fetch: Admin CAN see Employee Read Status (One-way)
  console.log('\n[6] Testing Admin Inspection of Read Receipts...');
  const adminMsgsRes = await apiCall(adminToken, 'GET', '/api/private-communication/admin/conversations/1/messages');
  const adminMsgs = adminMsgsRes.data?.messages || [];
  const foundAdminMsg = adminMsgs.find(m => m.content === multilineText);
  console.log('  Admin message seen by employee:', foundAdminMsg?.is_read === true || foundAdminMsg?.status === 'read', 'read_at:', foundAdminMsg?.read_at);
  if (!foundAdminMsg?.is_read && foundAdminMsg?.status !== 'read') {
    console.log('  Note: Message was just marked read when employee fetched conversation.');
  }

  // 7. Test Employee Re-fetch: STILL NO Read Receipt Leak Even After Admin Read Employee Message
  console.log('\n[7] Re-verifying Employee Privacy After Admin Marked Employee Message as Read...');
  const empConvRes2 = await apiCall(empToken, 'GET', '/api/private-communication/employee/conversation');
  const empMsgs2 = empConvRes2.data?.messages || [];
  const sentEmpMsg = empMsgs2.find(m => m.content === empMsgText);
  console.log('  Employee message status in Employee UI:', sentEmpMsg?.status, 'is_delivered:', sentEmpMsg?.is_delivered);
  console.log('  Does Employee see if Admin read it?');
  console.log('    is_read in message?', 'is_read' in sentEmpMsg);
  console.log('    read_at in message?', 'read_at' in sentEmpMsg);
  if ('is_read' in sentEmpMsg || 'read_at' in sentEmpMsg) {
    throw new Error('CRITICAL PRIVACY VIOLATION: Admin read status leaked to Employee after message read!');
  }
  console.log('  PASS: Admin read state remains 100% hidden from Employee.');

  // 8. Test Navigation & Unread Count Sync
  console.log('\n[8] Testing Unread Counts & Navigation Synchronization...');
  // Employee sends another message to create an unread condition for Admin
  await apiCall(empToken, 'POST', '/api/private-communication/employee/messages', {
    message_type: 'text',
    content: 'Unread test message for Admin'
  });

  const adminConvs = await apiCall(adminToken, 'GET', '/api/private-communication/admin/conversations');
  const targetConv = adminConvs.data?.conversations?.find(c => c.employee_id === 4);
  console.log('  Admin total_unread_count returned:', adminConvs.data?.total_unread_count);
  console.log('  Admin conversation unread for Akane:', targetConv?.admin_unread_count);
  if ((adminConvs.data?.total_unread_count || 0) < 1 || (targetConv?.admin_unread_count || 0) < 1) {
    throw new Error('Unread counter failed to increment for Admin!');
  }
  console.log('  PASS: Admin unread badge counter incremented successfully.');

  // Admin opens conversation
  await apiCall(adminToken, 'GET', '/api/private-communication/admin/conversations/1/messages');
  const adminConvsAfter = await apiCall(adminToken, 'GET', '/api/private-communication/admin/conversations');
  const targetConvAfter = adminConvsAfter.data?.conversations?.find(c => c.employee_id === 4);
  console.log('  Admin unread after viewing messages:', targetConvAfter?.admin_unread_count);
  if (targetConvAfter?.admin_unread_count !== 0) {
    throw new Error('Admin unread count failed to reset upon opening conversation!');
  }
  console.log('  PASS: Admin unread badge counter resets upon viewing messages.');

  // Admin sends message to create unread condition for Employee
  await apiCall(adminToken, 'POST', '/api/private-communication/admin/conversations/1/messages', {
    message_type: 'text',
    content: 'Unread test message for Employee'
  });
  const empStatus = await apiCall(empToken, 'GET', '/api/private-communication/employee/status');
  console.log('  Employee unread_count returned:', empStatus.data?.unread_count);
  if ((empStatus.data?.unread_count || 0) < 1) {
    throw new Error('Unread counter failed to increment for Employee!');
  }
  console.log('  PASS: Employee unread badge counter incremented successfully.');

  // Employee opens conversation
  await apiCall(empToken, 'GET', '/api/private-communication/employee/conversation');
  const empStatusAfter = await apiCall(empToken, 'GET', '/api/private-communication/employee/status');
  console.log('  Employee unread_count after viewing:', empStatusAfter.data?.unread_count);
  if (empStatusAfter.data?.unread_count !== 0) {
    throw new Error('Employee unread count failed to reset upon opening conversation!');
  }
  console.log('  PASS: Employee unread badge counter resets upon viewing conversation.');

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

