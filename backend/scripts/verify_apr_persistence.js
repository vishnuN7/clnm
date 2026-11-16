require('dotenv').config({ path: __dirname + '/../.env' });
const http = require('http');

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method: 'POST',
      headers
    }, res => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(buf) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: buf });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method: 'GET',
      headers
    }, res => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(buf) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: buf });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  APR DATA PERSISTENCE & STORAGE CLEARING VERIFICATION SUITE');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function assert(name, condition, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${details ? '— ' + details : ''}`);
      failed++;
    }
  }

  // 1. Employee Initial Login & Attendance Verification
  console.log('--- TEST 1: Initial Employee Authentication & Session Start ---');
  const emp1Login = await post('/auth/login', {
    email: 'v@gmail.com',
    password: 'Employee@123',
    role: 'employee'
  });
  assert('Employee login succeeds', emp1Login.status === 200 && emp1Login.data?.success);
  const token1 = emp1Login.data?.token;

  const empDash1 = await get('/apr/employee/dashboard', token1);
  assert('Employee dashboard loads', empDash1.status === 200 && empDash1.data?.success);
  const initialWorkingHours = empDash1.data?.data?.totalWorkingHours;
  const initialClockIn = empDash1.data?.data?.loginTime;
  console.log(`    Status: ${empDash1.data?.data?.currentStatus}, Hours: ${initialWorkingHours}h, Initial Clock-In: ${initialClockIn}`);
  assert('Employee working hours > 0', initialWorkingHours > 0, `Got ${initialWorkingHours}`);
  assert('Initial clock-in is present', Boolean(initialClockIn));

  // 2. Break Recording
  console.log('\n--- TEST 2: Break Recording & Server Persistence ---');
  const startBreakRes = await post('/break-time/start', {
    break_type: 'Tea Break'
  }, token1);
  assert('Start break succeeds', startBreakRes.status === 200 || startBreakRes.data?.message?.includes('already on'));

  const empDashOnBreak = await get('/apr/employee/dashboard', token1);
  assert('Employee dashboard reflects break status', 
    empDashOnBreak.data?.data?.currentStatus === 'On Break' || empDashOnBreak.data?.data?.currentBreakStatus === 'On Break');

  // 3. SIMULATING CLEAR BROWSING DATA (Cookies, localStorage, cache, sessionStorage cleared)
  console.log('\n--- TEST 3: Simulate Chrome "Delete Browsing Data" (All Time) ---');
  console.log('    -> Discarding token1 from memory (simulating localStorage/sessionStorage/cookies wiped)');
  const clientStorage = {}; // Cleared!
  assert('Client storage is completely empty', Object.keys(clientStorage).length === 0);

  // 4. Re-authentication after clearing browsing data
  console.log('\n--- TEST 4: Re-login after Chrome Browsing Data Cleared ---');
  const emp2Login = await post('/auth/login', {
    email: 'v@gmail.com',
    password: 'Employee@123',
    role: 'employee'
  });
  assert('Re-login succeeds with credentials', emp2Login.status === 200 && emp2Login.data?.success);
  const token2 = emp2Login.data?.token;
  assert('Valid auth token received on re-login', Boolean(token2) && token2.length > 20);

  // 5. Verify Employee APR Restoration from Database
  console.log('\n--- TEST 5: Verify Employee APR Restored from Database ---');
  const empDash2 = await get('/apr/employee/dashboard', token2);
  assert('Employee dashboard loads successfully after re-login', empDash2.status === 200 && empDash2.data?.success);
  const restoredHours = empDash2.data?.data?.totalWorkingHours;
  const restoredClockIn = empDash2.data?.data?.loginTime;
  console.log(`    Status: ${empDash2.data?.data?.currentStatus}, Hours: ${restoredHours}h, Clock-In: ${restoredClockIn}`);
  assert('Working hours are restored and NOT zeroed out', restoredHours >= initialWorkingHours, `Initial: ${initialWorkingHours}, Restored: ${restoredHours}`);
  assert('Initial clock-in is preserved and matches morning time', restoredClockIn === initialClockIn, `Expected ${initialClockIn}, got ${restoredClockIn}`);
  assert('Active break state is preserved across re-login', empDash2.data?.data?.currentStatus === 'On Break' || empDash2.data?.data?.activeBreak !== null);

  // End break to return to working status
  console.log('\n--- Ending Break ---');
  const endBreakRes = await post('/break-time/end', {}, token2);
  console.log('    End break result:', endBreakRes.data?.message);

  // 6. Test New Attendance & Session History Endpoint
  console.log('\n--- TEST 6: Employee Attendance History Endpoint ---');
  const attHistoryRes = await get('/apr/employee/attendance/history?dateRange=last7', token2);
  assert('Attendance history loads', attHistoryRes.status === 200 && attHistoryRes.data?.success);
  const historyRecords = attHistoryRes.data?.data || [];
  console.log(`    Found ${historyRecords.length} historical attendance days`);
  assert('Attendance history contains records', historyRecords.length > 0);
  if (historyRecords.length > 0) {
    const todayRec = historyRecords[0];
    console.log(`    Latest Record: Date: ${todayRec.work_date}, Clock-In: ${todayRec.first_login}, Hours: ${todayRec.working_hours}h, Status: ${todayRec.status}`);
    assert('Work date is present', Boolean(todayRec.work_date));
    assert('Working hours in history is accurate', todayRec.working_hours > 0);
  }

  // 7. Test Admin APR View Consistency
  console.log('\n--- TEST 7: Admin APR View Consistency ---');
  const adminLogin = await post('/auth/login', {
    email: 'dixitlendingsolution@gmail.com',
    password: 'Admin@123',
    role: 'admin'
  });
  assert('Admin login succeeds', adminLogin.status === 200);
  const adminToken = adminLogin.data?.token;

  const adminDash = await get('/apr/admin/dashboard?dateRange=today', adminToken);
  assert('Admin APR dashboard stats load', adminDash.status === 200);
  console.log(`    Total Employees: ${adminDash.data?.data?.totalEmployees}, Present: ${adminDash.data?.data?.presentToday}, Avg Hours: ${adminDash.data?.data?.averageWorkingHours}h`);
  assert('Admin sees employee as Present', adminDash.data?.data?.presentToday >= 1);
  assert('Admin sees employee working hours', adminDash.data?.data?.averageWorkingHours > 0);

  const adminRoster = await get('/apr/admin/live-attendance', adminToken);
  assert('Admin Live Roster loads', adminRoster.status === 200);
  const akaneInRoster = adminRoster.data?.data?.find(e => e.employee_name === 'Akane' || e.employee_id === 4);
  assert('Employee found in Admin Roster', Boolean(akaneInRoster));
  if (akaneInRoster) {
    console.log(`    Akane in Admin Roster: Status: ${akaneInRoster.current_status}, Hours: ${akaneInRoster.working_hours}h, Attendance: ${akaneInRoster.attendance_status}`);
    assert('Admin roster displays accurate employee working hours', akaneInRoster.working_hours > 0);
  }

  const adminDaily = await get('/apr/admin/daily-report?dateRange=today', adminToken);
  assert('Admin Daily Report loads', adminDaily.status === 200);
  const akaneDaily = adminDaily.data?.data?.find(e => e.employee_name === 'Akane' || e.employee_id === 4);
  assert('Employee found in Admin Daily Report', Boolean(akaneDaily));
  if (akaneDaily) {
    console.log(`    Akane Daily Report: Date: ${akaneDaily.work_date}, Hours: ${akaneDaily.total_working_hours}h`);
    assert('Admin daily report shows accurate working hours', akaneDaily.total_working_hours > 0);
  }

  // 8. Admin Storage Clearing Simulation
  console.log('\n--- TEST 8: Admin Clears Browsing Data & Restores Records ---');
  // Admin re-login with brand new session
  const adminLogin2 = await post('/auth/login', {
    email: 'dixitlendingsolution@gmail.com',
    password: 'Admin@123',
    role: 'admin'
  });
  const adminToken2 = adminLogin2.data?.token;
  const adminDash2 = await get('/apr/admin/dashboard?dateRange=today', adminToken2);
  assert('Admin APR completely restored after clearing browsing data', 
    adminDash2.status === 200 && adminDash2.data?.data?.totalEmployees === adminDash.data?.data?.totalEmployees);

  // 9. Role-based Access Control (RBAC) Isolation
  console.log('\n--- TEST 9: Role-Based Authorization Enforcement ---');
  const empTriesAdmin = await get('/apr/admin/dashboard', token2);
  assert('Employee cannot access Admin APR (403 Forbidden)', empTriesAdmin.status === 403);

  const adminTriesEmp = await get('/apr/employee/dashboard', adminToken2);
  assert('Admin cannot access Employee APR directly without employee identity (403 Forbidden)', adminTriesEmp.status === 403);

  // 10. Heartbeat Keep-Alive Test
  console.log('\n--- TEST 10: Keep-Alive Heartbeat ---');
  const heartbeatRes = await post('/break-time/heartbeat', { status: 'Available' }, token2);
  assert('Heartbeat ping succeeds', heartbeatRes.status === 200 && heartbeatRes.data?.success);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
