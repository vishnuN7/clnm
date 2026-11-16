const fs = require('fs');
const path = require('path');

function inspectFile(filePath) {
  console.log('=== INSPECTING:', filePath, '===');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let inTopbar = false;
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes('<header') || l.includes('topbar')) {
      inTopbar = true;
      count = 0;
    }
    if (inTopbar) {
      console.log(`${i+1}: ${l}`);
      count++;
      if (l.includes('</header>') || count > 60) {
        inTopbar = false;
      }
    }
  }
}

inspectFile('frontend/admin/dashboard.html');
inspectFile('frontend/employee/dashboard.html');
inspectFile('frontend/admin/login-activity.html');
