/**
 * CLN Lending Suite — Unified Loan Calculator Hub Engine
 * Shared across Admin and Employee Calculator Hubs:
 *  - Centralized Bank / NBFC Profiles & Normalized Lender Resolver
 *  - Centralized Disclaimers (Loan, Flat, Compare, Eligibility, Transfer)
 *  - Hub Navigation & Tab State Management (Reducing, Flat, Compare, Eligibility, Balance Transfer)
 *  - Comprehensive Calculations (Reducing EMI, Flat Rate, Loan Comparison, FOIR Eligibility, Balance Transfer)
 *  - Universal Institutional Exports (PDF, Multi-Sheet Excel, CSV, High-Fidelity Print)
 *  - Strictly ZERO Prohibited 3rd-Party Wording & Zero Cross-Tab Stale Data
 */

(function () {
  'use strict';

  // ── 1. Centralized Bank / NBFC Lender Profiles ────────────────────
  var LENDER_PROFILES = {
    default: {
      id: 'default',
      key: '',
      name: 'DIXIT LENDING SOLUTION',
      shortName: 'Dixit Lending Solution',
      selectorLabel: 'NBFC Default',
      primaryColor: [15, 39, 71],       // #0F2747 Dixit Navy
      secondaryColor: [15, 139, 113],   // #0F8B71 Forest Teal
      accentColor: [47, 111, 237],      // #2F6FED Royal Blue
      lightBg: [248, 250, 253],
      borderStroke: [217, 227, 239],
      hexPrimary: '#0f2747',
      hexSecondary: '#0f8b71',
      hexAccent: '#2f6fed',
      hexLightBg: '#f8fafc',
      hexBorder: '#d9e3ef',
      fileSlug: 'Dixit_Lending'
    },
    icici_bank: {
      id: 'icici_bank',
      key: 'icici_bank',
      name: 'ICICI BANK',
      shortName: 'ICICI Bank',
      primaryColor: [176, 42, 48],      // #B02A30 ICICI Maroon
      secondaryColor: [243, 112, 33],   // #F37021 ICICI Orange
      accentColor: [5, 60, 109],        // #053C6D Deep Corporate Blue Accent
      lightBg: [255, 248, 245],
      borderStroke: [252, 220, 212],
      hexPrimary: '#B02A30',
      hexSecondary: '#F37021',
      hexAccent: '#053C6D',
      hexLightBg: '#FFF8F5',
      hexBorder: '#FCDCD4',
      fileSlug: 'ICICI_Bank'
    },
    hdfc_bank: {
      id: 'hdfc_bank',
      key: 'hdfc_bank',
      name: 'HDFC BANK',
      shortName: 'HDFC Bank',
      primaryColor: [0, 76, 143],       // #004C8F HDFC Classic Corporate Navy
      secondaryColor: [237, 35, 42],    // #ED232A HDFC Red
      accentColor: [0, 46, 91],         // #002E5B Dark Indigo
      lightBg: [244, 248, 252],
      borderStroke: [210, 227, 244],
      hexPrimary: '#004C8F',
      hexSecondary: '#ED232A',
      hexAccent: '#002E5B',
      hexLightBg: '#F4F8FC',
      hexBorder: '#D2E3F4',
      fileSlug: 'HDFC_Bank'
    },
    incred_finance: {
      id: 'incred_finance',
      key: 'incred_finance',
      name: 'InCred Finance',
      shortName: 'InCred Finance',
      primaryColor: [230, 81, 0],       // #E65100 Vivid InCred Deep Orange
      secondaryColor: [35, 44, 61],     // #232C3D Dark Slate
      accentColor: [255, 102, 0],       // #FF6600 Bright Orange
      lightBg: [255, 249, 245],
      borderStroke: [255, 224, 204],
      hexPrimary: '#E65100',
      hexSecondary: '#232C3D',
      hexAccent: '#FF6600',
      hexLightBg: '#FFF9F5',
      hexBorder: '#FFE0CC',
      fileSlug: 'InCred_Finance'
    },
    idfc_first_bank: {
      id: 'idfc_first_bank',
      key: 'idfc_first_bank',
      name: 'IDFC FIRST BANK',
      shortName: 'IDFC FIRST Bank',
      primaryColor: [156, 29, 38],      // #9C1D26 IDFC Crimson Maroon
      secondaryColor: [255, 199, 44],   // #FFC72C IDFC Gold
      accentColor: [102, 16, 22],       // #661016 Deep Wine
      lightBg: [253, 248, 248],
      borderStroke: [244, 211, 213],
      hexPrimary: '#9C1D26',
      hexSecondary: '#FFC72C',
      hexAccent: '#661016',
      hexLightBg: '#FDF8F8',
      hexBorder: '#F4D3D5',
      fileSlug: 'IDFC_FIRST_Bank'
    }
  };

  // Extended mappings for broader compare list
  var BROADER_LENDERS = {
    'BAJAJ FIN': { name: 'BAJAJ FINANCE', shortName: 'Bajaj Finance', slug: 'Bajaj_Finance' },
    'MMFSL': { name: 'MAHINDRA FINANCE', shortName: 'Mahindra Finance', slug: 'Mahindra_Finance' },
    'SFL': { name: 'SHRIRAM FINANCE', shortName: 'Shriram Finance', slug: 'Shriram_Finance' },
    'CHOLA': { name: 'CHOLA FINANCE', shortName: 'Chola Finance', slug: 'Chola_Finance' },
    'MUTHOOT': { name: 'MUTHOOT FINANCE', shortName: 'Muthoot Finance', slug: 'Muthoot_Finance' },
    'MANAPPURAM': { name: 'MANAPPURAM FINANCE', shortName: 'Manappuram Finance', slug: 'Manappuram_Finance' },
    'LICHF': { name: 'LIC HOUSING FINANCE', shortName: 'LIC Housing Finance', slug: 'LIC_Housing_Finance' },
    'TATA CAP': { name: 'TATA CAPITAL', shortName: 'Tata Capital', slug: 'Tata_Capital' },
    'ABFL': { name: 'ADITYA BIRLA FINANCE', shortName: 'Aditya Birla Finance', slug: 'Aditya_Birla_Finance' },
    'LTF': { name: 'L&T FINANCE', shortName: 'L&T Finance', slug: 'LT_Finance' },
    'POONAWALLA': { name: 'POONAWALLA FINCORP', shortName: 'Poonawalla Fincorp', slug: 'Poonawalla_Fincorp' },
    'HDBFS': { name: 'HDB FINANCIAL', shortName: 'HDB Financial', slug: 'HDB_Financial' },
    'SUNDARM': { name: 'SUNDARAM FINANCE', shortName: 'Sundaram Finance', slug: 'Sundaram_Finance' },
    'FIVE STAR': { name: 'FIVE-STAR FINANCE', shortName: 'Five-Star Finance', slug: 'Five_Star_Finance' },
    'UJJIVAN': { name: 'UJJIVAN BANK', shortName: 'Ujjivan Bank', slug: 'Ujjivan_Bank' },
    'AAVAS': { name: 'AAVAS FINANCIERS', shortName: 'Aavas Financiers', slug: 'Aavas_Financiers' },
    'CREDITACC': { name: 'CREDITACCESS', shortName: 'CreditAccess', slug: 'CreditAccess' },
    'CAPRI': { name: 'CAPRI GLOBAL', shortName: 'Capri Global', slug: 'Capri_Global' },
    'INDOSTAR': { name: 'INDOSTAR CAPITAL', shortName: 'Indostar Capital', slug: 'Indostar_Capital' },
    'JMF': { name: 'JM FINANCIAL', shortName: 'JM Financial', slug: 'JM_Financial' },
    'Other': { name: 'OTHER BANK / NBFC', shortName: 'Other Bank / NBFC', slug: 'Other_Lender' }
  };

  // Merge external high-res asset bundle if present
  function enrichProfileWithAssets(p) {
    if (!p) return p;
    var assets = (typeof window !== 'undefined' && window.LENDER_ASSETS) ? window.LENDER_ASSETS : {};
    var a = assets[p.id] || assets[p.key] || assets[p.fileSlug] || assets.default || {};
    p.logoUrl = p.logoUrl || a.logoUrl || '/icons/lenders/dixit-logo.png';
    p.faviconUrl = p.faviconUrl || a.faviconUrl || '/icons/lenders/dixit-favicon.png';
    p.logoBase64 = p.logoBase64 || a.logoBase64 || '';
    p.faviconBase64 = p.faviconBase64 || a.faviconBase64 || '';
    p.logoWidth = p.logoWidth || a.logoWidth || 100;
    p.logoHeight = p.logoHeight || a.logoHeight || 100;
    p.logoAspect = p.logoAspect || a.logoAspect || 1;
    return p;
  }

  // Pre-enrich initial profiles
  Object.keys(LENDER_PROFILES).forEach(function(k) {
    enrichProfileWithAssets(LENDER_PROFILES[k]);
  });

  function getLenderProfile(val) {
    if (!val || val === 'default' || val === 'dixit') {
      return enrichProfileWithAssets(LENDER_PROFILES.default);
    }
    var cleanKey = String(val).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (LENDER_PROFILES[cleanKey]) {
      return enrichProfileWithAssets(LENDER_PROFILES[cleanKey]);
    }
    if (LENDER_PROFILES[val]) {
      return enrichProfileWithAssets(LENDER_PROFILES[val]);
    }
    // Check known broader list
    if (BROADER_LENDERS[val]) {
      var item = BROADER_LENDERS[val];
      return enrichProfileWithAssets({
        id: cleanKey,
        key: val,
        name: item.name,
        shortName: item.shortName,
        primaryColor: [15, 39, 71],
        secondaryColor: [15, 139, 113],
        accentColor: [47, 111, 237],
        lightBg: [248, 250, 253],
        borderStroke: [217, 227, 239],
        hexPrimary: '#0f2747',
        hexSecondary: '#0f8b71',
        hexAccent: '#2f6fed',
        hexLightBg: '#f8fafc',
        hexBorder: '#d9e3ef',
        fileSlug: item.slug
      });
    }
    // Check shortName or name match
    var keys = Object.keys(LENDER_PROFILES);
    for (var i = 0; i < keys.length; i++) {
      var p = LENDER_PROFILES[keys[i]];
      if (p.name.toLowerCase() === String(val).toLowerCase() ||
          p.shortName.toLowerCase() === String(val).toLowerCase()) {
        return enrichProfileWithAssets(p);
      }
    }
    // Clean fallback profile
    var safeSlug = String(val).replace(/[^a-zA-Z0-9]/g, '_');
    return enrichProfileWithAssets({
      id: cleanKey,
      key: val,
      name: String(val).toUpperCase(),
      shortName: String(val),
      primaryColor: [15, 39, 71],
      secondaryColor: [15, 139, 113],
      accentColor: [47, 111, 237],
      lightBg: [248, 250, 253],
      borderStroke: [217, 227, 239],
      hexPrimary: '#0f2747',
      hexSecondary: '#0f8b71',
      hexAccent: '#2f6fed',
      hexLightBg: '#f8fafc',
      hexBorder: '#d9e3ef',
      fileSlug: safeSlug
    });
  }

  // Browser tab title and favicon remain stable (no dynamic switching on lender selection)
  function updateTabFavicon() {
    /* Stable Dixit Lending Solution branding maintained */
  }

  // Expose centralized lender resolver and favicon updater
  if (typeof window !== 'undefined') {
    window.LENDER_PROFILES = LENDER_PROFILES;
    window.getLenderProfile = getLenderProfile;
    window.updateTabFavicon = updateTabFavicon;
  }

  // ── 2. Standard Legal Disclaimers (Illustrative Estimation Only) ───
  var MANDATORY_DISCLAIMERS = {
    loan: "Illustrative repayment schedule based on the loan parameters entered in the calculator. This document is for estimation purposes only and does not constitute a loan sanction, approval, offer, agreement, or official statement from the lender.",
    repayment: "Illustrative repayment schedule based on the loan parameters entered in the calculator. This document is for estimation purposes only and does not constitute a loan sanction, approval, offer, agreement, or official statement from the lender.",
    flat: "Illustrative repayment schedule based on the loan parameters entered in the calculator. This document is for estimation purposes only and does not constitute a loan sanction, approval, offer, agreement, or official statement from the lender.",
    compare: "This comparison is an illustrative calculation based on the loan parameters entered. It does not constitute an offer, approval, sanction, or official statement from any lender.",
    comparison: "This comparison is an illustrative calculation based on the loan parameters entered. It does not constitute an offer, approval, sanction, or official statement from any lender.",
    eligibility: "This is an illustrative eligibility assessment based on the information entered into the calculator. Final eligibility and approval are subject to the lender's applicable policies, verification, credit assessment, and underwriting.",
    transfer: "This is an illustrative refinancing comparison based on the information entered into the calculator. Actual savings, charges, approval, and transfer terms are subject to the applicable lender's policies and final assessment."
  };

  // ── 3. PDF Font Loader Helper ────────────────────────────────────
  var pdfFontsCache = null;
  async function getPdfFonts() {
    if (pdfFontsCache) return pdfFontsCache;
    try {
      var res = await Promise.all([
        fetch('/fonts/segoeui.ttf'),
        fetch('/fonts/segoeuib.ttf')
      ]);
      if (!res[0].ok || !res[1].ok) throw new Error('Font file HTTP request failed');
      var blobs = await Promise.all([res[0].blob(), res[1].blob()]);
      var toBase64 = function (blob) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onloadend = function () {
            if (reader.result) resolve(reader.result.split(',')[1]);
            else reject(new Error('FileReader empty'));
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      };
      var regular = await toBase64(blobs[0]);
      var bold = await toBase64(blobs[1]);
      pdfFontsCache = { regular: regular, bold: bold };
      return pdfFontsCache;
    } catch (err) {
      console.warn('PDF custom fonts could not be loaded, falling back to standard fonts:', err);
      return null;
    }
  }

  // ── 4. Global Currency & Number Utilities ─────────────────────────
  function formatINR(num, includeDecimals) {
    if (num === null || num === undefined || isNaN(num)) return '₹0';
    var isNegative = num < 0;
    var absVal = Math.abs(num);
    var rounded = includeDecimals ? absVal.toFixed(2) : Math.round(absVal).toString();
    var parts = rounded.split('.');
    var intPart = parts[0];
    var decPart = parts.length > 1 ? '.' + parts[1] : '';

    var lastThree = intPart.substring(intPart.length - 3);
    var otherNumbers = intPart.substring(0, intPart.length - 3);
    if (otherNumbers !== '') {
      lastThree = ',' + lastThree;
    }
    var formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
    return (isNegative ? '-₹' : '₹') + formattedInt + decPart;
  }

  function parseINR(str) {
    if (!str) return 0;
    if (typeof str === 'number') return isNaN(str) ? 0 : str;
    var cleaned = str.toString().replace(/₹/g, '').replace(/,/g, '').replace(/\s/g, '').trim();
    var val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  }

  function formatNumberWithCommas(val) {
    if (val === null || val === undefined || isNaN(val)) return '';
    var intPart = Math.round(Math.abs(val)).toString();
    var lastThree = intPart.substring(intPart.length - 3);
    var otherNumbers = intPart.substring(0, intPart.length - 3);
    if (otherNumbers !== '') {
      lastThree = ',' + lastThree;
    }
    return (val < 0 ? '-' : '') + otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  }

  function attachCurrencyMask(inputEl) {
    if (!inputEl) return;
    inputEl.addEventListener('input', function () {
      var raw = this.value.replace(/[^0-9.]/g, '');
      if (!raw) {
        this.value = '';
        return;
      }
      var num = parseFloat(raw);
      if (!isNaN(num)) {
        this.value = formatNumberWithCommas(num);
      }
    });
    inputEl.addEventListener('blur', function () {
      var num = parseINR(this.value);
      if (num > 0) {
        this.value = formatNumberWithCommas(num);
      }
    });
  }

  function calculateStandardEMI(principal, annualRate, tenureMonths) {
    if (principal <= 0 || tenureMonths <= 0) return 0;
    if (annualRate <= 0) return principal / tenureMonths;
    var r = annualRate / (12 * 100);
    var factor = Math.pow(1 + r, tenureMonths);
    if (factor === 1 || isNaN(factor) || !isFinite(factor)) return principal / tenureMonths;
    return (principal * r * factor) / (factor - 1);
  }

  function calculatePresentValue(monthlyPayment, annualRate, tenureMonths) {
    if (monthlyPayment <= 0 || tenureMonths <= 0) return 0;
    if (annualRate <= 0) return monthlyPayment * tenureMonths;
    var r = annualRate / (12 * 100);
    var factor = Math.pow(1 + r, tenureMonths);
    if (factor === 1 || isNaN(factor) || !isFinite(factor)) return monthlyPayment * tenureMonths;
    return (monthlyPayment * (factor - 1)) / (r * factor);
  }

  // ── 5. Hub Navigation State ───────────────────────────────────────
  var currentHubTab = 'emi';

  function switchHubTab(tabName) {
    if (!tabName) return;
    currentHubTab = tabName;

    document.querySelectorAll('.hub-tab-btn').forEach(function (btn) {
      var isCurrent = btn.id === 'hub-tab-' + tabName;
      btn.classList.toggle('active', isCurrent);
      btn.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    });

    var panels = ['emi', 'eligibility', 'transfer'];
    panels.forEach(function (p) {
      var el = document.getElementById('hub-content-' + p);
      if (el) {
        var isTarget = p === tabName;
        el.classList.toggle('active', isTarget);
        el.style.display = isTarget ? 'block' : 'none';
      }
    });

    if (tabName === 'emi') {
      try {
        if (typeof chartPie !== 'undefined' && chartPie && chartPie.resize) chartPie.resize();
        if (typeof chartAmortization !== 'undefined' && chartAmortization && chartAmortization.resize) chartAmortization.resize();
        if (typeof flatPieChartInstance !== 'undefined' && flatPieChartInstance && flatPieChartInstance.resize) flatPieChartInstance.resize();
      } catch (err) {}
    }

  }

  // ── 6. Flat Rate Calculator Module ───────────────────────────────
  var flatSelectedLender = '';

  function onFlatLenderChange(val) {
    flatSelectedLender = val || '';
    window.flatSelectedLender = flatSelectedLender;
    updateFlatLenderUI();
  }

  function updateFlatLenderUI() {
    var lender = getLenderProfile(flatSelectedLender);
    var badgeEl = document.getElementById('flat-selected-lender-badge');
    var tableBadgeText = document.getElementById('flat-export-lender-text');
    var tableBadgeIcon = document.getElementById('flat-export-lender-icon');
    var tableBadgeEl = document.getElementById('flat-export-lender-badge');

    if (badgeEl) {
      if (flatSelectedLender) {
        badgeEl.style.display = 'inline-flex';
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        badgeEl.style.color = isDark ? '#f8fafc' : lender.hexPrimary;
        var logoImg = lender.faviconBase64 ? '<img src="' + lender.faviconBase64 + '" class="lender-active-logo" alt="' + lender.shortName + '"/>' : '<i class="fas fa-building-columns" style="margin-right:5px;"></i>';
        badgeEl.innerHTML = logoImg + '<span>' + lender.shortName + '</span>';
      } else {
        badgeEl.style.display = 'none';
        badgeEl.innerHTML = '';
      }
    }
    if (tableBadgeText) {
      tableBadgeText.textContent = flatSelectedLender ? lender.shortName : 'Dixit Lending Solution';
    }
    if (tableBadgeIcon) {
      tableBadgeIcon.style.color = lender.hexPrimary;
    }
    if (tableBadgeEl) {
      if (flatSelectedLender) {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        tableBadgeEl.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.14)' : lender.hexBorder;
        tableBadgeEl.style.background = isDark ? 'rgba(14, 21, 30, 0.95)' : lender.hexLightBg;
        tableBadgeEl.style.color = isDark ? '#f8fafc' : lender.hexPrimary;
      } else {
        tableBadgeEl.style.borderColor = 'var(--border)';
        tableBadgeEl.style.background = 'var(--bg-secondary)';
        tableBadgeEl.style.color = 'var(--text-secondary)';
      }
    }
  }

  function buildFlatScheduleRows(d) {
    var N = d.totalMonths;
    var monthlyInterest = d.totalInterest / N;
    var monthlyPrincipal = d.principal / N;
    var rows = [];
    var rem = d.principal;
    for (var i = 1; i <= N; i++) {
      var isLast = (i === N);
      var open = Math.round(rem * 100) / 100;
      var prinComp, flatInt, payment;
      if (isLast) {
        prinComp = open;
        flatInt = Math.round((d.totalInterest - monthlyInterest * (N - 1)) * 100) / 100;
        payment = Math.round((prinComp + flatInt) * 100) / 100;
      } else {
        prinComp = Math.round(monthlyPrincipal * 100) / 100;
        flatInt = Math.round(monthlyInterest * 100) / 100;
        payment = Math.round((prinComp + flatInt) * 100) / 100;
      }
      rem = isLast ? 0 : Math.max(0, Math.round((open - prinComp) * 100) / 100);
      rows.push({ period: i, open: open, prinComp: prinComp, flatInt: flatInt, payment: payment, rem: rem });
    }
    return rows;
  }

  async function exportFlatPDF() {
    var jsPDFLib = window.jspdf;
    if (!jsPDFLib || !jsPDFLib.jsPDF) {
      alert('PDF library not loaded yet. Please wait a moment.');
      return;
    }
    var d = window.flatCalculatedData;
    if (!d || !d.principal || d.principal <= 0) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var lender = getLenderProfile(window.flatSelectedLender);
    var rows = buildFlatScheduleRows(d);
    var principal = Math.round(d.principal);
    var refCode = 'DLS-' + lender.fileSlug.toUpperCase() + '-' + principal;
    var docTitle = lender.name + ' — Flat Rate Loan Repayment Schedule';

    var doc = new jsPDFLib.jsPDF('p', 'pt', 'a4');
    var fontName = 'helvetica';
    var fonts = typeof getPdfFonts === 'function' ? await getPdfFonts() : null;
    if (fonts) {
      try {
        doc.addFileToVFS('segoeui.ttf', fonts.regular);
        doc.addFont('segoeui.ttf', 'SegoeUI', 'normal');
        doc.addFileToVFS('segoeuib.ttf', fonts.bold);
        doc.addFont('segoeuib.ttf', 'SegoeUI', 'bold');
        fontName = 'SegoeUI';
      } catch (e) {}
    }

    doc.setFillColor.apply(doc, lender.primaryColor);
    doc.rect(0, 0, 595, 6, 'F');
    doc.setFillColor.apply(doc, lender.secondaryColor);
    doc.rect(0, 6, 595, 2, 'F');

    var flatLogo = lender.faviconBase64 || lender.logoBase64;
    var flatTitleX = 40;
    if (flatLogo) {
      try {
        doc.addImage(flatLogo, 'PNG', 40, 20, 34, 34);
        flatTitleX = 84;
      } catch (e) {
        console.warn('Flat PDF logo embedding error:', e);
      }
    }

    doc.setFont(fontName, 'bold');
    doc.setFontSize(16);
    doc.setTextColor.apply(doc, lender.primaryColor);
    doc.text(lender.name, flatTitleX, 36);

    doc.setFont(fontName, 'bold');
    doc.setFontSize(13);
    doc.setTextColor(16, 32, 51);
    doc.text('Flat Rate Loan Repayment Schedule', flatTitleX, 52);

    doc.setFont(fontName, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(82, 97, 115);
    doc.text('Illustrative repayment schedule based on flat interest rate methodology', flatTitleX, 66);

    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(16, 32, 51);
    doc.text('Reference: ' + refCode, 555, 42, { align: 'right' });
    doc.setFont(fontName, 'normal');
    doc.setTextColor(82, 97, 115);
    doc.text('Generated: ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), 555, 56, { align: 'right' });

    doc.setDrawColor.apply(doc, lender.borderStroke);
    doc.setLineWidth(0.75);
    doc.line(40, 84, 555, 84);

    doc.setFillColor.apply(doc, lender.lightBg);
    doc.setDrawColor.apply(doc, lender.borderStroke);
    doc.roundedRect(40, 94, 515, 78, 5, 5, 'FD');

    doc.setFont(fontName, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor.apply(doc, lender.primaryColor);
    doc.text('LOAN DETAILS & FLAT REPAYMENT SUMMARY', 52, 110);

    doc.setFont(fontName, 'normal'); doc.setFontSize(8.5); doc.setTextColor(82, 97, 115);
    doc.text('Principal Amount:', 52, 126);
    doc.setFont(fontName, 'bold'); doc.setTextColor(16, 32, 51);
    doc.text('₹' + principal.toLocaleString('en-IN'), 150, 126);

    doc.setFont(fontName, 'normal'); doc.setTextColor(82, 97, 115);
    doc.text('Flat Interest Rate:', 52, 140);
    doc.setFont(fontName, 'bold'); doc.setTextColor(16, 32, 51);
    doc.text(d.rateVal + '% p.a.', 150, 140);

    doc.setFont(fontName, 'normal'); doc.setTextColor(82, 97, 115);
    doc.text('Loan Tenure:', 52, 154);
    doc.setFont(fontName, 'bold'); doc.setTextColor(16, 32, 51);
    doc.text(d.totalMonths + ' Months (' + d.tenureYears.toFixed(1) + ' Years)', 150, 154);

    doc.setFont(fontName, 'normal'); doc.setTextColor(82, 97, 115);
    doc.text('Monthly Payment:', 320, 126);
    doc.setFont(fontName, 'bold'); doc.setTextColor.apply(doc, lender.primaryColor);
    doc.text('₹' + Math.round(d.monthlyPayment).toLocaleString('en-IN'), 430, 126);

    doc.setFont(fontName, 'normal'); doc.setTextColor(82, 97, 115);
    doc.text('Total Flat Interest:', 320, 140);
    doc.setFont(fontName, 'bold'); doc.setTextColor(192, 38, 211);
    doc.text('₹' + Math.round(d.totalInterest).toLocaleString('en-IN'), 430, 140);

    doc.setFont(fontName, 'normal'); doc.setTextColor(82, 97, 115);
    doc.text('Total Repayment:', 320, 154);
    doc.setFont(fontName, 'bold'); doc.setTextColor(16, 32, 51);
    doc.text('₹' + Math.round(d.totalAmount).toLocaleString('en-IN'), 430, 154);

    var tableBody = rows.map(function (r) {
      return [
        'Month ' + r.period,
        '₹' + Math.round(r.open).toLocaleString('en-IN'),
        '₹' + Math.round(r.flatInt).toLocaleString('en-IN'),
        '₹' + Math.round(r.prinComp).toLocaleString('en-IN'),
        '₹' + Math.round(r.payment).toLocaleString('en-IN'),
        '₹' + Math.round(r.rem).toLocaleString('en-IN')
      ];
    });

    doc.autoTable({
      head: [['Period', 'Opening Principal', 'Flat Interest', 'Principal Comp.', 'Monthly Payment', 'Remaining Principal']],
      body: tableBody,
      startY: 184,
      showHead: 'everyPage',
      theme: 'plain',
      headStyles: {
        fillColor: lender.primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        font: fontName,
        fontSize: 8.5
      },
      styles: {
        fontSize: 8,
        cellPadding: { top: 4.5, bottom: 4.5, left: 6, right: 6 },
        font: fontName,
        lineColor: lender.borderStroke,
        lineWidth: 0.5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 253]
      },
      columnStyles: {
        0: { cellWidth: 65, halign: 'center' },
        1: { cellWidth: 90, halign: 'right' },
        2: { cellWidth: 90, halign: 'right' },
        3: { cellWidth: 90, halign: 'right' },
        4: { cellWidth: 90, halign: 'right' },
        5: { cellWidth: 90, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 40, right: 40, bottom: 42 }
    });

    var totalPages = doc.getNumberOfPages();
    for (var i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      if (i > 1) {
        var flatRunningX = 40;
        if (flatLogo) {
          try {
            doc.addImage(flatLogo, 'PNG', 40, 13, 14, 14);
            flatRunningX = 58;
          } catch (e) {}
        }
        doc.setFont(fontName, 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor.apply(doc, lender.primaryColor);
        doc.text(docTitle, flatRunningX, 24);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(82, 97, 115);
        doc.text('Ref: ' + refCode, 555, 24, { align: 'right' });
        doc.setDrawColor.apply(doc, lender.borderStroke);
        doc.line(40, 28, 555, 28);
      }
      doc.setDrawColor.apply(doc, lender.borderStroke);
      doc.line(40, 810, 555, 810);
      doc.setFont(fontName, 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      var disclaimerLines = doc.splitTextToSize(MANDATORY_DISCLAIMERS.flat, 430);
      doc.text(disclaimerLines, 40, 819);
      doc.setFont(fontName, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(140, 150, 165);
      doc.text('Page ' + i + ' of ' + totalPages, 555, 822, { align: 'right' });
    }

    doc.save('Loan_Repayment_Schedule_Flat_' + lender.fileSlug + '_' + principal + '.pdf');
  }

  function exportFlatExcel() {
    var d = window.flatCalculatedData;
    if (!d || !d.principal || d.principal <= 0) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var lender = getLenderProfile(window.flatSelectedLender);
    var rows = buildFlatScheduleRows(d);
    var principal = Math.round(d.principal);
    var refCode = 'DLS-' + lender.fileSlug.toUpperCase() + '-' + principal;

    var wsScheduleData = [
      ['Period', 'Opening Principal', 'Flat Interest', 'Principal Component', 'Monthly Payment', 'Remaining Principal']
    ];
    rows.forEach(function (r) {
      wsScheduleData.push(['Month ' + r.period, Math.round(r.open), Math.round(r.flatInt), Math.round(r.prinComp), Math.round(r.payment), Math.round(r.rem)]);
    });

    var wsSummaryData = [
      [lender.name + ' — Flat Rate Loan Repayment Schedule'],
      ['Reference: ' + refCode],
      ['Generated: ' + new Date().toLocaleDateString('en-GB')],
      [],
      ['Parameter', 'Value'],
      ['Lender', lender.name],
      ['Principal Amount', principal],
      ['Flat Interest Rate (% p.a.)', d.rateVal + '%'],
      ['Tenure (Months)', d.totalMonths],
      ['Tenure (Years)', d.tenureYears.toFixed(1)],
      ['Monthly Payment', Math.round(d.monthlyPayment)],
      ['Total Flat Interest', Math.round(d.totalInterest)],
      ['Total Repayment Amount', Math.round(d.totalAmount)],
      [],
      ['Legal Disclaimer:', MANDATORY_DISCLAIMERS.flat]
    ];

    var wb = XLSX.utils.book_new();
    var wsSched = XLSX.utils.aoa_to_sheet(wsScheduleData);
    var wsSumm = XLSX.utils.aoa_to_sheet(wsSummaryData);

    wsSched['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 20 }];
    wsSumm['!cols'] = [{ wch: 28 }, { wch: 35 }];

    XLSX.utils.book_append_sheet(wb, wsSched, 'Repayment Schedule');
    XLSX.utils.book_append_sheet(wb, wsSumm, 'Loan Summary');

    XLSX.writeFile(wb, 'Loan_Repayment_Schedule_Flat_' + lender.fileSlug + '_' + principal + '.xlsx');
  }

  function exportFlatCSV() {
    var d = window.flatCalculatedData;
    if (!d || !d.principal || d.principal <= 0) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var lender = getLenderProfile(window.flatSelectedLender);
    var rows = buildFlatScheduleRows(d);
    var principal = Math.round(d.principal);
    var refCode = 'DLS-' + lender.fileSlug.toUpperCase() + '-' + principal;

    var csvContent = '# LENDER: ' + lender.name + '\n' +
      '# Reference: ' + refCode + '\n' +
      '# Generated: ' + new Date().toISOString() + '\n' +
      '# Disclaimer: ' + MANDATORY_DISCLAIMERS.flat + '\n' +
      'Period,Opening Principal,Flat Interest,Principal Component,Monthly Payment,Remaining Principal\n';

    rows.forEach(function (r) {
      csvContent += 'Month ' + r.period + ',' + Math.round(r.open) + ',' + Math.round(r.flatInt) + ',' + Math.round(r.prinComp) + ',' + Math.round(r.payment) + ',' + Math.round(r.rem) + '\n';
    });

    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Loan_Repayment_Schedule_Flat_' + lender.fileSlug + '_' + principal + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function triggerFlatPrint() {
    var d = window.flatCalculatedData;
    if (!d || !d.principal || d.principal <= 0) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var lender = getLenderProfile(window.flatSelectedLender);
    var rows = buildFlatScheduleRows(d);
    var principal = Math.round(d.principal);
    var refCode = 'DLS-' + lender.fileSlug.toUpperCase() + '-' + principal;

    var printContainer = document.getElementById('repayment-print-section');
    if (!printContainer) return;

    var rowsHtml = '';
    rows.forEach(function (r) {
      rowsHtml += '<tr>' +
        '<td style="text-align:center; padding:5px 8px; border:1px solid ' + lender.hexBorder + ';">Month ' + r.period + '</td>' +
        '<td style="text-align:right; padding:5px 8px; border:1px solid ' + lender.hexBorder + ';">₹' + Math.round(r.open).toLocaleString('en-IN') + '</td>' +
        '<td style="text-align:right; padding:5px 8px; border:1px solid ' + lender.hexBorder + '; color:#c026d3;">₹' + Math.round(r.flatInt).toLocaleString('en-IN') + '</td>' +
        '<td style="text-align:right; padding:5px 8px; border:1px solid ' + lender.hexBorder + ';">₹' + Math.round(r.prinComp).toLocaleString('en-IN') + '</td>' +
        '<td style="text-align:right; padding:5px 8px; border:1px solid ' + lender.hexBorder + '; font-weight:600;">₹' + Math.round(r.payment).toLocaleString('en-IN') + '</td>' +
        '<td style="text-align:right; padding:5px 8px; border:1px solid ' + lender.hexBorder + '; font-weight:700;">₹' + Math.round(r.rem).toLocaleString('en-IN') + '</td>' +
      '</tr>';
    });

    printContainer.innerHTML =
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif; color:#102033; padding:15px 0;">' +
        '<div style="height:6px; background:' + lender.hexPrimary + '; margin-bottom:2px;"></div>' +
        '<div style="height:2px; background:' + lender.hexSecondary + '; margin-bottom:14px;"></div>' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; border-bottom:1px solid ' + lender.hexBorder + '; padding-bottom:12px;">' +
          '<div>' +
            '<h1 style="margin:0; font-size:18pt; font-weight:800; color:' + lender.hexPrimary + '; letter-spacing:0.5px;">' + lender.name + '</h1>' +
            '<h2 style="margin:6px 0 0 0; font-size:13pt; font-weight:700; color:#102033;">Flat Rate Loan Repayment Schedule</h2>' +
          '</div>' +
          '<div style="text-align:right; font-size:8.5pt; color:#526173; line-height:1.5;">' +
            '<div style="font-weight:600; color:#102033;">Reference: ' + refCode + '</div>' +
            '<div>Generated: ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="background:' + lender.hexLightBg + '; border:1px solid ' + lender.hexBorder + '; border-radius:6px; padding:12px 16px; margin-bottom:16px;">' +
          '<div style="font-weight:700; font-size:9.5pt; color:' + lender.hexPrimary + '; margin-bottom:8px; border-bottom:1px solid ' + lender.hexBorder + '; padding-bottom:4px;">LOAN DETAILS &amp; FLAT REPAYMENT SUMMARY</div>' +
          '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; font-size:9pt;">' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Principal Amount:</span><span style="font-weight:700;">₹' + principal.toLocaleString('en-IN') + '</span></div>' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Monthly Payment:</span><span style="font-weight:800; color:' + lender.hexPrimary + ';">₹' + Math.round(d.monthlyPayment).toLocaleString('en-IN') + '</span></div>' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Flat Interest Rate:</span><span style="font-weight:700;">' + d.rateVal + '% p.a.</span></div>' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Total Flat Interest:</span><span style="font-weight:700; color:#c026d3;">₹' + Math.round(d.totalInterest).toLocaleString('en-IN') + '</span></div>' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Loan Tenure:</span><span style="font-weight:700;">' + d.totalMonths + ' Months (' + d.tenureYears.toFixed(1) + ' Years)</span></div>' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Total Repayment:</span><span style="font-weight:800;">₹' + Math.round(d.totalAmount).toLocaleString('en-IN') + '</span></div>' +
          '</div>' +
        '</div>' +
        '<table style="width:100%; border-collapse:collapse; font-size:8.5pt;">' +
          '<thead>' +
            '<tr style="background:' + lender.hexPrimary + '; color:#ffffff;">' +
              '<th style="padding:7px 8px; text-align:center;">Period</th>' +
              '<th style="padding:7px 8px; text-align:right;">Opening Principal</th>' +
              '<th style="padding:7px 8px; text-align:right;">Flat Interest</th>' +
              '<th style="padding:7px 8px; text-align:right;">Principal Component</th>' +
              '<th style="padding:7px 8px; text-align:right;">Monthly Payment</th>' +
              '<th style="padding:7px 8px; text-align:right;">Remaining Principal</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
        '<div style="margin-top:16px; border-top:1px solid ' + lender.hexBorder + '; padding-top:8px; font-size:7pt; color:#64748b; line-height:1.4;">' +
          MANDATORY_DISCLAIMERS.flat +
        '</div>' +
      '</div>';

    window.print();
  }

  // ── 7. Compare Loans Module ───────────────────────────────────────
  function onCompareLenderChange() {
    updateCompareLenderUI();
  }

  function updateCompareLenderUI() {
    var b1 = document.getElementById('compare-bank-1') ? document.getElementById('compare-bank-1').value : '';
    var b2 = document.getElementById('compare-bank-2') ? document.getElementById('compare-bank-2').value : '';
    var l1 = getLenderProfile(b1);
    var l2 = getLenderProfile(b2);

    var opt1Badge = document.getElementById('compare-opt1-badge');
    if (opt1Badge) {
      if (b1) {
        opt1Badge.style.display = 'inline-flex';
        var logoImg1 = l1.faviconBase64 ? '<img src="' + l1.faviconBase64 + '" class="lender-active-logo" alt="' + l1.shortName + '"/>' : '';
        opt1Badge.innerHTML = logoImg1 + '<span>' + l1.shortName + '</span>';
      } else {
        opt1Badge.style.display = 'none';
        opt1Badge.innerHTML = '';
      }
    }

    var opt2Badge = document.getElementById('compare-opt2-badge');
    if (opt2Badge) {
      if (b2) {
        opt2Badge.style.display = 'inline-flex';
        var logoImg2 = l2.faviconBase64 ? '<img src="' + l2.faviconBase64 + '" class="lender-active-logo" alt="' + l2.shortName + '"/>' : '';
        opt2Badge.innerHTML = logoImg2 + '<span>' + l2.shortName + '</span>';
      } else {
        opt2Badge.style.display = 'none';
        opt2Badge.innerHTML = '';
      }
    }

    var badgeText = document.getElementById('compare-export-lender-text');
    if (badgeText) {
      if (b1 && b2) {
        badgeText.textContent = l1.shortName + ' vs ' + l2.shortName;
      } else if (b1) {
        badgeText.textContent = l1.shortName + ' vs Option 2';
      } else if (b2) {
        badgeText.textContent = 'Option 1 vs ' + l2.shortName;
      } else {
        badgeText.textContent = 'Loan Comparison';
      }
    }
  }

  async function exportComparePDF() {
    var jsPDFLib = window.jspdf;
    if (!jsPDFLib || !jsPDFLib.jsPDF) { alert('PDF library not loaded yet.'); return; }
    var cd = window.comparedData;
    if (!cd || !cd.opt1 || !cd.opt2) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var opt1 = cd.opt1;
    var opt2 = cd.opt2;
    var lender1 = getLenderProfile(opt1.b);
    var lender2 = getLenderProfile(opt2.b);
    var betterLender = cd.betterOption === 1 ? lender1 : lender2;
    var refCode = 'DLS-COMPARE-' + Math.round(opt1.p);

    var doc = new jsPDFLib.jsPDF('p', 'pt', 'a4');
    var fontName = 'helvetica';
    var fonts = typeof getPdfFonts === 'function' ? await getPdfFonts() : null;
    if (fonts) {
      try {
        doc.addFileToVFS('segoeui.ttf', fonts.regular);
        doc.addFont('segoeui.ttf', 'SegoeUI', 'normal');
        doc.addFileToVFS('segoeuib.ttf', fonts.bold);
        doc.addFont('segoeuib.ttf', 'SegoeUI', 'bold');
        fontName = 'SegoeUI';
      } catch (e) {}
    }

    var brandNavy = [15, 39, 71];
    var forestTeal = [15, 139, 113];

    doc.setFillColor.apply(doc, brandNavy);
    doc.rect(0, 0, 595, 6, 'F');
    doc.setFillColor.apply(doc, forestTeal);
    doc.rect(0, 6, 595, 2, 'F');

    var compareLogo = (betterLender && (betterLender.faviconBase64 || betterLender.logoBase64)) || (window.LENDER_ASSETS && window.LENDER_ASSETS.dixit && window.LENDER_ASSETS.dixit.logoBase64);
    var compTitleX = 40;
    if (compareLogo) {
      try {
        doc.addImage(compareLogo, 'PNG', 40, 20, 34, 34);
        compTitleX = 84;
      } catch (e) {
        console.warn('Compare PDF logo error:', e);
      }
    }

    doc.setFont(fontName, 'bold');
    doc.setFontSize(16);
    doc.setTextColor.apply(doc, brandNavy);
    doc.text('LOAN COMPARISON', compTitleX, 36);

    doc.setFont(fontName, 'bold');
    doc.setFontSize(12);
    doc.setTextColor(16, 32, 51);
    doc.text('Comparative Analysis: ' + lender1.shortName + ' vs ' + lender2.shortName, compTitleX, 52);

    doc.setFont(fontName, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(82, 97, 115);
    doc.text('Side-by-side metric comparison between both loan options', compTitleX, 66);

    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(16, 32, 51);
    doc.text('Reference: ' + refCode, 555, 42, { align: 'right' });
    doc.setFont(fontName, 'normal');
    doc.setTextColor(82, 97, 115);
    doc.text('Generated: ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), 555, 56, { align: 'right' });

    doc.setDrawColor(217, 227, 239);
    doc.line(40, 84, 555, 84);

    doc.setFillColor(240, 253, 249);
    doc.setDrawColor(15, 139, 113);
    doc.roundedRect(40, 94, 515, 52, 5, 5, 'FD');

    doc.setFont(fontName, 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 139, 113);
    doc.text('Recommendation: Loan Option ' + cd.betterOption + ' (' + betterLender.shortName + ') is financially advantageous', 52, 112);

    doc.setFont(fontName, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text('Choosing Option ' + cd.betterOption + ' saves an estimated ₹' + Math.round(cd.savings).toLocaleString('en-IN') + ' in total borrowing cost over the tenure.', 52, 130);

    var tableBody = [
      ['Loan Amount (Principal)', '₹' + Math.round(opt1.p).toLocaleString('en-IN'), '₹' + Math.round(opt2.p).toLocaleString('en-IN'), '₹' + Math.round(Math.abs(opt1.p - opt2.p)).toLocaleString('en-IN')],
      ['Interest Rate (% p.a.)', opt1.r + '% p.a.', opt2.r + '% p.a.', Math.abs(opt1.r - opt2.r).toFixed(2) + '%'],
      ['Loan Tenure (Months)', opt1.t + ' Months', opt2.t + ' Months', Math.abs(opt1.t - opt2.t) + ' Months'],
      ['Monthly EMI', '₹' + Math.round(opt1.emi).toLocaleString('en-IN'), '₹' + Math.round(opt2.emi).toLocaleString('en-IN'), '₹' + Math.round(cd.emiDiff).toLocaleString('en-IN')],
      ['Total Interest Payable', '₹' + Math.round(opt1.interest).toLocaleString('en-IN'), '₹' + Math.round(opt2.interest).toLocaleString('en-IN'), '₹' + Math.round(cd.interestDiff).toLocaleString('en-IN')],
      ['Total Repayment Amount', '₹' + Math.round(opt1.total).toLocaleString('en-IN'), '₹' + Math.round(opt2.total).toLocaleString('en-IN'), '₹' + Math.round(cd.savings).toLocaleString('en-IN')]
    ];

    doc.autoTable({
      head: [['Loan Parameters', 'Option 1 (' + lender1.shortName + ')', 'Option 2 (' + lender2.shortName + ')', 'Difference']],
      body: tableBody,
      startY: 160,
      theme: 'plain',
      headStyles: {
        fillColor: brandNavy,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        font: fontName,
        fontSize: 9
      },
      styles: {
        fontSize: 8.5,
        cellPadding: 8,
        font: fontName,
        lineColor: [217, 227, 239],
        lineWidth: 0.5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 253]
      },
      columnStyles: {
        0: { cellWidth: 155 },
        1: { cellWidth: 120, halign: 'right' },
        2: { cellWidth: 120, halign: 'right' },
        3: { cellWidth: 120, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 40, right: 40, bottom: 42 }
    });

    var totalPages = doc.getNumberOfPages();
    for (var i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      if (i > 1) {
        var compRunningX = 40;
        if (compareLogo) {
          try {
            doc.addImage(compareLogo, 'PNG', 40, 13, 14, 14);
            compRunningX = 58;
          } catch (e) {}
        }
        doc.setFont(fontName, 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor.apply(doc, brandNavy);
        doc.text('Loan Comparison - ' + lender1.shortName + ' vs ' + lender2.shortName, compRunningX, 24);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(82, 97, 115);
        doc.text('Ref: ' + refCode, 555, 24, { align: 'right' });
        doc.setDrawColor(217, 227, 239);
        doc.line(40, 28, 555, 28);
      }
      doc.setDrawColor(217, 227, 239);
      doc.line(40, 810, 555, 810);
      doc.setFont(fontName, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      var disclaimerLines = doc.splitTextToSize(MANDATORY_DISCLAIMERS.compare, 430);
      doc.text(disclaimerLines, 40, 819);
      doc.setFont(fontName, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(140, 150, 165);
      doc.text('Page ' + i + ' of ' + totalPages, 555, 822, { align: 'right' });
    }

    doc.save('Loan_Comparison_' + lender1.fileSlug + '_' + lender2.fileSlug + '_' + Math.round(opt1.p) + '.pdf');
  }

  function exportCompareExcel() {
    var cd = window.comparedData;
    if (!cd || !cd.opt1 || !cd.opt2) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var opt1 = cd.opt1;
    var opt2 = cd.opt2;
    var lender1 = getLenderProfile(opt1.b);
    var lender2 = getLenderProfile(opt2.b);
    var betterLender = cd.betterOption === 1 ? lender1 : lender2;
    var refCode = 'DLS-COMPARE-' + Math.round(opt1.p);

    var wsData = [
      ['LOAN COMPARISON REPORT'],
      ['Reference: ' + refCode],
      ['Generated: ' + new Date().toLocaleDateString('en-GB')],
      [],
      ['Parameters', 'Option 1 (' + lender1.shortName + ')', 'Option 2 (' + lender2.shortName + ')', 'Difference'],
      ['Loan Amount (Principal)', Math.round(opt1.p), Math.round(opt2.p), Math.round(Math.abs(opt1.p - opt2.p))],
      ['Interest Rate (% per annum)', opt1.r + '%', opt2.r + '%', Math.abs(opt1.r - opt2.r).toFixed(2) + '%'],
      ['Tenure (Months)', opt1.t, opt2.t, Math.abs(opt1.t - opt2.t)],
      ['Monthly EMI', Math.round(opt1.emi), Math.round(opt2.emi), Math.round(cd.emiDiff)],
      ['Total Interest Payable', Math.round(opt1.interest), Math.round(opt2.interest), Math.round(cd.interestDiff)],
      ['Total Repayment Amount', Math.round(opt1.total), Math.round(opt2.total), Math.round(cd.savings)],
      [],
      ['Recommendation: Option ' + cd.betterOption + ' (' + betterLender.shortName + ') is recommended — saves ₹' + Math.round(cd.savings).toLocaleString('en-IN') + ' overall.'],
      [],
      ['Legal Disclaimer:', MANDATORY_DISCLAIMERS.compare]
    ];

    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Loan Comparison');
    XLSX.writeFile(wb, 'Loan_Comparison_' + lender1.fileSlug + '_' + lender2.fileSlug + '_' + Math.round(opt1.p) + '.xlsx');
  }

  function exportCompareCSV() {
    var cd = window.comparedData;
    if (!cd || !cd.opt1 || !cd.opt2) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var opt1 = cd.opt1;
    var opt2 = cd.opt2;
    var lender1 = getLenderProfile(opt1.b);
    var lender2 = getLenderProfile(opt2.b);
    var betterLender = cd.betterOption === 1 ? lender1 : lender2;
    var refCode = 'DLS-COMPARE-' + Math.round(opt1.p);

    var csvContent = '# LOAN COMPARISON REPORT\n' +
      '# Option 1 Lender: ' + lender1.shortName + '\n' +
      '# Option 2 Lender: ' + lender2.shortName + '\n' +
      '# Reference: ' + refCode + '\n' +
      '# Recommendation: Option ' + cd.betterOption + ' (' + betterLender.shortName + ') saves ₹' + Math.round(cd.savings) + '\n' +
      '# Disclaimer: ' + MANDATORY_DISCLAIMERS.compare + '\n' +
      'Parameter,Option 1 (' + lender1.shortName + '),Option 2 (' + lender2.shortName + '),Difference\n' +
      'Principal Amount,' + Math.round(opt1.p) + ',' + Math.round(opt2.p) + ',' + Math.round(Math.abs(opt1.p - opt2.p)) + '\n' +
      'Interest Rate (% p.a.),' + opt1.r + '%,' + opt2.r + '%,' + Math.abs(opt1.r - opt2.r).toFixed(2) + '%\n' +
      'Loan Tenure (Months),' + opt1.t + ',' + opt2.t + ',' + Math.abs(opt1.t - opt2.t) + '\n' +
      'Monthly EMI,' + Math.round(opt1.emi) + ',' + Math.round(opt2.emi) + ',' + Math.round(cd.emiDiff) + '\n' +
      'Total Interest Payable,' + Math.round(opt1.interest) + ',' + Math.round(opt2.interest) + ',' + Math.round(cd.interestDiff) + '\n' +
      'Total Repayment Cost,' + Math.round(opt1.total) + ',' + Math.round(opt2.total) + ',' + Math.round(cd.savings) + '\n';

    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Loan_Comparison_' + lender1.fileSlug + '_' + lender2.fileSlug + '_' + Math.round(opt1.p) + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function triggerComparePrint() {
    var cd = window.comparedData;
    if (!cd || !cd.opt1 || !cd.opt2) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var opt1 = cd.opt1;
    var opt2 = cd.opt2;
    var lender1 = getLenderProfile(opt1.b);
    var lender2 = getLenderProfile(opt2.b);
    var betterLender = cd.betterOption === 1 ? lender1 : lender2;
    var refCode = 'DLS-COMPARE-' + Math.round(opt1.p);

    var printContainer = document.getElementById('repayment-print-section');
    if (!printContainer) return;

    printContainer.innerHTML =
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif; color:#102033; padding:15px 0;">' +
        '<div style="height:6px; background:#0f2747; margin-bottom:2px;"></div>' +
        '<div style="height:2px; background:#0f8b71; margin-bottom:14px;"></div>' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; border-bottom:1px solid #d9e3ef; padding-bottom:12px;">' +
          '<div>' +
            '<h1 style="margin:0; font-size:18pt; font-weight:800; color:#0f2747;">LOAN COMPARISON</h1>' +
            '<h2 style="margin:6px 0 0 0; font-size:12pt; font-weight:700; color:#102033;">Comparative Analysis: ' + lender1.shortName + ' vs ' + lender2.shortName + '</h2>' +
          '</div>' +
          '<div style="text-align:right; font-size:8.5pt; color:#526173; line-height:1.5;">' +
            '<div style="font-weight:600; color:#102033;">Reference: ' + refCode + '</div>' +
            '<div>Generated: ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="background:#f0fdf9; border:1px solid #0f8b71; border-radius:6px; padding:12px 16px; margin-bottom:16px;">' +
          '<div style="font-weight:700; font-size:10pt; color:#0f8b71; margin-bottom:4px;">Recommendation: Loan Option ' + cd.betterOption + ' (' + betterLender.shortName + ') is financially advantageous</div>' +
          '<div style="font-size:9pt; color:#334155;">Choosing Option ' + cd.betterOption + ' saves an estimated ₹' + Math.round(cd.savings).toLocaleString('en-IN') + ' in total borrowing cost over the tenure.</div>' +
        '</div>' +
        '<table style="width:100%; border-collapse:collapse; font-size:9pt;">' +
          '<thead>' +
            '<tr style="background:#0f2747; color:#ffffff;">' +
              '<th style="padding:8px 10px; text-align:left;">Parameters</th>' +
              '<th style="padding:8px 10px; text-align:right;">Option 1 (' + lender1.shortName + ')</th>' +
              '<th style="padding:8px 10px; text-align:right;">Option 2 (' + lender2.shortName + ')</th>' +
              '<th style="padding:8px 10px; text-align:right;">Difference</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            '<tr><td style="padding:7px 10px; border:1px solid #d9e3ef;">Loan Amount (Principal)</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef;">₹' + Math.round(opt1.p).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef;">₹' + Math.round(opt2.p).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef; font-weight:600;">₹' + Math.round(Math.abs(opt1.p - opt2.p)).toLocaleString('en-IN') + '</td></tr>' +
            '<tr><td style="padding:7px 10px; border:1px solid #d9e3ef;">Interest Rate (% p.a.)</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef;">' + opt1.r + '% p.a.</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef;">' + opt2.r + '% p.a.</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef; font-weight:600;">' + Math.abs(opt1.r - opt2.r).toFixed(2) + '%</td></tr>' +
            '<tr><td style="padding:7px 10px; border:1px solid #d9e3ef;">Loan Tenure (Months)</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef;">' + opt1.t + ' Months</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef;">' + opt2.t + ' Months</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef; font-weight:600;">' + Math.abs(opt1.t - opt2.t) + ' Months</td></tr>' +
            '<tr><td style="padding:7px 10px; border:1px solid #d9e3ef; font-weight:700;">Monthly EMI</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef; font-weight:700;">₹' + Math.round(opt1.emi).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef; font-weight:700;">₹' + Math.round(opt2.emi).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef; font-weight:700; color:#0f8b71;">₹' + Math.round(cd.emiDiff).toLocaleString('en-IN') + '</td></tr>' +
            '<tr><td style="padding:7px 10px; border:1px solid #d9e3ef;">Total Interest Payable</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef;">₹' + Math.round(opt1.interest).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef;">₹' + Math.round(opt2.interest).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef; font-weight:600;">₹' + Math.round(cd.interestDiff).toLocaleString('en-IN') + '</td></tr>' +
            '<tr style="background:#f8fafc;"><td style="padding:7px 10px; border:1px solid #d9e3ef; font-weight:800;">Total Repayment Amount</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef; font-weight:800;">₹' + Math.round(opt1.total).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef; font-weight:800;">₹' + Math.round(opt2.total).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:7px 10px; border:1px solid #d9e3ef; font-weight:800; color:#0f8b71;">₹' + Math.round(cd.savings).toLocaleString('en-IN') + '</td></tr>' +
          '</tbody>' +
        '</table>' +
        '<div style="margin-top:16px; border-top:1px solid #d9e3ef; padding-top:8px; font-size:7pt; color:#64748b; line-height:1.4;">' +
          MANDATORY_DISCLAIMERS.compare +
        '</div>' +
      '</div>';

    window.print();
  }

  // ── 8. Borrower Income & Eligibility Calculator Module ─────────────
  var eligTenureUnit = 'years';
  var eligFoir = null;
  var eligSelectedLender = '';
  var eligCalculatedData = null;

  function onEligLenderChange(val) {
    eligSelectedLender = val || '';
    window.eligSelectedLender = eligSelectedLender;
    updateEligLenderUI();
  }

  function updateEligLenderUI() {
    var lender = getLenderProfile(eligSelectedLender);
    var badgeEl = document.getElementById('elig-selected-lender-badge');
    var tableBadgeText = document.getElementById('elig-export-lender-text');
    var tableBadgeIcon = document.getElementById('elig-export-lender-icon');
    var tableBadgeEl = document.getElementById('elig-export-lender-badge');

    if (badgeEl) {
      if (eligSelectedLender) {
        badgeEl.style.display = 'inline-flex';
        badgeEl.style.color = lender.hexPrimary;
        var logoImg = lender.faviconBase64 ? '<img src="' + lender.faviconBase64 + '" class="lender-active-logo" alt="' + lender.shortName + '"/>' : '<i class="fas fa-building-columns" style="margin-right:5px;"></i>';
        badgeEl.innerHTML = logoImg + '<span>' + lender.shortName + '</span>';
      } else {
        badgeEl.style.display = 'none';
        badgeEl.innerHTML = '';
      }
    }
    if (tableBadgeText) {
      tableBadgeText.textContent = eligSelectedLender ? lender.shortName : 'Dixit Lending Solution';
    }
    if (tableBadgeIcon) {
      tableBadgeIcon.style.color = lender.hexPrimary;
    }
    if (tableBadgeEl) {
      if (eligSelectedLender) {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        tableBadgeEl.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.14)' : lender.hexBorder;
        tableBadgeEl.style.background = isDark ? 'rgba(14, 21, 30, 0.95)' : lender.hexLightBg;
        tableBadgeEl.style.color = isDark ? '#f8fafc' : lender.hexPrimary;
      } else {
        tableBadgeEl.style.borderColor = 'var(--border)';
        tableBadgeEl.style.background = 'var(--bg-secondary)';
        tableBadgeEl.style.color = 'var(--text-secondary)';
      }
    }
  }

  function setEligibilityTenureUnit(unit) {
    var tenureInput = document.getElementById('input-elig-tenure');
    if (tenureInput && tenureInput.value !== '' && eligTenureUnit !== unit) {
      var curVal = parseFloat(tenureInput.value);
      if (!isNaN(curVal) && curVal > 0) {
        if (unit === 'months') {
          tenureInput.value = Math.round(curVal * 12);
        } else {
          var yrs = curVal / 12;
          tenureInput.value = Number.isInteger(yrs) ? yrs : parseFloat(yrs.toFixed(1));
        }
      }
    }
    eligTenureUnit = unit;
    var btnY = document.getElementById('btn-elig-years');
    var btnM = document.getElementById('btn-elig-months');
    if (btnY && btnM) {
      btnY.classList.toggle('active', unit === 'years');
      btnM.classList.toggle('active', unit === 'months');
    }
  }

  function setEligibilityFoir(foirVal) {
    eligFoir = parseFloat(foirVal);
    if (isNaN(eligFoir)) eligFoir = null;
    document.querySelectorAll('#elig-foir-pills .preset-pill').forEach(function (p) {
      p.classList.toggle('active', parseFloat(p.getAttribute('data-foir')) === eligFoir);
    });
    var errFoir = document.getElementById('err-elig-foir');
    if (errFoir) errFoir.style.display = 'none';
  }

  function calculateEligibility() {
    var errIncome = document.getElementById('err-elig-income');
    var errFoir = document.getElementById('err-elig-foir');
    var errRate = document.getElementById('err-elig-rate');
    var errTenure = document.getElementById('err-elig-tenure');
    var banner = document.getElementById('elig-banner');

    if (errIncome) errIncome.style.display = 'none';
    if (errFoir) errFoir.style.display = 'none';
    if (errRate) errRate.style.display = 'none';
    if (errTenure) errTenure.style.display = 'none';
    if (banner) banner.style.display = 'none';

    var incomeInput = document.getElementById('input-elig-income');
    var existingEmiInput = document.getElementById('input-elig-existing-emi');
    var rateInput = document.getElementById('input-elig-rate');
    var tenureInputEl = document.getElementById('input-elig-tenure');

    var income = parseINR(incomeInput ? incomeInput.value : '');
    var existingEmi = parseINR(existingEmiInput ? existingEmiInput.value : '') || 0;
    var rate = parseFloat(rateInput ? rateInput.value : '');
    var tenureInput = parseFloat(tenureInputEl ? tenureInputEl.value : '');

    var hasError = false;

    if (!income || income <= 0) {
      if (errIncome) {
        errIncome.textContent = 'Please enter a valid monthly net income.';
        errIncome.style.display = 'block';
      }
      hasError = true;
    }

    if (!eligFoir || isNaN(eligFoir) || eligFoir <= 0) {
      if (errFoir) {
        errFoir.textContent = 'Please select a FOIR benchmark percentage (e.g. 50%).';
        errFoir.style.display = 'block';
      }
      hasError = true;
    }

    if (isNaN(rate) || rate <= 0 || rate > 50) {
      if (errRate) {
        errRate.textContent = 'Please enter a valid annual interest rate (0.1% - 50%).';
        errRate.style.display = 'block';
      }
      hasError = true;
    }

    if (isNaN(tenureInput) || tenureInput <= 0) {
      if (errTenure) {
        errTenure.textContent = 'Please enter a valid tenure greater than 0.';
        errTenure.style.display = 'block';
      }
      hasError = true;
    }

    if (hasError) return;

    var tenureMonths = eligTenureUnit === 'years' ? Math.round(tenureInput * 12) : Math.round(tenureInput);
    if (tenureMonths > 360) {
      if (errTenure) {
        errTenure.textContent = 'Tenure cannot exceed 30 years (360 months).';
        errTenure.style.display = 'block';
      }
      return;
    }

    var maxEmiPermissible = (income * eligFoir) / 100;
    var availableNewEmi = Math.max(0, maxEmiPermissible - existingEmi);

    var resAmountEl = document.getElementById('res-elig-amount');
    var resEmiEl = document.getElementById('res-elig-emi');
    var resInterestEl = document.getElementById('res-elig-interest');
    var resFoirEl = document.getElementById('res-elig-foir');
    var resultsWrap = document.getElementById('elig-results-wrapper');
    var eligPh = document.getElementById('elig-placeholder');

    if (availableNewEmi <= 0) {
      if (resAmountEl) resAmountEl.textContent = '₹0';
      if (resEmiEl) resEmiEl.textContent = '₹0';
      if (resInterestEl) resInterestEl.textContent = '₹0';
      if (resFoirEl) resFoirEl.textContent = ((existingEmi / income) * 100).toFixed(1) + '%';

      if (banner) {
        banner.className = 'hub-banner warning';
        banner.innerHTML = '<i class="fas fa-triangle-exclamation"></i><div>' +
          '<div class="hub-banner-title">High Debt-to-Income Obligation</div>' +
          'Existing EMIs (' + formatINR(existingEmi) + ') equal or exceed the maximum permissible FOIR capacity (' +
          eligFoir + '% = ' + formatINR(maxEmiPermissible) + '). Reduce existing debts or add a co-applicant to qualify.</div>';
        banner.style.display = 'flex';
      }
      if (resultsWrap) resultsWrap.style.display = 'block';
      if (eligPh) eligPh.style.display = 'none';
      updateEligibilityBreakdown(income, maxEmiPermissible, existingEmi, 0, 0, 0, tenureMonths);
      eligCalculatedData = null;
      window.eligCalculatedData = null;
      return;
    }

    var eligiblePrincipal = calculatePresentValue(availableNewEmi, rate, tenureMonths);
    var roundedPrincipal = Math.floor(eligiblePrincipal / 1000) * 1000;
    if (roundedPrincipal < 10000) roundedPrincipal = Math.round(eligiblePrincipal);

    var totalRepayment = availableNewEmi * tenureMonths;
    var totalInterest = Math.max(0, totalRepayment - roundedPrincipal);
    var totalObligationRatio = ((existingEmi + availableNewEmi) / income) * 100;

    if (resAmountEl) resAmountEl.textContent = formatINR(roundedPrincipal);
    if (resEmiEl) resEmiEl.textContent = formatINR(availableNewEmi) + ' / mo';
    if (resInterestEl) resInterestEl.textContent = formatINR(totalInterest);
    if (resFoirEl) resFoirEl.textContent = totalObligationRatio.toFixed(1) + '%';

    var lender = getLenderProfile(eligSelectedLender);

    if (banner) {
      banner.className = 'hub-banner positive';
      banner.innerHTML = '<i class="fas fa-circle-check"></i><div>' +
        '<div class="hub-banner-title">Estimated Eligible Loan Amount: ' + formatINR(roundedPrincipal) + '</div>' +
        'Based on ' + eligFoir + '% FOIR, you can borrow an estimated <strong>' + formatINR(roundedPrincipal) +
        '</strong> at ' + rate + '% p.a. for ' + (eligTenureUnit === 'years' ? (tenureInput + ' years') : (tenureMonths + ' months')) +
        ' with a monthly EMI capacity of <strong>' + formatINR(availableNewEmi) + '</strong> (' + lender.shortName + ').</div>';
      banner.style.display = 'flex';
    }

    if (resultsWrap) resultsWrap.style.display = 'block';
    if (eligPh) eligPh.style.display = 'none';
    updateEligibilityBreakdown(income, maxEmiPermissible, existingEmi, availableNewEmi, roundedPrincipal, totalInterest, tenureMonths);

    eligCalculatedData = {
      income: income,
      existingEmi: existingEmi,
      foir: eligFoir,
      rate: rate,
      tenureMonths: tenureMonths,
      maxPermissible: maxEmiPermissible,
      availableNewEmi: availableNewEmi,
      roundedPrincipal: roundedPrincipal,
      totalInterest: totalInterest,
      totalRepayment: totalRepayment,
      debtRatio: totalObligationRatio,
      lender: lender
    };
    window.eligCalculatedData = eligCalculatedData;
  }

  function updateEligibilityBreakdown(income, maxPerm, existingEmi, newEmi, principal, interest, months) {
    var tbl = document.getElementById('elig-breakdown-tbody');
    if (!tbl) return;
    tbl.innerHTML =
      '<tr><td>Net Monthly Take-Home Income</td><td class="text-right"><strong>' + formatINR(income) + '</strong></td></tr>' +
      '<tr><td>Permissible Obligation Limit (' + eligFoir + '% FOIR)</td><td class="text-right">' + formatINR(maxPerm) + '</td></tr>' +
      '<tr><td>Less: Existing Monthly Commitments</td><td class="text-right hub-val-negative">- ' + formatINR(existingEmi) + '</td></tr>' +
      '<tr><td>Net Available Capacity for New EMI</td><td class="text-right hub-val-positive"><strong>' + formatINR(newEmi) + '</strong></td></tr>' +
      '<tr><td>Estimated Eligible Principal (Sanction Limit)</td><td class="text-right hub-val-highlight"><strong>' + formatINR(principal) + '</strong></td></tr>' +
      '<tr><td>Estimated Total Interest over ' + months + ' Months</td><td class="text-right">' + formatINR(interest) + '</td></tr>' +
      '<tr><td>Total Amount Payable</td><td class="text-right"><strong>' + formatINR(principal + interest) + '</strong></td></tr>';
  }

  function resetEligibility() {
    var form = document.getElementById('elig-form');
    if (form) form.reset();

    var ids = ['input-elig-income', 'input-elig-existing-emi', 'input-elig-rate', 'input-elig-tenure'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });

    var selectLenderEl = document.getElementById('select-elig-lender');
    if (selectLenderEl) selectLenderEl.value = '';
    eligSelectedLender = '';
    window.eligSelectedLender = '';
    updateEligLenderUI();

    setEligibilityTenureUnit('years');
    eligFoir = null;
    document.querySelectorAll('#elig-foir-pills .preset-pill').forEach(function (p) {
      p.classList.remove('active');
    });

    ['err-elig-income', 'err-elig-foir', 'err-elig-rate', 'err-elig-tenure'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    var resultsWrap = document.getElementById('elig-results-wrapper');
    if (resultsWrap) resultsWrap.style.display = 'none';
    var eligPh = document.getElementById('elig-placeholder');
    if (eligPh) eligPh.style.display = 'block';
    var banner = document.getElementById('elig-banner');
    if (banner) banner.style.display = 'none';

    var resAmount = document.getElementById('res-elig-amount');
    if (resAmount) resAmount.textContent = '₹0';
    var resEmi = document.getElementById('res-elig-emi');
    if (resEmi) resEmi.textContent = '₹0';
    var resInterest = document.getElementById('res-elig-interest');
    if (resInterest) resInterest.textContent = '₹0';
    var resFoir = document.getElementById('res-elig-foir');
    if (resFoir) resFoir.textContent = '0.0%';

    eligCalculatedData = null;
    window.eligCalculatedData = null;
  }

  function prefillEmiFromEligibility() {
    var ed = window.eligCalculatedData;
    if (!ed || !ed.roundedPrincipal || ed.roundedPrincipal <= 0) return;

    switchHubTab('emi');
    if (typeof switchTab === 'function') switchTab('reducing');

    var mainPrincipal = document.getElementById('input-principal');
    var mainRate = document.getElementById('input-rate');
    var mainTenure = document.getElementById('input-tenure');
    var mainLender = document.getElementById('select-lender');

    if (mainPrincipal) mainPrincipal.value = formatNumberWithCommas(ed.roundedPrincipal);
    if (mainRate) mainRate.value = ed.rate;
    if (mainTenure) {
      mainTenure.value = eligTenureUnit === 'years' ? (ed.tenureMonths / 12) : ed.tenureMonths;
      if (typeof setTenureUnit === 'function') setTenureUnit(eligTenureUnit);
    }
    if (mainLender && eligSelectedLender) {
      mainLender.value = eligSelectedLender;
      if (typeof onLenderChange === 'function') onLenderChange(eligSelectedLender);
    }

    if (typeof calculateEMI === 'function') calculateEMI();
  }

  async function exportEligPDF() {
    var jsPDFLib = window.jspdf;
    if (!jsPDFLib || !jsPDFLib.jsPDF) { alert('PDF library not loaded yet.'); return; }
    var ed = window.eligCalculatedData;
    if (!ed || !ed.roundedPrincipal || ed.roundedPrincipal <= 0) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var lender = getLenderProfile(window.eligSelectedLender);
    var refCode = 'DLS-' + lender.fileSlug.toUpperCase() + '-' + Math.round(ed.roundedPrincipal);

    var doc = new jsPDFLib.jsPDF('p', 'pt', 'a4');
    var fontName = 'helvetica';
    var fonts = typeof getPdfFonts === 'function' ? await getPdfFonts() : null;
    if (fonts) {
      try {
        doc.addFileToVFS('segoeui.ttf', fonts.regular);
        doc.addFont('segoeui.ttf', 'SegoeUI', 'normal');
        doc.addFileToVFS('segoeuib.ttf', fonts.bold);
        doc.addFont('segoeuib.ttf', 'SegoeUI', 'bold');
        fontName = 'SegoeUI';
      } catch (e) {}
    }

    doc.setFillColor.apply(doc, lender.primaryColor);
    doc.rect(0, 0, 595, 6, 'F');
    doc.setFillColor.apply(doc, lender.secondaryColor);
    doc.rect(0, 6, 595, 2, 'F');

    var eligLogo = lender.faviconBase64 || lender.logoBase64;
    var eligTitleX = 40;
    if (eligLogo) {
      try {
        doc.addImage(eligLogo, 'PNG', 40, 20, 34, 34);
        eligTitleX = 84;
      } catch (e) {
        console.warn('Elig PDF logo error:', e);
      }
    }

    doc.setFont(fontName, 'bold');
    doc.setFontSize(16);
    doc.setTextColor.apply(doc, lender.primaryColor);
    doc.text(lender.name, eligTitleX, 36);

    doc.setFont(fontName, 'bold');
    doc.setFontSize(13);
    doc.setTextColor(16, 32, 51);
    doc.text('Loan Eligibility Assessment', eligTitleX, 52);

    doc.setFont(fontName, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(82, 97, 115);
    doc.text('Borrower income evaluation, debt-to-income benchmark, and borrowing capacity', eligTitleX, 66);

    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(16, 32, 51);
    doc.text('Reference: ' + refCode, 555, 42, { align: 'right' });
    doc.setFont(fontName, 'normal');
    doc.setTextColor(82, 97, 115);
    doc.text('Generated: ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), 555, 56, { align: 'right' });

    doc.setDrawColor.apply(doc, lender.borderStroke);
    doc.line(40, 84, 555, 84);

    doc.setFillColor.apply(doc, lender.lightBg);
    doc.setDrawColor.apply(doc, lender.borderStroke);
    doc.roundedRect(40, 94, 515, 78, 5, 5, 'FD');

    doc.setFont(fontName, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor.apply(doc, lender.primaryColor);
    doc.text('BORROWER CAPACITY & UNDERWRITING SUMMARY', 52, 110);

    doc.setFont(fontName, 'normal'); doc.setFontSize(8.5); doc.setTextColor(82, 97, 115);
    doc.text('Net Monthly Income:', 52, 126);
    doc.setFont(fontName, 'bold'); doc.setTextColor(16, 32, 51);
    doc.text('₹' + Math.round(ed.income).toLocaleString('en-IN'), 160, 126);

    doc.setFont(fontName, 'normal'); doc.setTextColor(82, 97, 115);
    doc.text('Existing Obligations:', 52, 140);
    doc.setFont(fontName, 'bold'); doc.setTextColor(16, 32, 51);
    doc.text('₹' + Math.round(ed.existingEmi).toLocaleString('en-IN'), 160, 140);

    doc.setFont(fontName, 'normal'); doc.setTextColor(82, 97, 115);
    doc.text('FOIR Benchmark:', 52, 154);
    doc.setFont(fontName, 'bold'); doc.setTextColor(16, 32, 51);
    doc.text(ed.foir + '% FOIR', 160, 154);

    doc.setFont(fontName, 'normal'); doc.setTextColor(82, 97, 115);
    doc.text('Eligible Loan Amount:', 320, 126);
    doc.setFont(fontName, 'bold'); doc.setTextColor.apply(doc, lender.primaryColor);
    doc.text('₹' + Math.round(ed.roundedPrincipal).toLocaleString('en-IN'), 440, 126);

    doc.setFont(fontName, 'normal'); doc.setTextColor(82, 97, 115);
    doc.text('Affordable Monthly EMI:', 320, 140);
    doc.setFont(fontName, 'bold'); doc.setTextColor(15, 139, 113);
    doc.text('₹' + Math.round(ed.availableNewEmi).toLocaleString('en-IN') + ' / mo', 440, 140);

    doc.setFont(fontName, 'normal'); doc.setTextColor(82, 97, 115);
    doc.text('Total Debt Obligation:', 320, 154);
    doc.setFont(fontName, 'bold'); doc.setTextColor(16, 32, 51);
    doc.text(ed.debtRatio.toFixed(1) + '%', 440, 154);

    var tableBody = [
      ['Net Monthly Take-Home Income', '₹' + Math.round(ed.income).toLocaleString('en-IN')],
      ['Permissible Obligation Limit (' + ed.foir + '% FOIR)', '₹' + Math.round(ed.maxPermissible).toLocaleString('en-IN')],
      ['Less: Existing Monthly Commitments', '- ₹' + Math.round(ed.existingEmi).toLocaleString('en-IN')],
      ['Net Available Capacity for New EMI', '₹' + Math.round(ed.availableNewEmi).toLocaleString('en-IN')],
      ['Estimated Eligible Principal (Sanction Limit)', '₹' + Math.round(ed.roundedPrincipal).toLocaleString('en-IN')],
      ['Estimated Total Interest over ' + ed.tenureMonths + ' Months', '₹' + Math.round(ed.totalInterest).toLocaleString('en-IN')],
      ['Total Amount Payable', '₹' + Math.round(ed.totalRepayment).toLocaleString('en-IN')]
    ];

    doc.autoTable({
      head: [['Underwriting Parameter', 'Calculated Assessment (₹)']],
      body: tableBody,
      startY: 184,
      theme: 'plain',
      headStyles: {
        fillColor: lender.primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        font: fontName,
        fontSize: 9
      },
      styles: {
        fontSize: 8.5,
        cellPadding: 7,
        font: fontName,
        lineColor: lender.borderStroke,
        lineWidth: 0.5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 253]
      },
      columnStyles: {
        0: { cellWidth: 350 },
        1: { cellWidth: 165, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 40, right: 40, bottom: 42 }
    });

    var totalPages = doc.getNumberOfPages();
    for (var i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor.apply(doc, lender.borderStroke);
      doc.line(40, 810, 555, 810);
      doc.setFont(fontName, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      var disclaimerLines = doc.splitTextToSize(MANDATORY_DISCLAIMERS.eligibility, 430);
      doc.text(disclaimerLines, 40, 819);
      doc.setFont(fontName, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(140, 150, 165);
      doc.text('Page ' + i + ' of ' + totalPages, 555, 822, { align: 'right' });
    }

    doc.save('Loan_Eligibility_Assessment_' + lender.fileSlug + '_' + Math.round(ed.roundedPrincipal) + '.pdf');
  }

  function exportEligExcel() {
    var ed = window.eligCalculatedData;
    if (!ed || !ed.roundedPrincipal || ed.roundedPrincipal <= 0) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var lender = getLenderProfile(window.eligSelectedLender);
    var refCode = 'DLS-' + lender.fileSlug.toUpperCase() + '-' + Math.round(ed.roundedPrincipal);

    var wsData = [
      [lender.name + ' — Loan Eligibility Assessment'],
      ['Reference: ' + refCode],
      ['Generated: ' + new Date().toLocaleDateString('en-GB')],
      [],
      ['Underwriting Parameter', 'Assessed Value'],
      ['Selected Bank / NBFC', lender.name],
      ['Net Monthly Take-Home Income', Math.round(ed.income)],
      ['Existing Monthly Obligations', Math.round(ed.existingEmi)],
      ['FOIR Benchmark (%)', ed.foir + '%'],
      ['Permissible Obligation Limit', Math.round(ed.maxPermissible)],
      ['Net Available Monthly EMI Capacity', Math.round(ed.availableNewEmi)],
      ['Interest Rate (% p.a.)', ed.rate + '%'],
      ['Desired Tenure (Months)', ed.tenureMonths],
      ['Estimated Eligible Loan Amount (Sanction Limit)', Math.round(ed.roundedPrincipal)],
      ['Estimated Total Interest', Math.round(ed.totalInterest)],
      ['Total Amount Payable', Math.round(ed.totalRepayment)],
      ['Total Debt-to-Income Ratio (FOIR)', ed.debtRatio.toFixed(1) + '%'],
      [],
      ['Legal Disclaimer:', MANDATORY_DISCLAIMERS.eligibility]
    ];

    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 38 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Eligibility Assessment');
    XLSX.writeFile(wb, 'Loan_Eligibility_Assessment_' + lender.fileSlug + '_' + Math.round(ed.roundedPrincipal) + '.xlsx');
  }

  function exportEligCSV() {
    var ed = window.eligCalculatedData;
    if (!ed || !ed.roundedPrincipal || ed.roundedPrincipal <= 0) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var lender = getLenderProfile(window.eligSelectedLender);
    var refCode = 'DLS-' + lender.fileSlug.toUpperCase() + '-' + Math.round(ed.roundedPrincipal);

    var csvContent = '# LENDER: ' + lender.name + '\n' +
      '# Reference: ' + refCode + '\n' +
      '# Assessment: Eligible Principal ₹' + Math.round(ed.roundedPrincipal) + '\n' +
      '# Monthly EMI Capacity: ₹' + Math.round(ed.availableNewEmi) + '\n' +
      '# Disclaimer: ' + MANDATORY_DISCLAIMERS.eligibility + '\n' +
      'Parameter,Value\n' +
      'Net Monthly Take-Home Income,' + Math.round(ed.income) + '\n' +
      'Existing Monthly Obligations,' + Math.round(ed.existingEmi) + '\n' +
      'FOIR Benchmark,' + ed.foir + '%\n' +
      'Permissible Obligation Limit,' + Math.round(ed.maxPermissible) + '\n' +
      'Net Available Capacity for New EMI,' + Math.round(ed.availableNewEmi) + '\n' +
      'Estimated Eligible Principal (Sanction Limit),' + Math.round(ed.roundedPrincipal) + '\n' +
      'Interest Rate (% p.a.),' + ed.rate + '%\n' +
      'Desired Tenure (Months),' + ed.tenureMonths + '\n' +
      'Estimated Total Interest,' + Math.round(ed.totalInterest) + '\n' +
      'Total Amount Payable,' + Math.round(ed.totalRepayment) + '\n' +
      'Total Debt Ratio (FOIR),' + ed.debtRatio.toFixed(1) + '%\n';

    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Loan_Eligibility_Assessment_' + lender.fileSlug + '_' + Math.round(ed.roundedPrincipal) + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function triggerEligPrint() {
    var ed = window.eligCalculatedData;
    if (!ed || !ed.roundedPrincipal || ed.roundedPrincipal <= 0) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var lender = getLenderProfile(window.eligSelectedLender);
    var refCode = 'DLS-' + lender.fileSlug.toUpperCase() + '-' + Math.round(ed.roundedPrincipal);

    var printContainer = document.getElementById('repayment-print-section');
    if (!printContainer) return;

    printContainer.innerHTML =
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif; color:#102033; padding:15px 0;">' +
        '<div style="height:6px; background:' + lender.hexPrimary + '; margin-bottom:2px;"></div>' +
        '<div style="height:2px; background:' + lender.hexSecondary + '; margin-bottom:14px;"></div>' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; border-bottom:1px solid ' + lender.hexBorder + '; padding-bottom:12px;">' +
          '<div>' +
            '<h1 style="margin:0; font-size:18pt; font-weight:800; color:' + lender.hexPrimary + '; letter-spacing:0.5px;">' + lender.name + '</h1>' +
            '<h2 style="margin:6px 0 0 0; font-size:13pt; font-weight:700; color:#102033;">Loan Eligibility Assessment</h2>' +
          '</div>' +
          '<div style="text-align:right; font-size:8.5pt; color:#526173; line-height:1.5;">' +
            '<div style="font-weight:600; color:#102033;">Reference: ' + refCode + '</div>' +
            '<div>Generated: ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="background:' + lender.hexLightBg + '; border:1px solid ' + lender.hexBorder + '; border-radius:6px; padding:12px 16px; margin-bottom:16px;">' +
          '<div style="font-weight:700; font-size:9.5pt; color:' + lender.hexPrimary + '; margin-bottom:8px; border-bottom:1px solid ' + lender.hexBorder + '; padding-bottom:4px;">BORROWER CAPACITY &amp; UNDERWRITING SUMMARY</div>' +
          '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; font-size:9pt;">' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Net Monthly Income:</span><span style="font-weight:700;">₹' + Math.round(ed.income).toLocaleString('en-IN') + '</span></div>' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Eligible Loan Amount:</span><span style="font-weight:800; color:' + lender.hexPrimary + ';">₹' + Math.round(ed.roundedPrincipal).toLocaleString('en-IN') + '</span></div>' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Existing Commitments:</span><span style="font-weight:700;">₹' + Math.round(ed.existingEmi).toLocaleString('en-IN') + '</span></div>' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Affordable Monthly EMI:</span><span style="font-weight:700; color:#0f8b71;">₹' + Math.round(ed.availableNewEmi).toLocaleString('en-IN') + ' / mo</span></div>' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">FOIR Benchmark:</span><span style="font-weight:700;">' + ed.foir + '%</span></div>' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Total Debt Ratio:</span><span style="font-weight:700;">' + ed.debtRatio.toFixed(1) + '%</span></div>' +
          '</div>' +
        '</div>' +
        '<table style="width:100%; border-collapse:collapse; font-size:9pt;">' +
          '<thead>' +
            '<tr style="background:' + lender.hexPrimary + '; color:#ffffff;">' +
              '<th style="padding:8px 10px; text-align:left;">Underwriting Parameter</th>' +
              '<th style="padding:8px 10px; text-align:right;">Calculated Assessment (₹)</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            '<tr><td style="padding:7px 10px; border:1px solid ' + lender.hexBorder + ';">Net Monthly Take-Home Income</td><td style="text-align:right; padding:7px 10px; border:1px solid ' + lender.hexBorder + '; font-weight:700;">₹' + Math.round(ed.income).toLocaleString('en-IN') + '</td></tr>' +
            '<tr><td style="padding:7px 10px; border:1px solid ' + lender.hexBorder + ';">Permissible Obligation Limit (' + ed.foir + '% FOIR)</td><td style="text-align:right; padding:7px 10px; border:1px solid ' + lender.hexBorder + ';">₹' + Math.round(ed.maxPermissible).toLocaleString('en-IN') + '</td></tr>' +
            '<tr><td style="padding:7px 10px; border:1px solid ' + lender.hexBorder + ';">Less: Existing Monthly Commitments</td><td style="text-align:right; padding:7px 10px; border:1px solid ' + lender.hexBorder + '; color:#e05252;">- ₹' + Math.round(ed.existingEmi).toLocaleString('en-IN') + '</td></tr>' +
            '<tr><td style="padding:7px 10px; border:1px solid ' + lender.hexBorder + ';">Net Available Capacity for New EMI</td><td style="text-align:right; padding:7px 10px; border:1px solid ' + lender.hexBorder + '; font-weight:700; color:#0f8b71;">₹' + Math.round(ed.availableNewEmi).toLocaleString('en-IN') + '</td></tr>' +
            '<tr style="background:' + lender.hexLightBg + ';"><td style="padding:7px 10px; border:1px solid ' + lender.hexBorder + '; font-weight:800;">Estimated Eligible Principal (Sanction Limit)</td><td style="text-align:right; padding:7px 10px; border:1px solid ' + lender.hexBorder + '; font-weight:800; color:' + lender.hexPrimary + ';">₹' + Math.round(ed.roundedPrincipal).toLocaleString('en-IN') + '</td></tr>' +
            '<tr><td style="padding:7px 10px; border:1px solid ' + lender.hexBorder + ';">Estimated Total Interest over ' + ed.tenureMonths + ' Months</td><td style="text-align:right; padding:7px 10px; border:1px solid ' + lender.hexBorder + ';">₹' + Math.round(ed.totalInterest).toLocaleString('en-IN') + '</td></tr>' +
            '<tr><td style="padding:7px 10px; border:1px solid ' + lender.hexBorder + '; font-weight:700;">Total Amount Payable</td><td style="text-align:right; padding:7px 10px; border:1px solid ' + lender.hexBorder + '; font-weight:700;">₹' + Math.round(ed.totalRepayment).toLocaleString('en-IN') + '</td></tr>' +
          '</tbody>' +
        '</table>' +
        '<div style="margin-top:16px; border-top:1px solid ' + lender.hexBorder + '; padding-top:8px; font-size:7pt; color:#64748b; line-height:1.4;">' +
          MANDATORY_DISCLAIMERS.eligibility +
        '</div>' +
      '</div>';

    window.print();
  }

  // ── 9. Balance Transfer Calculator Module ─────────────────────────
  var transferExistingLender = '';
  var transferNewLender = '';
  var transferCalculatedData = null;

  function onTransferLenderChange() {
    var exEl = document.getElementById('select-transfer-existing-lender');
    var newEl = document.getElementById('select-transfer-new-lender');
    transferExistingLender = exEl ? exEl.value : '';
    transferNewLender = newEl ? newEl.value : '';
    window.transferExistingLender = transferExistingLender;
    window.transferNewLender = transferNewLender;
    updateTransferLenderUI();
  }

  function updateTransferLenderUI() {
    var newLender = getLenderProfile(transferNewLender);
    var badgeEl = document.getElementById('transfer-selected-lender-badge');
    var tableBadgeText = document.getElementById('transfer-export-lender-text');
    var tableBadgeIcon = document.getElementById('transfer-export-lender-icon');
    var tableBadgeEl = document.getElementById('transfer-export-lender-badge');

    if (badgeEl) {
      if (transferNewLender) {
        badgeEl.style.display = 'inline-flex';
        badgeEl.style.color = newLender.hexPrimary;
        var logoImg = newLender.faviconBase64 ? '<img src="' + newLender.faviconBase64 + '" class="lender-active-logo" alt="' + newLender.shortName + '"/>' : '<i class="fas fa-building-columns" style="margin-right:5px;"></i>';
        badgeEl.innerHTML = logoImg + '<span>' + newLender.shortName + '</span>';
      } else {
        badgeEl.style.display = 'none';
        badgeEl.innerHTML = '';
      }
    }
    if (tableBadgeText) {
      tableBadgeText.textContent = transferNewLender ? newLender.shortName : 'Dixit Lending Solution';
    }
    if (tableBadgeIcon) {
      tableBadgeIcon.style.color = newLender.hexPrimary;
    }
    if (tableBadgeEl) {
      if (transferNewLender) {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        tableBadgeEl.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.14)' : newLender.hexBorder;
        tableBadgeEl.style.background = isDark ? 'rgba(14, 21, 30, 0.95)' : newLender.hexLightBg;
        tableBadgeEl.style.color = isDark ? '#f8fafc' : newLender.hexPrimary;
      } else {
        tableBadgeEl.style.borderColor = 'var(--border)';
        tableBadgeEl.style.background = 'var(--bg-secondary)';
        tableBadgeEl.style.color = 'var(--text-secondary)';
      }
    }
  }

  function calculateTransferExistingEMIFromDetails() {
    var errP = document.getElementById('err-transfer-principal');
    var errR1 = document.getElementById('err-transfer-r1');
    var errT1 = document.getElementById('err-transfer-t1');
    if (errP) errP.style.display = 'none';
    if (errR1) errR1.style.display = 'none';
    if (errT1) errT1.style.display = 'none';

    var principal = parseINR(document.getElementById('input-transfer-existing-principal') ? document.getElementById('input-transfer-existing-principal').value : '');
    var rate = parseFloat(document.getElementById('input-transfer-existing-rate') ? document.getElementById('input-transfer-existing-rate').value : '');
    var tenure = parseFloat(document.getElementById('input-transfer-existing-tenure') ? document.getElementById('input-transfer-existing-tenure').value : '');
    var emiInput = document.getElementById('input-transfer-existing-emi');

    var hasErr = false;
    if (!principal || principal <= 0) {
      if (errP) {
        errP.textContent = 'Please enter existing outstanding principal first.';
        errP.style.display = 'block';
      }
      hasErr = true;
    }
    if (isNaN(rate) || rate <= 0 || rate > 50) {
      if (errR1) {
        errR1.textContent = 'Please enter existing interest rate (0.1% - 50%).';
        errR1.style.display = 'block';
      }
      hasErr = true;
    }
    if (isNaN(tenure) || tenure <= 0) {
      if (errT1) {
        errT1.textContent = 'Please enter existing remaining tenure.';
        errT1.style.display = 'block';
      }
      hasErr = true;
    }
    if (hasErr) return;

    var calculated = Math.round(calculateStandardEMI(principal, rate, tenure));
    if (emiInput) {
      emiInput.value = formatNumberWithCommas(calculated);
    }
  }

  function calculateBalanceTransfer() {
    var errP = document.getElementById('err-transfer-principal');
    var errR1 = document.getElementById('err-transfer-r1');
    var errT1 = document.getElementById('err-transfer-t1');
    var errR2 = document.getElementById('err-transfer-r2');
    var errT2 = document.getElementById('err-transfer-t2');
    var banner = document.getElementById('transfer-banner');

    if (errP) errP.style.display = 'none';
    if (errR1) errR1.style.display = 'none';
    if (errT1) errT1.style.display = 'none';
    if (errR2) errR2.style.display = 'none';
    if (errT2) errT2.style.display = 'none';
    if (banner) banner.style.display = 'none';

    var principal = parseINR(document.getElementById('input-transfer-existing-principal') ? document.getElementById('input-transfer-existing-principal').value : '');
    var rate1 = parseFloat(document.getElementById('input-transfer-existing-rate') ? document.getElementById('input-transfer-existing-rate').value : '');
    var tenure1 = parseFloat(document.getElementById('input-transfer-existing-tenure') ? document.getElementById('input-transfer-existing-tenure').value : '');
    var emi1 = parseINR(document.getElementById('input-transfer-existing-emi') ? document.getElementById('input-transfer-existing-emi').value : '');

    var rate2 = parseFloat(document.getElementById('input-transfer-new-rate') ? document.getElementById('input-transfer-new-rate').value : '');
    var tenure2 = parseFloat(document.getElementById('input-transfer-new-tenure') ? document.getElementById('input-transfer-new-tenure').value : '');
    var feePct = parseFloat(document.getElementById('input-transfer-fee-pct') ? document.getElementById('input-transfer-fee-pct').value : '') || 0;
    var otherCharges = parseINR(document.getElementById('input-transfer-other-charges') ? document.getElementById('input-transfer-other-charges').value : '') || 0;

    var hasError = false;

    if (!principal || principal <= 0) {
      if (errP) { errP.textContent = 'Please enter outstanding principal.'; errP.style.display = 'block'; }
      hasError = true;
    }
    if (isNaN(rate1) || rate1 <= 0 || rate1 > 50) {
      if (errR1) { errR1.textContent = 'Please enter existing interest rate.'; errR1.style.display = 'block'; }
      hasError = true;
    }
    if (isNaN(tenure1) || tenure1 <= 0) {
      if (errT1) { errT1.textContent = 'Please enter existing remaining tenure.'; errT1.style.display = 'block'; }
      hasError = true;
    }
    if (isNaN(rate2) || rate2 <= 0 || rate2 > 50) {
      if (errR2) { errR2.textContent = 'Please enter new interest rate.'; errR2.style.display = 'block'; }
      hasError = true;
    }
    if (isNaN(tenure2) || tenure2 <= 0) {
      if (errT2) { errT2.textContent = 'Please enter new loan tenure.'; errT2.style.display = 'block'; }
      hasError = true;
    }

    if (hasError) return;

    if (!emi1 || emi1 <= 0) {
      emi1 = Math.round(calculateStandardEMI(principal, rate1, tenure1));
    }

    var totalCost1 = emi1 * tenure1;
    var totalInterest1 = Math.max(0, totalCost1 - principal);

    var emi2 = Math.round(calculateStandardEMI(principal, rate2, tenure2));
    var totalRepayment2 = emi2 * tenure2;
    var totalInterest2 = Math.max(0, totalRepayment2 - principal);

    var procFeeAmount = Math.round((principal * feePct) / 100);
    var totalTransferCosts = procFeeAmount + otherCharges;
    var totalCost2 = totalRepayment2 + totalTransferCosts;

    var netSavings = totalCost1 - totalCost2;
    var monthlySavings = emi1 - emi2;
    var interestSavings = totalInterest1 - totalInterest2;

    var breakevenMonths = (monthlySavings > 0 && totalTransferCosts > 0)
      ? Math.ceil(totalTransferCosts / monthlySavings)
      : (monthlySavings > 0 && totalTransferCosts === 0 ? 0 : null);

    var resultsWrap = document.getElementById('transfer-results-wrapper');
    if (resultsWrap) resultsWrap.style.display = 'block';
    var transferPh = document.getElementById('transfer-placeholder');
    if (transferPh) transferPh.style.display = 'none';

    var resSavingsEl = document.getElementById('res-transfer-savings');
    var resMonthlyEl = document.getElementById('res-transfer-monthly');
    var resCostsEl = document.getElementById('res-transfer-costs');
    var resBreakevenEl = document.getElementById('res-transfer-breakeven');

    if (resSavingsEl) {
      resSavingsEl.textContent = formatINR(netSavings);
      resSavingsEl.style.color = netSavings > 0 ? 'var(--success)' : 'var(--danger)';
    }
    if (resMonthlyEl) {
      resMonthlyEl.textContent = (monthlySavings >= 0 ? '+' : '') + formatINR(monthlySavings) + ' / mo';
      resMonthlyEl.style.color = monthlySavings > 0 ? 'var(--success)' : (monthlySavings < 0 ? 'var(--danger)' : 'inherit');
    }
    if (resCostsEl) resCostsEl.textContent = formatINR(totalTransferCosts);
    if (resBreakevenEl) {
      if (breakevenMonths === 0) {
        resBreakevenEl.textContent = 'Immediate (No Fees)';
      } else if (breakevenMonths !== null) {
        resBreakevenEl.textContent = breakevenMonths + ' Months';
      } else {
        resBreakevenEl.textContent = 'N/A';
      }
    }

    var tbl = document.getElementById('transfer-comparison-tbody');
    if (tbl) {
      var rateDiff = (rate2 - rate1).toFixed(2);
      var tenureDiff = tenure2 - tenure1;
      var emiDiff = emi2 - emi1;
      var interestDiff = totalInterest2 - totalInterest1;
      var costDiff = totalCost2 - totalCost1;

      tbl.innerHTML =
        '<tr><td>Principal Loan Amount</td><td>' + formatINR(principal) + '</td><td>' + formatINR(principal) + '</td><td>—</td></tr>' +
        '<tr><td>Interest Rate (% p.a.)</td><td>' + rate1.toFixed(2) + '%</td><td>' + rate2.toFixed(2) + '%</td><td class="' + (rateDiff < 0 ? 'hub-val-positive' : (rateDiff > 0 ? 'hub-val-negative' : '')) + '">' + (rateDiff > 0 ? '+' : '') + rateDiff + '%</td></tr>' +
        '<tr><td>Remaining Tenure</td><td>' + tenure1 + ' months</td><td>' + tenure2 + ' months</td><td>' + (tenureDiff > 0 ? '+' : '') + tenureDiff + ' months</td></tr>' +
        '<tr><td>Monthly EMI</td><td>' + formatINR(emi1) + '</td><td>' + formatINR(emi2) + '</td><td class="' + (emiDiff < 0 ? 'hub-val-positive' : (emiDiff > 0 ? 'hub-val-negative' : '')) + '">' + (emiDiff > 0 ? '+' : '') + formatINR(emiDiff) + '</td></tr>' +
        '<tr><td>Total Interest Payable</td><td>' + formatINR(totalInterest1) + '</td><td>' + formatINR(totalInterest2) + '</td><td class="' + (interestDiff < 0 ? 'hub-val-positive' : (interestDiff > 0 ? 'hub-val-negative' : '')) + '">' + (interestDiff > 0 ? '+' : '') + formatINR(interestDiff) + '</td></tr>' +
        '<tr><td>Processing Fees &amp; Other Charges</td><td>—</td><td>' + formatINR(totalTransferCosts) + '</td><td class="hub-val-negative">+' + formatINR(totalTransferCosts) + '</td></tr>' +
        '<tr style="background:var(--bg-secondary); font-weight:700;"><td>Total Cost of Loan</td><td>' + formatINR(totalCost1) + '</td><td>' + formatINR(totalCost2) + '</td><td class="' + (costDiff < 0 ? 'hub-val-positive' : (costDiff > 0 ? 'hub-val-negative' : '')) + '">' + (costDiff > 0 ? '+' : '') + formatINR(costDiff) + '</td></tr>';
    }

    var newLender = getLenderProfile(transferNewLender);

    if (banner) {
      if (netSavings > 0) {
        banner.className = 'hub-banner positive';
        banner.innerHTML = '<i class="fas fa-right-left"></i><div>' +
          '<div class="hub-banner-title">Potential Net Savings: ' + formatINR(netSavings) + '</div>' +
          'Transferring to ' + newLender.shortName + ' at ' + rate2.toFixed(2) + '% p.a. reduces your monthly EMI by <strong>' + formatINR(monthlySavings) +
          '/mo</strong>. After accounting for all transfer costs (' + formatINR(totalTransferCosts) + '), the estimated break-even period is <strong>' +
          (breakevenMonths === 0 ? 'immediate' : (breakevenMonths ? (breakevenMonths + ' months') : 'immediate')) + '</strong>.</div>';
      } else {
        banner.className = 'hub-banner warning';
        banner.innerHTML = '<i class="fas fa-triangle-exclamation"></i><div>' +
          '<div class="hub-banner-title">Balance Transfer May Not Be Cost-Effective</div>' +
          'The proposed transfer results in higher total expenditure of <strong>' + formatINR(Math.abs(netSavings)) +
          '</strong> after factoring in transfer fees and interest charges over the remaining tenure.</div>';
      }
      banner.style.display = 'flex';
    }

    transferCalculatedData = {
      principal: principal,
      rate1: rate1,
      tenure1: tenure1,
      emi1: emi1,
      totalCost1: totalCost1,
      totalInterest1: totalInterest1,
      existingLender: getLenderProfile(transferExistingLender),
      rate2: rate2,
      tenure2: tenure2,
      emi2: emi2,
      totalCost2: totalCost2,
      totalInterest2: totalInterest2,
      newLender: newLender,
      feePct: feePct,
      procFeeAmount: procFeeAmount,
      otherCharges: otherCharges,
      totalTransferCosts: totalTransferCosts,
      netSavings: netSavings,
      monthlySavings: monthlySavings,
      interestSavings: interestSavings,
      breakevenMonths: breakevenMonths
    };
    window.transferCalculatedData = transferCalculatedData;
  }

  function resetBalanceTransfer() {
    var form = document.getElementById('transfer-form');
    if (form) form.reset();

    var ids = [
      'input-transfer-existing-principal', 'input-transfer-existing-rate', 'input-transfer-existing-tenure', 'input-transfer-existing-emi',
      'input-transfer-new-rate', 'input-transfer-new-tenure', 'input-transfer-fee-pct', 'input-transfer-other-charges'
    ];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });

    var exLenderEl = document.getElementById('select-transfer-existing-lender');
    if (exLenderEl) exLenderEl.value = '';
    var newLenderEl = document.getElementById('select-transfer-new-lender');
    if (newLenderEl) newLenderEl.value = '';
    transferExistingLender = '';
    transferNewLender = '';
    window.transferExistingLender = '';
    window.transferNewLender = '';
    updateTransferLenderUI();

    ['err-transfer-principal', 'err-transfer-r1', 'err-transfer-t1', 'err-transfer-r2', 'err-transfer-t2'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    var resultsWrap = document.getElementById('transfer-results-wrapper');
    if (resultsWrap) resultsWrap.style.display = 'none';
    var transferPh = document.getElementById('transfer-placeholder');
    if (transferPh) transferPh.style.display = 'block';
    var banner = document.getElementById('transfer-banner');
    if (banner) banner.style.display = 'none';

    var resSav = document.getElementById('res-transfer-savings');
    if (resSav) resSav.textContent = '₹0';
    var resMo = document.getElementById('res-transfer-monthly');
    if (resMo) resMo.textContent = '₹0 / mo';
    var resCosts = document.getElementById('res-transfer-costs');
    if (resCosts) resCosts.textContent = '₹0';
    var resBreak = document.getElementById('res-transfer-breakeven');
    if (resBreak) resBreak.textContent = '0 Months';
    var tbody = document.getElementById('transfer-comparison-tbody');
    if (tbody) tbody.innerHTML = '';

    transferCalculatedData = null;
    window.transferCalculatedData = null;
  }

  async function exportTransferPDF() {
    var jsPDFLib = window.jspdf;
    if (!jsPDFLib || !jsPDFLib.jsPDF) { alert('PDF library not loaded yet.'); return; }
    var td = window.transferCalculatedData;
    if (!td || !td.principal || td.principal <= 0) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var existingLender = getLenderProfile(window.transferExistingLender);
    var newLender = getLenderProfile(window.transferNewLender);
    var refCode = 'DLS-' + newLender.fileSlug.toUpperCase() + '-' + Math.round(td.principal);

    var doc = new jsPDFLib.jsPDF('p', 'pt', 'a4');
    var fontName = 'helvetica';
    var fonts = typeof getPdfFonts === 'function' ? await getPdfFonts() : null;
    if (fonts) {
      try {
        doc.addFileToVFS('segoeui.ttf', fonts.regular);
        doc.addFont('segoeui.ttf', 'SegoeUI', 'normal');
        doc.addFileToVFS('segoeuib.ttf', fonts.bold);
        doc.addFont('segoeuib.ttf', 'SegoeUI', 'bold');
        fontName = 'SegoeUI';
      } catch (e) {}
    }

    doc.setFillColor.apply(doc, newLender.primaryColor);
    doc.rect(0, 0, 595, 6, 'F');
    doc.setFillColor.apply(doc, newLender.secondaryColor);
    doc.rect(0, 6, 595, 2, 'F');

    var transferLogo = newLender.faviconBase64 || newLender.logoBase64;
    var transferTitleX = 40;
    if (transferLogo) {
      try {
        doc.addImage(transferLogo, 'PNG', 40, 20, 34, 34);
        transferTitleX = 84;
      } catch (e) {
        console.warn('Transfer PDF logo error:', e);
      }
    }

    doc.setFont(fontName, 'bold');
    doc.setFontSize(16);
    doc.setTextColor.apply(doc, newLender.primaryColor);
    doc.text(newLender.name, transferTitleX, 36);

    doc.setFont(fontName, 'bold');
    doc.setFontSize(13);
    doc.setTextColor(16, 32, 51);
    doc.text('Balance Transfer Benefit Analysis', transferTitleX, 52);

    doc.setFont(fontName, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(82, 97, 115);
    doc.text('Refinancing savings evaluation: ' + existingLender.shortName + ' -> ' + newLender.shortName, transferTitleX, 66);

    doc.setFont(fontName, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(16, 32, 51);
    doc.text('Reference: ' + refCode, 555, 42, { align: 'right' });
    doc.setFont(fontName, 'normal');
    doc.setTextColor(82, 97, 115);
    doc.text('Generated: ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), 555, 56, { align: 'right' });

    doc.setDrawColor.apply(doc, newLender.borderStroke);
    doc.line(40, 84, 555, 84);

    doc.setFillColor(248, 250, 253);
    doc.setDrawColor(217, 227, 239);
    doc.roundedRect(40, 92, 515, 28, 4, 4, 'FD');
    doc.setFont(fontName, 'bold'); doc.setFontSize(8.5); doc.setTextColor(82, 97, 115);
    doc.text('Existing Loan Current Lender:', 50, 110);
    doc.setTextColor(16, 32, 51);
    doc.text(existingLender.shortName, 185, 110);

    doc.setTextColor(82, 97, 115);
    doc.text('Proposed Loan Target Lender:', 310, 110);
    doc.setTextColor.apply(doc, newLender.primaryColor);
    doc.text(newLender.shortName, 445, 110);

    doc.setFillColor.apply(doc, newLender.lightBg);
    doc.setDrawColor.apply(doc, newLender.borderStroke);
    doc.roundedRect(40, 126, 515, 68, 5, 5, 'FD');

    doc.setFont(fontName, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor.apply(doc, newLender.primaryColor);
    doc.text('REFINANCING BENEFIT & BREAK-EVEN SUMMARY', 52, 142);

    doc.setFont(fontName, 'normal'); doc.setFontSize(8.5); doc.setTextColor(82, 97, 115);
    doc.text('Net Lifetime Savings:', 52, 158);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(td.netSavings > 0 ? 15 : 224, td.netSavings > 0 ? 139 : 82, td.netSavings > 0 ? 113 : 82);
    doc.text('₹' + Math.round(td.netSavings).toLocaleString('en-IN'), 160, 158);

    doc.setFont(fontName, 'normal'); doc.setTextColor(82, 97, 115);
    doc.text('Monthly EMI Reduction:', 52, 174);
    doc.setFont(fontName, 'bold'); doc.setTextColor(15, 139, 113);
    doc.text('₹' + Math.round(td.monthlySavings).toLocaleString('en-IN') + ' / mo', 160, 174);

    doc.setFont(fontName, 'normal'); doc.setTextColor(82, 97, 115);
    doc.text('Total Transfer Costs:', 320, 158);
    doc.setFont(fontName, 'bold'); doc.setTextColor(16, 32, 51);
    doc.text('₹' + Math.round(td.totalTransferCosts).toLocaleString('en-IN'), 440, 158);

    doc.setFont(fontName, 'normal'); doc.setTextColor(82, 97, 115);
    doc.text('Break-Even Period:', 320, 174);
    doc.setFont(fontName, 'bold'); doc.setTextColor.apply(doc, newLender.primaryColor);
    doc.text(td.breakevenMonths === 0 ? 'Immediate' : (td.breakevenMonths ? td.breakevenMonths + ' Months' : 'N/A'), 440, 174);

    var rateDiff = (td.rate2 - td.rate1).toFixed(2);
    var tenureDiff = td.tenure2 - td.tenure1;
    var emiDiff = td.emi2 - td.emi1;
    var intDiff = td.totalInterest2 - td.totalInterest1;
    var costDiff = td.totalCost2 - td.totalCost1;

    var tableBody = [
      ['Principal Loan Amount', '₹' + Math.round(td.principal).toLocaleString('en-IN'), '₹' + Math.round(td.principal).toLocaleString('en-IN'), '—'],
      ['Interest Rate (% p.a.)', td.rate1.toFixed(2) + '%', td.rate2.toFixed(2) + '%', (rateDiff > 0 ? '+' : '') + rateDiff + '%'],
      ['Remaining Tenure', td.tenure1 + ' Months', td.tenure2 + ' Months', (tenureDiff > 0 ? '+' : '') + tenureDiff + ' Months'],
      ['Monthly EMI', '₹' + Math.round(td.emi1).toLocaleString('en-IN'), '₹' + Math.round(td.emi2).toLocaleString('en-IN'), (emiDiff > 0 ? '+' : '') + '₹' + Math.round(emiDiff).toLocaleString('en-IN')],
      ['Total Interest Payable', '₹' + Math.round(td.totalInterest1).toLocaleString('en-IN'), '₹' + Math.round(td.totalInterest2).toLocaleString('en-IN'), (intDiff > 0 ? '+' : '') + '₹' + Math.round(intDiff).toLocaleString('en-IN')],
      ['Processing Fees & Charges', '—', '₹' + Math.round(td.totalTransferCosts).toLocaleString('en-IN'), '+₹' + Math.round(td.totalTransferCosts).toLocaleString('en-IN')],
      ['Total Cost of Loan', '₹' + Math.round(td.totalCost1).toLocaleString('en-IN'), '₹' + Math.round(td.totalCost2).toLocaleString('en-IN'), (costDiff > 0 ? '+' : '') + '₹' + Math.round(costDiff).toLocaleString('en-IN')]
    ];

    doc.autoTable({
      head: [['Parameter', 'Existing Loan (' + existingLender.shortName + ')', 'Proposed New Loan (' + newLender.shortName + ')', 'Net Difference']],
      body: tableBody,
      startY: 204,
      theme: 'plain',
      headStyles: {
        fillColor: newLender.primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        font: fontName,
        fontSize: 8.5
      },
      styles: {
        fontSize: 8,
        cellPadding: 6,
        font: fontName,
        lineColor: newLender.borderStroke,
        lineWidth: 0.5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 253]
      },
      columnStyles: {
        0: { cellWidth: 155 },
        1: { cellWidth: 120, halign: 'right' },
        2: { cellWidth: 120, halign: 'right' },
        3: { cellWidth: 120, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 40, right: 40, bottom: 42 }
    });

    var totalPages = doc.getNumberOfPages();
    for (var i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      if (i > 1) {
        var transferRunningX = 40;
        if (transferLogo) {
          try {
            doc.addImage(transferLogo, 'PNG', 40, 13, 14, 14);
            transferRunningX = 58;
          } catch (e) {}
        }
        doc.setFont(fontName, 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor.apply(doc, newLender.primaryColor);
        doc.text(newLender.name + ' — Balance Transfer Benefit Analysis', transferRunningX, 24);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(82, 97, 115);
        doc.text('Ref: ' + refCode, 555, 24, { align: 'right' });
        doc.setDrawColor.apply(doc, newLender.borderStroke);
        doc.line(40, 28, 555, 28);
      }
      doc.setDrawColor.apply(doc, newLender.borderStroke);
      doc.line(40, 810, 555, 810);
      doc.setFont(fontName, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      var disclaimerLines = doc.splitTextToSize(MANDATORY_DISCLAIMERS.transfer, 430);
      doc.text(disclaimerLines, 40, 819);
      doc.setFont(fontName, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(140, 150, 165);
      doc.text('Page ' + i + ' of ' + totalPages, 555, 822, { align: 'right' });
    }

    doc.save('Balance_Transfer_Analysis_' + newLender.fileSlug + '_' + Math.round(td.principal) + '.pdf');
  }

  function exportTransferExcel() {
    var td = window.transferCalculatedData;
    if (!td || !td.principal || td.principal <= 0) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var existingLender = getLenderProfile(window.transferExistingLender);
    var newLender = getLenderProfile(window.transferNewLender);
    var refCode = 'DLS-' + newLender.fileSlug.toUpperCase() + '-' + Math.round(td.principal);

    var wsData = [
      [newLender.name + ' — Balance Transfer Benefit Analysis'],
      ['Reference: ' + refCode],
      ['Generated: ' + new Date().toLocaleDateString('en-GB')],
      [],
      ['Refinancing Institution Mapping'],
      ['Existing Loan Lender', existingLender.shortName],
      ['Proposed New Loan Lender', newLender.shortName],
      [],
      ['Savings & Break-Even Metric', 'Value'],
      ['Net Lifetime Savings', Math.round(td.netSavings)],
      ['Monthly EMI Reduction', Math.round(td.monthlySavings)],
      ['Total Transfer Costs', Math.round(td.totalTransferCosts)],
      ['Estimated Break-Even Period', td.breakevenMonths === 0 ? 'Immediate' : (td.breakevenMonths ? td.breakevenMonths + ' Months' : 'N/A')],
      [],
      ['Parameter', 'Existing Loan (' + existingLender.shortName + ')', 'Proposed New Loan (' + newLender.shortName + ')', 'Net Difference'],
      ['Principal Loan Amount', Math.round(td.principal), Math.round(td.principal), '—'],
      ['Interest Rate (% p.a.)', td.rate1.toFixed(2) + '%', td.rate2.toFixed(2) + '%', (td.rate2 - td.rate1).toFixed(2) + '%'],
      ['Remaining Tenure (Months)', td.tenure1, td.tenure2, td.tenure2 - td.tenure1],
      ['Monthly EMI', Math.round(td.emi1), Math.round(td.emi2), Math.round(td.emi2 - td.emi1)],
      ['Total Interest Payable', Math.round(td.totalInterest1), Math.round(td.totalInterest2), Math.round(td.totalInterest2 - td.totalInterest1)],
      ['Processing Fees & Charges', 0, Math.round(td.totalTransferCosts), Math.round(td.totalTransferCosts)],
      ['Total Cost of Loan', Math.round(td.totalCost1), Math.round(td.totalCost2), Math.round(td.totalCost2 - td.totalCost1)],
      [],
      ['Legal Disclaimer:', MANDATORY_DISCLAIMERS.transfer]
    ];

    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 30 }, { wch: 25 }, { wch: 25 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Balance Transfer Analysis');
    XLSX.writeFile(wb, 'Balance_Transfer_Analysis_' + newLender.fileSlug + '_' + Math.round(td.principal) + '.xlsx');
  }

  function exportTransferCSV() {
    var td = window.transferCalculatedData;
    if (!td || !td.principal || td.principal <= 0) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var existingLender = getLenderProfile(window.transferExistingLender);
    var newLender = getLenderProfile(window.transferNewLender);
    var refCode = 'DLS-' + newLender.fileSlug.toUpperCase() + '-' + Math.round(td.principal);

    var csvContent = '# BALANCE TRANSFER BENEFIT ANALYSIS\n' +
      '# Target Lender: ' + newLender.name + '\n' +
      '# Existing Lender: ' + existingLender.shortName + '\n' +
      '# Reference: ' + refCode + '\n' +
      '# Net Lifetime Savings: ₹' + Math.round(td.netSavings) + '\n' +
      '# Disclaimer: ' + MANDATORY_DISCLAIMERS.transfer + '\n' +
      'Parameter,Existing Loan (' + existingLender.shortName + '),Proposed New Loan (' + newLender.shortName + '),Net Difference\n' +
      'Principal Amount,' + Math.round(td.principal) + ',' + Math.round(td.principal) + ',0\n' +
      'Interest Rate (% p.a.),' + td.rate1.toFixed(2) + '%,' + td.rate2.toFixed(2) + '%,' + (td.rate2 - td.rate1).toFixed(2) + '%\n' +
      'Remaining Tenure (Months),' + td.tenure1 + ',' + td.tenure2 + ',' + (td.tenure2 - td.tenure1) + '\n' +
      'Monthly EMI,' + Math.round(td.emi1) + ',' + Math.round(td.emi2) + ',' + Math.round(td.emi2 - td.emi1) + '\n' +
      'Total Interest Payable,' + Math.round(td.totalInterest1) + ',' + Math.round(td.totalInterest2) + ',' + Math.round(td.totalInterest2 - td.totalInterest1) + '\n' +
      'Processing Fees & Charges,0,' + Math.round(td.totalTransferCosts) + ',' + Math.round(td.totalTransferCosts) + '\n' +
      'Total Cost of Loan,' + Math.round(td.totalCost1) + ',' + Math.round(td.totalCost2) + ',' + Math.round(td.totalCost2 - td.totalCost1) + '\n';

    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Balance_Transfer_Analysis_' + newLender.fileSlug + '_' + Math.round(td.principal) + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function triggerTransferPrint() {
    var td = window.transferCalculatedData;
    if (!td || !td.principal || td.principal <= 0) {
      alert('Calculate the assessment first to enable exports.');
      return;
    }
    var existingLender = getLenderProfile(window.transferExistingLender);
    var newLender = getLenderProfile(window.transferNewLender);
    var refCode = 'DLS-' + newLender.fileSlug.toUpperCase() + '-' + Math.round(td.principal);

    var printContainer = document.getElementById('repayment-print-section');
    if (!printContainer) return;

    var rateDiff = (td.rate2 - td.rate1).toFixed(2);
    var tenureDiff = td.tenure2 - td.tenure1;
    var emiDiff = td.emi2 - td.emi1;
    var intDiff = td.totalInterest2 - td.totalInterest1;
    var costDiff = td.totalCost2 - td.totalCost1;

    printContainer.innerHTML =
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif; color:#102033; padding:15px 0;">' +
        '<div style="height:6px; background:' + newLender.hexPrimary + '; margin-bottom:2px;"></div>' +
        '<div style="height:2px; background:' + newLender.hexSecondary + '; margin-bottom:14px;"></div>' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; border-bottom:1px solid ' + newLender.hexBorder + '; padding-bottom:12px;">' +
          '<div>' +
            '<h1 style="margin:0; font-size:18pt; font-weight:800; color:' + newLender.hexPrimary + '; letter-spacing:0.5px;">' + newLender.name + '</h1>' +
            '<h2 style="margin:6px 0 0 0; font-size:13pt; font-weight:700; color:#102033;">Balance Transfer Benefit Analysis</h2>' +
          '</div>' +
          '<div style="text-align:right; font-size:8.5pt; color:#526173; line-height:1.5;">' +
            '<div style="font-weight:600; color:#102033;">Reference: ' + refCode + '</div>' +
            '<div>Generated: ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="background:#f8fafc; border:1px solid #d9e3ef; border-radius:6px; padding:10px 14px; margin-bottom:14px; display:flex; justify-content:space-between; font-size:9pt;">' +
          '<div><strong style="color:#526173;">Existing Loan Lender:</strong> <span style="color:#102033; font-weight:700;">' + existingLender.shortName + '</span></div>' +
          '<div><strong style="color:#526173;">Proposed New Loan Lender:</strong> <span style="color:' + newLender.hexPrimary + '; font-weight:700;">' + newLender.shortName + '</span></div>' +
        '</div>' +
        '<div style="background:' + newLender.hexLightBg + '; border:1px solid ' + newLender.hexBorder + '; border-radius:6px; padding:12px 16px; margin-bottom:16px;">' +
          '<div style="font-weight:700; font-size:9.5pt; color:' + newLender.hexPrimary + '; margin-bottom:8px; border-bottom:1px solid ' + newLender.hexBorder + '; padding-bottom:4px;">REFINANCING BENEFIT &amp; BREAK-EVEN SUMMARY</div>' +
          '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; font-size:9pt;">' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Net Lifetime Savings:</span><span style="font-weight:800; color:' + (td.netSavings > 0 ? '#0f8b71' : '#e05252') + ';">₹' + Math.round(td.netSavings).toLocaleString('en-IN') + '</span></div>' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Monthly EMI Reduction:</span><span style="font-weight:700; color:#0f8b71;">₹' + Math.round(td.monthlySavings).toLocaleString('en-IN') + ' / mo</span></div>' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Total Transfer Costs:</span><span style="font-weight:700;">₹' + Math.round(td.totalTransferCosts).toLocaleString('en-IN') + '</span></div>' +
            '<div style="display:flex; justify-content:space-between;"><span style="color:#526173;">Break-Even Period:</span><span style="font-weight:800; color:' + newLender.hexPrimary + ';">' + (td.breakevenMonths === 0 ? 'Immediate' : (td.breakevenMonths ? td.breakevenMonths + ' Months' : 'N/A')) + '</span></div>' +
          '</div>' +
        '</div>' +
        '<table style="width:100%; border-collapse:collapse; font-size:8.5pt;">' +
          '<thead>' +
            '<tr style="background:' + newLender.hexPrimary + '; color:#ffffff;">' +
              '<th style="padding:7px 8px; text-align:left;">Parameter</th>' +
              '<th style="padding:7px 8px; text-align:right;">Existing Loan (' + existingLender.shortName + ')</th>' +
              '<th style="padding:7px 8px; text-align:right;">Proposed New Loan (' + newLender.shortName + ')</th>' +
              '<th style="padding:7px 8px; text-align:right;">Net Difference</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            '<tr><td style="padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">Principal Loan Amount</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">₹' + Math.round(td.principal).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">₹' + Math.round(td.principal).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">—</td></tr>' +
            '<tr><td style="padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">Interest Rate (% p.a.)</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">' + td.rate1.toFixed(2) + '%</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">' + td.rate2.toFixed(2) + '%</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + '; font-weight:600;">' + (rateDiff > 0 ? '+' : '') + rateDiff + '%</td></tr>' +
            '<tr><td style="padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">Remaining Tenure</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">' + td.tenure1 + ' Months</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">' + td.tenure2 + ' Months</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">' + (tenureDiff > 0 ? '+' : '') + tenureDiff + ' Months</td></tr>' +
            '<tr><td style="padding:6px 8px; border:1px solid ' + newLender.hexBorder + '; font-weight:700;">Monthly EMI</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">₹' + Math.round(td.emi1).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + '; font-weight:700;">₹' + Math.round(td.emi2).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + '; font-weight:700; color:#0f8b71;">' + (emiDiff > 0 ? '+' : '') + '₹' + Math.round(emiDiff).toLocaleString('en-IN') + '</td></tr>' +
            '<tr><td style="padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">Total Interest Payable</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">₹' + Math.round(td.totalInterest1).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">₹' + Math.round(td.totalInterest2).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">' + (intDiff > 0 ? '+' : '') + '₹' + Math.round(intDiff).toLocaleString('en-IN') + '</td></tr>' +
            '<tr><td style="padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">Processing Fees &amp; Other Charges</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">—</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">₹' + Math.round(td.totalTransferCosts).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + '; color:#e05252;">+₹' + Math.round(td.totalTransferCosts).toLocaleString('en-IN') + '</td></tr>' +
            '<tr style="background:#f8fafc; font-weight:800;"><td style="padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">Total Cost of Loan</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">₹' + Math.round(td.totalCost1).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + ';">₹' + Math.round(td.totalCost2).toLocaleString('en-IN') + '</td><td style="text-align:right; padding:6px 8px; border:1px solid ' + newLender.hexBorder + '; color:' + (costDiff < 0 ? '#0f8b71' : '#e05252') + ';">' + (costDiff > 0 ? '+' : '') + '₹' + Math.round(costDiff).toLocaleString('en-IN') + '</td></tr>' +
          '</tbody>' +
        '</table>' +
        '<div style="margin-top:16px; border-top:1px solid ' + newLender.hexBorder + '; padding-top:8px; font-size:7pt; color:#64748b; line-height:1.4;">' +
          MANDATORY_DISCLAIMERS.transfer +
        '</div>' +
      '</div>';

    window.print();
  }

  // ── 10. Auto Initialization & Window Attachments ──────────────────
  function initCalculatorHub() {
    var currencyFields = [
      'input-elig-income', 'input-elig-existing-emi',
      'input-transfer-existing-principal', 'input-transfer-existing-emi', 'input-transfer-other-charges'
    ];
    currencyFields.forEach(function (id) {
      attachCurrencyMask(document.getElementById(id));
    });

    var b1 = document.getElementById('compare-bank-1');
    var b2 = document.getElementById('compare-bank-2');
    if (b1) b1.addEventListener('change', onCompareLenderChange);
    if (b2) b2.addEventListener('change', onCompareLenderChange);

    switchHubTab('emi');
  }

  // Attach all shared objects and functions to window
  window.LENDER_PROFILES = LENDER_PROFILES;
  window.getLenderProfile = getLenderProfile;
  window.MANDATORY_DISCLAIMERS = MANDATORY_DISCLAIMERS;
  window.getPdfFonts = getPdfFonts;

  window.formatINR = formatINR;
  window.parseINR = parseINR;
  window.formatNumberWithCommas = formatNumberWithCommas;
  window.calculateStandardEMI = calculateStandardEMI;
  window.calculatePresentValue = calculatePresentValue;

  window.switchHubTab = switchHubTab;

  window.onFlatLenderChange = onFlatLenderChange;
  window.updateFlatLenderUI = updateFlatLenderUI;
  window.buildFlatScheduleRows = buildFlatScheduleRows;
  window.exportFlatPDF = exportFlatPDF;
  window.exportFlatExcel = exportFlatExcel;
  window.exportFlatCSV = exportFlatCSV;
  window.triggerFlatPrint = triggerFlatPrint;

  window.onCompareLenderChange = onCompareLenderChange;
  window.updateCompareLenderUI = updateCompareLenderUI;
  window.exportComparePDF = exportComparePDF;
  window.exportCompareExcel = exportCompareExcel;
  window.exportCompareCSV = exportCompareCSV;
  window.triggerComparePrint = triggerComparePrint;

  window.setEligibilityTenureUnit = setEligibilityTenureUnit;
  window.setEligibilityFoir = setEligibilityFoir;
  window.onEligLenderChange = onEligLenderChange;
  window.updateEligLenderUI = updateEligLenderUI;
  window.calculateEligibility = calculateEligibility;
  window.resetEligibility = resetEligibility;
  window.prefillEmiFromEligibility = prefillEmiFromEligibility;
  window.exportEligPDF = exportEligPDF;
  window.exportEligExcel = exportEligExcel;
  window.exportEligCSV = exportEligCSV;
  window.triggerEligPrint = triggerEligPrint;

  window.onTransferLenderChange = onTransferLenderChange;
  window.updateTransferLenderUI = updateTransferLenderUI;
  window.calculateTransferExistingEMIFromDetails = calculateTransferExistingEMIFromDetails;
  window.calculateBalanceTransfer = calculateBalanceTransfer;
  window.resetBalanceTransfer = resetBalanceTransfer;
  window.exportTransferPDF = exportTransferPDF;
  window.exportTransferExcel = exportTransferExcel;
  window.exportTransferCSV = exportTransferCSV;
  window.triggerTransferPrint = triggerTransferPrint;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCalculatorHub);
  } else {
    initCalculatorHub();
  }
})();
