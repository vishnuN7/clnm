const fs = require('fs');
const path = require('path');

const apiBase = (process.env.CLN_API_BASE || 'https://clnm.onrender.com').replace(/\/$/, '');
const runtimeConfigPath = path.join(__dirname, '..', 'frontend', 'js', 'runtime-config.js');
const marker = "return 'https://clnm.onrender.com';";

if (!fs.existsSync(runtimeConfigPath)) {
  throw new Error(`Missing runtime config file: ${runtimeConfigPath}`);
}

const source = fs.readFileSync(runtimeConfigPath, 'utf8');

if (!source.includes(marker)) {
  console.log('Netlify build injection skipped: runtime-config.js already customized.');
  process.exit(0);
}

const updated = source.replace(marker, `return '${apiBase}';`);
fs.writeFileSync(runtimeConfigPath, updated);

console.log(`Injected CLN API base for Netlify build: ${apiBase}`);