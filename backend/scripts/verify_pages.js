const http = require('http');

function checkPage(urlPath) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:5000' + urlPath, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, length: data.length, body: data });
      });
    }).on('error', reject);
  });
}

async function verifyPages() {
  console.log('Verifying Employee APR page HTTP response...');
  const empPage = await checkPage('/employee/apr.html');
  console.log(`Employee APR: HTTP ${empPage.status}, Length: ${empPage.length} bytes`);
  console.log('Contains Section Status Overview:', empPage.body.includes('id="section-status-overview"'));
  console.log('Contains Section Break Control:', empPage.body.includes('id="section-break-control"'));
  console.log('Contains Section Break History:', empPage.body.includes('id="section-break-history"'));
  console.log('Contains Section Attendance History:', empPage.body.includes('id="section-attendance-history"'));
  console.log('Contains att-history-tbody:', empPage.body.includes('id="att-history-tbody"'));

  console.log('\nVerifying Admin APR page HTTP response...');
  const adminPage = await checkPage('/admin/apr.html');
  console.log(`Admin APR: HTTP ${adminPage.status}, Length: ${adminPage.length} bytes`);
  console.log('Contains tab-dashboard:', adminPage.body.includes('id="tab-dashboard"'));
  console.log('Contains tab-attendance:', adminPage.body.includes('id="tab-attendance"'));
  console.log('Contains tab-daily:', adminPage.body.includes('id="tab-daily"'));
  console.log('Contains tab-history:', adminPage.body.includes('id="tab-history"'));
  console.log('Contains tab-breaks:', adminPage.body.includes('id="tab-breaks"'));

  process.exit(0);
}

verifyPages().catch(err => {
  console.error(err);
  process.exit(1);
});
