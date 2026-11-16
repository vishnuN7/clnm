const fs = require('fs');
const path = require('path');

function searchFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const hits = [];
  lines.forEach((line, idx) => {
    if (/localStorage|sessionStorage|indexedDB|cookie/i.test(line)) {
      hits.push({ line: idx + 1, text: line.trim() });
    }
  });
  return hits;
}

const files = [
  'frontend/employee/apr.html',
  'frontend/admin/apr.html',
  'frontend/employee/dashboard.html',
  'frontend/admin/dashboard.html',
  'frontend/js/api.js'
];

files.forEach(f => {
  const p = path.resolve(f);
  if (fs.existsSync(p)) {
    const hits = searchFile(p);
    console.log(`\n=== Hits in ${f} (${hits.length}) ===`);
    hits.forEach(h => console.log(`  Line ${h.line}: ${h.text.substring(0, 120)}`));
  } else {
    console.log(`File not found: ${f}`);
  }
});
