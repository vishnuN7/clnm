const fs = require('fs');
const path = require('path');
const { jsPDF } = require('C:/Users/Aryan/.gemini/antigravity/brain/f17c265f-1adf-4f32-8ac8-1dc09dac8eb0/scratch/node_modules/jspdf');
const autoTable = require('C:/Users/Aryan/.gemini/antigravity/brain/f17c265f-1adf-4f32-8ac8-1dc09dac8eb0/scratch/node_modules/jspdf-autotable').default || require('C:/Users/Aryan/.gemini/antigravity/brain/f17c265f-1adf-4f32-8ac8-1dc09dac8eb0/scratch/node_modules/jspdf-autotable');

const fontsDir = 'frontend/fonts';
const segoeReg = fs.readFileSync(path.join(fontsDir, 'segoeui.ttf')).toString('base64');
const segoeBold = fs.readFileSync(path.join(fontsDir, 'segoeuib.ttf')).toString('base64');

global.window = {};
global.document = {};
global.window.jspdf = { jsPDF };

const lenderAssetsCode = fs.readFileSync('frontend/js/lender-assets.js', 'utf8');
eval(lenderAssetsCode);

function setupDocFonts(doc) {
  doc.addFileToVFS('segoeui.ttf', segoeReg);
  doc.addFont('segoeui.ttf', 'SegoeUI', 'normal');
  doc.addFileToVFS('segoeuib.ttf', segoeBold);
  doc.addFont('segoeuib.ttf', 'SegoeUI', 'bold');
  doc.autoTable = function(options) {
    return autoTable(doc, options);
  };
}

function testGenerateLenderPDF(lenderKey, outFilename) {
  const lender = global.window.getLenderProfile(lenderKey);
  console.log(`\nTesting lender [${lenderKey}]: ${lender.name}`);
  console.log(`Primary color:`, lender.primaryColor, `Secondary color:`, lender.secondaryColor);
  console.log(`logoMode:`, lender.logoMode, `has logoBase64:`, !!lender.logoBase64, `has faviconBase64:`, !!lender.faviconBase64);

  const doc = new jsPDF('p', 'pt', 'a4');
  setupDocFonts(doc);

  const principal = 2500000;
  const rate = 9.5;
  const tenureMonths = 72;
  const refCode = `DLS-${lender.fileSlug.toUpperCase()}-${principal}`;
  const formattedDate = '11 Nov 2026';

  // Universal Header
  global.window.renderLenderPdfHeader(
    doc,
    lender,
    'LOAN REPAYMENT SCHEDULE',
    null,
    refCode,
    formattedDate,
    'Monthly Reducing Balance',
    'SegoeUI'
  );

  const outDir = 'C:/Users/Aryan/.gemini/antigravity/brain/f17c265f-1adf-4f32-8ac8-1dc09dac8eb0/scratch';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, outFilename);
  const pdfBytes = doc.output('arraybuffer');
  fs.writeFileSync(outPath, Buffer.from(pdfBytes));
  console.log(`Saved ${outPath} (${pdfBytes.byteLength} bytes)`);
}

testGenerateLenderPDF('indusind_bank', 'current_test_indusind.pdf');
testGenerateLenderPDF('hdfc_bank', 'current_test_hdfc.pdf');
testGenerateLenderPDF('icici_bank', 'current_test_icici.pdf');
