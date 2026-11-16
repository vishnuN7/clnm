const fs = require('fs');
const zlib = require('zlib');
const content = fs.readFileSync('frontend/js/lender-assets.js', 'utf8');

function extractAndAnalyze(key) {
  const regex = new RegExp('"' + key + '":\\s*\\{([\\s\\S]*?)(?:\\n  \\},|\\n  \\}\\n\\};)', 'm');
  const m = content.match(regex);
  if (!m) return;
  const block = m[1];
  const b64Match = block.match(/"logoBase64":\s*"data:image\/png;base64,([^"]+)"/);
  if (!b64Match) {
    console.log(key, 'no logoBase64');
    return;
  }
  const buf = Buffer.from(b64Match[1], 'base64');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);

  let pos = 8;
  const idats = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') idats.push(buf.slice(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const decompressed = zlib.inflateSync(Buffer.concat(idats));
  const stride = 1 + width * 4;
  let totalVisible = 0;
  let whiteVisible = 0;
  let otherVisible = 0;
  let minX = width, maxX = 0, minY = height, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * stride + 1 + x * 4;
      const r = decompressed[idx], g = decompressed[idx+1], b = decompressed[idx+2], a = decompressed[idx+3];
      if (a > 10) {
        totalVisible++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (r > 240 && g > 240 && b > 240) {
          whiteVisible++;
        } else {
          otherVisible++;
        }
      }
    }
  }

  console.log(`[${key}] base64 PNG: ${width}x${height}, visible: ${totalVisible}/${width*height} (${(totalVisible/(width*height)*100).toFixed(1)}%), white: ${whiteVisible}, colored: ${otherVisible}`);
  console.log(`   Bounding box: [${minX}..${maxX}], [${minY}..${maxY}]`);
  fs.writeFileSync(`scratch_${key.replace(/ /g, '_')}_logo.png`, buf);
}

extractAndAnalyze('indusind_bank');
extractAndAnalyze('hdfc_bank');
extractAndAnalyze('icici_bank');
extractAndAnalyze('state_bank_of_india');
