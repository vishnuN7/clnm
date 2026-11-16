const fs = require('fs');
const content = fs.readFileSync('frontend/js/lender-assets.js', 'utf8');

// Find all keys in LENDER_ASSETS
const keyMatches = [...content.matchAll(/"([^"]+)":\s*\{\s*"id":/g)];
console.log('Keys in LENDER_ASSETS:', keyMatches.map(m => m[1]));

// Check indusind and hdfc
function inspectLender(key) {
  const regex = new RegExp('"' + key + '":\\s*\\{([\\s\\S]*?)(?:\\n  \\},|\\n  \\}\\n\\};)', 'm');
  const m = content.match(regex);
  if (!m) {
    console.log('Key not found:', key);
    return;
  }
  const block = m[1];
  const logoMode = (block.match(/"logoMode":\s*"([^"]+)"/) || [])[1];
  const logoWidth = (block.match(/"logoWidth":\s*(\d+)/) || [])[1];
  const logoHeight = (block.match(/"logoHeight":\s*(\d+)/) || [])[1];
  const logoUrl = (block.match(/"logoUrl":\s*"([^"]+)"/) || [])[1];
  const faviconUrl = (block.match(/"faviconUrl":\s*"([^"]+)"/) || [])[1];
  const hasLogoBase64 = block.includes('"logoBase64"');
  const hasFaviconBase64 = block.includes('"faviconBase64"');
  console.log(`Lender [${key}]: mode=${logoMode}, ${logoWidth}x${logoHeight}, logoUrl=${logoUrl}, favUrl=${faviconUrl}, hasLogoB64=${hasLogoBase64}, hasFavB64=${hasFaviconBase64}`);
}

inspectLender('indusind bank');
inspectLender('indusind_bank');
inspectLender('hdfc bank');
inspectLender('hdfc_bank');
inspectLender('icici bank');
inspectLender('icici_bank');
inspectLender('sbi');
inspectLender('state bank of india');
