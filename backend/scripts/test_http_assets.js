const http = require('http');

http.get('http://localhost:5000/js/lender-assets.js', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('HTTP GET /js/lender-assets.js status:', res.statusCode, 'size:', data.length);
    const m = data.match(/"indusind_bank":\s*\{[\s\S]*?"logoBase64":\s*"([^"]+)"/);
    if (m) {
      console.log('indusind_bank logoBase64 length:', m[1].length);
      console.log('logoBase64 prefix:', m[1].substring(0, 50));
    } else {
      console.log('indusind_bank logoBase64 not found in served file');
    }

    // Check indusind bank (with space)
    const m2 = data.match(/"indusind bank":\s*\{[\s\S]*?"logoBase64":\s*"([^"]+)"/);
    if (m2) {
      console.log('indusind bank logoBase64 length:', m2[1].length);
    }
  });
}).on('error', (err) => {
  console.error('HTTP Error:', err.code, err.message);
});
