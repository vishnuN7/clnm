require('dotenv').config({ path: __dirname + '/../.env' });
const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
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

async function test() {
  console.log('1. Logging in as Employee...');
  const empLogin = await post('/auth/login', {
    email: 'v@gmail.com',
    password: 'Employee@123',
    role: 'employee'
  });
  console.log('Employee Login Status:', empLogin.status, 'Success:', empLogin.data?.success);
  const empToken = empLogin.data?.token;

  console.log('\n2. Testing Employee APR Dashboard:');
  const empDash = await get('/apr/employee/dashboard', empToken);
  console.log('Status:', empDash.status, 'Data:', empDash.data?.data);

  console.log('\n3. Testing Employee Break History:');
  const empBreaks = await get('/apr/employee/break/history', empToken);
  console.log('Status:', empBreaks.status, 'Count:', empBreaks.data?.data?.length);

  console.log('\n4. Logging in as Admin...');
  const adminLogin = await post('/auth/login', {
    email: 'dixitlendingsolution@gmail.com',
    password: 'Admin@123',
    role: 'admin'
  });
  console.log('Admin Login Status:', adminLogin.status, 'Success:', adminLogin.data?.success);
  const adminToken = adminLogin.data?.token;

  console.log('\n5. Testing Admin APR Dashboard Stats:');
  const adminDash = await get('/apr/admin/dashboard?dateRange=today', adminToken);
  console.log('Status:', adminDash.status, 'Data:', adminDash.data?.data);

  console.log('\n6. Testing Admin Live Attendance:');
  const liveAtt = await get('/apr/admin/live-attendance', adminToken);
  console.log('Status:', liveAtt.status, 'Count:', liveAtt.data?.data?.length);

  console.log('\n7. Testing Admin Daily Report:');
  const dailyRep = await get('/apr/admin/daily-report?dateRange=today', adminToken);
  console.log('Status:', dailyRep.status, 'Count:', dailyRep.data?.data?.length);

  console.log('\n8. Testing Admin Login History:');
  const loginHist = await get('/apr/admin/login-history?dateRange=today', adminToken);
  console.log('Status:', loginHist.status, 'Count:', loginHist.data?.data?.length);

  console.log('\n9. Testing Admin Analytics:');
  const analytics = await get('/apr/admin/analytics?dateRange=today', adminToken);
  console.log('Status:', analytics.status, 'Data summary:', Object.keys(analytics.data?.data || {}));

  console.log('\n10. Testing Admin Performance:');
  const perf = await get('/apr/admin/performance?dateRange=today', adminToken);
  console.log('Status:', perf.status, 'Count:', perf.data?.data?.length);

  console.log('\n11. Testing Admin Leaderboard:');
  const lboard = await get('/apr/admin/leaderboard?dateRange=today', adminToken);
  console.log('Status:', lboard.status, 'Count:', lboard.data?.data?.length);

  console.log('\n12. Testing Admin Live Breaks:');
  const liveBreaks = await get('/apr/admin/live-breaks', adminToken);
  console.log('Status:', liveBreaks.status, 'Count:', liveBreaks.data?.data?.length);

  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
