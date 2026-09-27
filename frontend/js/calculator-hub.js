/**
 * CLN Lending Suite — Loan Calculator Hub Engine
 * Handles:
 *  - Hub Navigation & Tab State Management
 *  - Eligibility Calculator
 *  - Affordability Calculator
 *  - Prepayment Calculator (Option A & Option B)
 *  - Balance Transfer Calculator
 *  - Currency formatting, input masks, and validation
 *
 * NOTE: Initial state is strictly EMPTY for all 4 calculators.
 * Zero demo/sample values are injected on load or tab switch.
 */

(function () {
  'use strict';

  // ── Global Currency & Number Utilities ───────────────────────────
  function formatINR(num, includeDecimals) {
    if (num === null || num === undefined || isNaN(num)) return '₹0';
    var isNegative = num < 0;
    var absVal = Math.abs(num);
    var rounded = includeDecimals ? absVal.toFixed(2) : Math.round(absVal).toString();
    var parts = rounded.split('.');
    var intPart = parts[0];
    var decPart = parts.length > 1 ? '.' + parts[1] : '';

    // Indian number format: last 3 digits, then groups of 2
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
    return otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
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

  // ── Hub Navigation State ─────────────────────────────────────────
  var currentHubTab = 'emi';

  function switchHubTab(tabName) {
    if (!tabName) return;
    currentHubTab = tabName;

    // Update buttons
    document.querySelectorAll('.hub-tab-btn').forEach(function (btn) {
      var isCurrent = btn.id === 'hub-tab-' + tabName;
      btn.classList.toggle('active', isCurrent);
      btn.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    });

    // Update panels
    var panels = ['emi', 'eligibility', 'affordability', 'prepayment', 'transfer'];
    panels.forEach(function (p) {
      var el = document.getElementById('hub-content-' + p);
      if (el) {
        var isTarget = p === tabName;
        el.classList.toggle('active', isTarget);
        el.style.display = isTarget ? 'block' : 'none';
      }
    });

    // If EMI tab is active, trigger chart resize if available
    if (tabName === 'emi') {
      try {
        if (typeof chartPie !== 'undefined' && chartPie && chartPie.resize) chartPie.resize();
        if (typeof chartAmortization !== 'undefined' && chartAmortization && chartAmortization.resize) chartAmortization.resize();
        if (typeof flatChartPie !== 'undefined' && flatChartPie && flatChartPie.resize) flatChartPie.resize();
      } catch (err) {}
    }
  }

  // ── 1. Eligibility Calculator ────────────────────────────────────
  var eligTenureUnit = 'years';
  var eligFoir = null; // Strictly empty initially

  function setEligibilityTenureUnit(unit) {
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

    var income = parseINR(incomeInput?.value);
    var existingEmi = parseINR(existingEmiInput?.value) || 0;
    var rate = parseFloat(rateInput?.value);
    var tenureInput = parseFloat(tenureInputEl?.value);

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
    var availableNewEmi = maxEmiPermissible - existingEmi;

    var resAmountEl = document.getElementById('res-elig-amount');
    var resEmiEl = document.getElementById('res-elig-emi');
    var resInterestEl = document.getElementById('res-elig-interest');
    var resTotalEl = document.getElementById('res-elig-total');
    var resFoirEl = document.getElementById('res-elig-foir');
    var resultsWrap = document.getElementById('elig-results-wrapper');
    var eligPh = document.getElementById('elig-placeholder');

    if (availableNewEmi <= 0) {
      // Debt obligations equal or exceed permissible limit
      if (resAmountEl) resAmountEl.textContent = '₹0';
      if (resEmiEl) resEmiEl.textContent = '₹0';
      if (resInterestEl) resInterestEl.textContent = '₹0';
      if (resTotalEl) resTotalEl.textContent = '₹0';
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
      return;
    }

    // Calculate eligible loan amount
    var eligiblePrincipal = calculatePresentValue(availableNewEmi, rate, tenureMonths);
    var roundedPrincipal = Math.floor(eligiblePrincipal / 1000) * 1000;
    if (roundedPrincipal < 10000) roundedPrincipal = Math.round(eligiblePrincipal);

    var totalRepayment = availableNewEmi * tenureMonths;
    var totalInterest = totalRepayment - roundedPrincipal;
    if (totalInterest < 0) totalInterest = 0;
    var totalObligationRatio = ((existingEmi + availableNewEmi) / income) * 100;

    if (resAmountEl) resAmountEl.textContent = formatINR(roundedPrincipal);
    if (resEmiEl) resEmiEl.textContent = formatINR(availableNewEmi) + ' / mo';
    if (resInterestEl) resInterestEl.textContent = formatINR(totalInterest);
    if (resTotalEl) resTotalEl.textContent = formatINR(totalRepayment);
    if (resFoirEl) resFoirEl.textContent = totalObligationRatio.toFixed(1) + '%';

    if (banner) {
      banner.className = 'hub-banner positive';
      banner.innerHTML = '<i class="fas fa-circle-check"></i><div>' +
        '<div class="hub-banner-title">Estimated Eligible Loan Amount: ' + formatINR(roundedPrincipal) + '</div>' +
        'Based on ' + eligFoir + '% FOIR, you can comfortably borrow up to <strong>' + formatINR(roundedPrincipal) +
        '</strong> at ' + rate + '% p.a. for ' + (eligTenureUnit === 'years' ? (tenureInput + ' years') : (tenureMonths + ' months')) +
        ' with a monthly EMI capacity of <strong>' + formatINR(availableNewEmi) + '</strong>.</div>';
      banner.style.display = 'flex';
    }

    if (resultsWrap) resultsWrap.style.display = 'block';
    if (eligPh) eligPh.style.display = 'none';
    updateEligibilityBreakdown(income, maxEmiPermissible, existingEmi, availableNewEmi, roundedPrincipal, totalInterest, tenureMonths);
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
  }

  function prefillEmiFromEligibility() {
    var resAmountEl = document.getElementById('res-elig-amount');
    var rateInput = document.getElementById('input-elig-rate');
    var tenureInput = document.getElementById('input-elig-tenure');

    var principal = parseINR(resAmountEl?.textContent);
    if (!principal || principal <= 0) return;

    // Switch to EMI tab
    switchHubTab('emi');
    if (typeof switchTab === 'function') switchTab('reducing');

    // Populate Reducing Rate form
    var mainPrincipal = document.getElementById('input-principal');
    var mainRate = document.getElementById('input-rate');
    var mainTenure = document.getElementById('input-tenure');

    if (mainPrincipal) mainPrincipal.value = formatNumberWithCommas(principal);
    if (mainRate && rateInput) mainRate.value = rateInput.value;
    if (mainTenure && tenureInput) {
      mainTenure.value = tenureInput.value;
      if (typeof setTenureUnit === 'function') setTenureUnit(eligTenureUnit);
    }

    if (typeof calculateEMI === 'function') calculateEMI();
  }

  // ── 2. Affordability Calculator ──────────────────────────────────
  var affordTenureUnit = 'years';
  var affordBuffer = null; // Strictly empty initially

  function setAffordabilityTenureUnit(unit) {
    affordTenureUnit = unit;
    var btnY = document.getElementById('btn-afford-years');
    var btnM = document.getElementById('btn-afford-months');
    if (btnY && btnM) {
      btnY.classList.toggle('active', unit === 'years');
      btnM.classList.toggle('active', unit === 'months');
    }
  }

  function setAffordabilityBuffer(bufVal) {
    affordBuffer = parseFloat(bufVal);
    if (isNaN(affordBuffer)) affordBuffer = null;
    document.querySelectorAll('#afford-buffer-pills .preset-pill').forEach(function (p) {
      p.classList.toggle('active', parseFloat(p.getAttribute('data-buffer')) === affordBuffer);
    });
    var errBuf = document.getElementById('err-afford-buffer');
    if (errBuf) errBuf.style.display = 'none';
  }

  function calculateAffordability() {
    var errIncome = document.getElementById('err-afford-income');
    var errExpenses = document.getElementById('err-afford-expenses');
    var errBuffer = document.getElementById('err-afford-buffer');
    var errRate = document.getElementById('err-afford-rate');
    var errTenure = document.getElementById('err-afford-tenure');
    var banner = document.getElementById('afford-banner');

    if (errIncome) errIncome.style.display = 'none';
    if (errExpenses) errExpenses.style.display = 'none';
    if (errBuffer) errBuffer.style.display = 'none';
    if (errRate) errRate.style.display = 'none';
    if (errTenure) errTenure.style.display = 'none';
    if (banner) banner.style.display = 'none';

    var incomeInput = document.getElementById('input-afford-income');
    var expensesInput = document.getElementById('input-afford-expenses');
    var debtsInput = document.getElementById('input-afford-debts');
    var rateInput = document.getElementById('input-afford-rate');
    var tenureInputEl = document.getElementById('input-afford-tenure');

    var income = parseINR(incomeInput?.value);
    var expenses = parseINR(expensesInput?.value) || 0;
    var debts = parseINR(debtsInput?.value) || 0;
    var rate = parseFloat(rateInput?.value);
    var tenureInput = parseFloat(tenureInputEl?.value);

    var hasError = false;

    if (!income || income <= 0) {
      if (errIncome) {
        errIncome.textContent = 'Please enter a valid monthly net income.';
        errIncome.style.display = 'block';
      }
      hasError = true;
    }

    if (!expensesInput?.value || isNaN(expenses) || expenses < 0) {
      if (errExpenses) {
        errExpenses.textContent = 'Please enter monthly living & household expenses.';
        errExpenses.style.display = 'block';
      }
      hasError = true;
    }

    if (affordBuffer === null || isNaN(affordBuffer) || affordBuffer < 0) {
      if (errBuffer) {
        errBuffer.textContent = 'Please select an emergency savings buffer percentage (e.g. 30%).';
        errBuffer.style.display = 'block';
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

    var tenureMonths = affordTenureUnit === 'years' ? Math.round(tenureInput * 12) : Math.round(tenureInput);
    if (tenureMonths > 360) {
      if (errTenure) {
        errTenure.textContent = 'Tenure cannot exceed 30 years (360 months).';
        errTenure.style.display = 'block';
      }
      return;
    }

    var totalOutflow = expenses + debts;
    var disposableSurplus = income - totalOutflow;

    var resAmountEl = document.getElementById('res-afford-amount');
    var resEmiEl = document.getElementById('res-afford-emi');
    var resSurplusEl = document.getElementById('res-afford-surplus');
    var resBufferEl = document.getElementById('res-afford-buffer');
    var resInterestEl = document.getElementById('res-afford-interest');
    var resultsWrap = document.getElementById('afford-results-wrapper');
    var affordPh = document.getElementById('afford-placeholder');

    if (disposableSurplus <= 0) {
      if (resAmountEl) resAmountEl.textContent = '₹0';
      if (resEmiEl) resEmiEl.textContent = '₹0';
      if (resSurplusEl) resSurplusEl.textContent = formatINR(disposableSurplus);
      if (resBufferEl) resBufferEl.textContent = '₹0';
      if (resInterestEl) resInterestEl.textContent = '₹0';

      if (banner) {
        banner.className = 'hub-banner warning';
        banner.innerHTML = '<i class="fas fa-triangle-exclamation"></i><div>' +
          '<div class="hub-banner-title">Negative or Zero Monthly Cashflow</div>' +
          'Living expenses (' + formatINR(expenses) + ') and existing debts (' + formatINR(debts) +
          ') equal or exceed monthly income. We recommend reducing monthly living expenses before taking on a new loan.</div>';
        banner.style.display = 'flex';
      }
      if (resultsWrap) resultsWrap.style.display = 'block';
      if (affordPh) affordPh.style.display = 'none';
      updateAffordabilityVisuals(income, expenses, debts, 0, 0, 0, 0, tenureMonths);
      return;
    }

    var allocationPct = (100 - affordBuffer) / 100;
    var comfortableEmi = Math.round(disposableSurplus * allocationPct);
    var emergencyBufferAmount = disposableSurplus - comfortableEmi;

    var affordablePrincipal = calculatePresentValue(comfortableEmi, rate, tenureMonths);
    var roundedPrincipal = Math.floor(affordablePrincipal / 1000) * 1000;
    if (roundedPrincipal < 10000) roundedPrincipal = Math.round(affordablePrincipal);

    var totalRepayment = comfortableEmi * tenureMonths;
    var totalInterest = totalRepayment - roundedPrincipal;
    if (totalInterest < 0) totalInterest = 0;

    if (resAmountEl) resAmountEl.textContent = formatINR(roundedPrincipal);
    if (resEmiEl) resEmiEl.textContent = formatINR(comfortableEmi) + ' / mo';
    if (resSurplusEl) resSurplusEl.textContent = formatINR(disposableSurplus);
    if (resBufferEl) resBufferEl.textContent = formatINR(emergencyBufferAmount) + ' / mo';
    if (resInterestEl) resInterestEl.textContent = formatINR(totalInterest);

    if (banner) {
      banner.className = 'hub-banner positive';
      banner.innerHTML = '<i class="fas fa-wallet"></i><div>' +
        '<div class="hub-banner-title">Estimated Affordable Loan: ' + formatINR(roundedPrincipal) + '</div>' +
        'With a monthly disposable surplus of <strong>' + formatINR(disposableSurplus) + '</strong> and a ' + affordBuffer +
        '% safety buffer (' + formatINR(emergencyBufferAmount) + '/mo preserved for emergency savings), you can comfortably support a monthly EMI of <strong>' +
        formatINR(comfortableEmi) + '</strong>.</div>';
      banner.style.display = 'flex';
    }

    if (resultsWrap) resultsWrap.style.display = 'block';
    if (affordPh) affordPh.style.display = 'none';
    updateAffordabilityVisuals(income, expenses, debts, comfortableEmi, emergencyBufferAmount, roundedPrincipal, totalInterest, tenureMonths);
  }

  function updateAffordabilityVisuals(income, expenses, debts, comfortableEmi, bufferSaved, principal, interest, months) {
    var segLiving = document.getElementById('seg-bar-living');
    var segDebts = document.getElementById('seg-bar-debts');
    var segNewEmi = document.getElementById('seg-bar-new-emi');
    var segSurplus = document.getElementById('seg-bar-surplus');

    var pctExpenses = Math.min(100, (expenses / income) * 100);
    var pctDebts = Math.min(100 - pctExpenses, (debts / income) * 100);
    var pctNew = Math.min(100 - pctExpenses - pctDebts, (comfortableEmi / income) * 100);
    var pctRemaining = Math.max(0, 100 - pctExpenses - pctDebts - pctNew);

    if (segLiving) segLiving.style.width = pctExpenses.toFixed(1) + '%';
    if (segDebts) segDebts.style.width = pctDebts.toFixed(1) + '%';
    if (segNewEmi) segNewEmi.style.width = pctNew.toFixed(1) + '%';
    if (segSurplus) segSurplus.style.width = pctRemaining.toFixed(1) + '%';

    var legLiving = document.getElementById('leg-val-living');
    var legDebts = document.getElementById('leg-val-debts');
    var legNew = document.getElementById('leg-val-new');
    var legSurplus = document.getElementById('leg-val-surplus');

    if (legLiving) legLiving.textContent = formatINR(expenses) + ' (' + pctExpenses.toFixed(0) + '%)';
    if (legDebts) legDebts.textContent = formatINR(debts) + ' (' + pctDebts.toFixed(0) + '%)';
    if (legNew) legNew.textContent = formatINR(comfortableEmi) + ' (' + pctNew.toFixed(0) + '%)';
    if (legSurplus) legSurplus.textContent = formatINR(bufferSaved) + ' (' + pctRemaining.toFixed(0) + '%)';

    var tbl = document.getElementById('afford-breakdown-tbody');
    if (!tbl) return;
    tbl.innerHTML =
      '<tr><td>Gross Monthly Income</td><td class="text-right"><strong>' + formatINR(income) + '</strong></td></tr>' +
      '<tr><td>Monthly Household & Living Outflows</td><td class="text-right hub-val-negative">- ' + formatINR(expenses) + '</td></tr>' +
      '<tr><td>Existing Debt / EMI Obligations</td><td class="text-right hub-val-negative">- ' + formatINR(debts) + '</td></tr>' +
      '<tr><td>Net Monthly Disposable Cash Surplus</td><td class="text-right"><strong>' + formatINR(income - expenses - debts) + '</strong></td></tr>' +
      '<tr><td>Comfortable New EMI Allocation (' + (100 - (affordBuffer || 0)) + '%)</td><td class="text-right hub-val-positive"><strong>' + formatINR(comfortableEmi) + ' / mo</strong></td></tr>' +
      '<tr><td>Preserved Emergency Savings Buffer (' + (affordBuffer || 0) + '%)</td><td class="text-right">' + formatINR(bufferSaved) + ' / mo</td></tr>' +
      '<tr><td>Estimated Affordable Loan Amount</td><td class="text-right hub-val-highlight"><strong>' + formatINR(principal) + '</strong></td></tr>' +
      '<tr><td>Total Interest Payable (' + months + ' mos)</td><td class="text-right">' + formatINR(interest) + '</td></tr>';
  }

  function resetAffordability() {
    var form = document.getElementById('afford-form');
    if (form) form.reset();

    var ids = ['input-afford-income', 'input-afford-expenses', 'input-afford-debts', 'input-afford-rate', 'input-afford-tenure'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });

    setAffordabilityTenureUnit('years');
    affordBuffer = null;
    document.querySelectorAll('#afford-buffer-pills .preset-pill').forEach(function (p) {
      p.classList.remove('active');
    });

    ['err-afford-income', 'err-afford-expenses', 'err-afford-buffer', 'err-afford-rate', 'err-afford-tenure'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    var resultsWrap = document.getElementById('afford-results-wrapper');
    if (resultsWrap) resultsWrap.style.display = 'none';
    var affordPh = document.getElementById('afford-placeholder');
    if (affordPh) affordPh.style.display = 'block';
    var banner = document.getElementById('afford-banner');
    if (banner) banner.style.display = 'none';

    // Reset progress bar segments
    ['seg-bar-living', 'seg-bar-debts', 'seg-bar-new-emi', 'seg-bar-surplus'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.width = '0%';
    });
  }

  // ── 3. Prepayment Calculator ─────────────────────────────────────
  var prepayTenureUnit = 'months';
  var selectedPrepayStrategy = 'tenure'; // 'tenure' (Option A) or 'emi' (Option B)

  function setPrepaymentTenureUnit(unit) {
    prepayTenureUnit = unit;
    var btnM = document.getElementById('btn-prepay-months');
    var btnY = document.getElementById('btn-prepay-years');
    if (btnM && btnY) {
      btnM.classList.toggle('active', unit === 'months');
      btnY.classList.toggle('active', unit === 'years');
    }
  }

  function setPrepaymentStrategy(strategy) {
    selectedPrepayStrategy = strategy;
    var cardA = document.getElementById('strategy-card-a');
    var cardB = document.getElementById('strategy-card-b');
    if (cardA && cardB) {
      cardA.classList.toggle('selected', strategy === 'tenure');
      cardB.classList.toggle('selected', strategy === 'emi');
    }
  }

  function calculatePrepayEMIFromDetails() {
    var errPrincipal = document.getElementById('err-prepay-principal');
    var errRate = document.getElementById('err-prepay-rate');
    var errTenure = document.getElementById('err-prepay-tenure');
    if (errPrincipal) errPrincipal.style.display = 'none';
    if (errRate) errRate.style.display = 'none';
    if (errTenure) errTenure.style.display = 'none';

    var principal = parseINR(document.getElementById('input-prepay-principal')?.value);
    var rate = parseFloat(document.getElementById('input-prepay-rate')?.value);
    var tenureInput = parseFloat(document.getElementById('input-prepay-tenure')?.value);
    var emiInput = document.getElementById('input-prepay-emi');

    var hasErr = false;
    if (!principal || principal <= 0) {
      if (errPrincipal) {
        errPrincipal.textContent = 'Please enter current outstanding principal first.';
        errPrincipal.style.display = 'block';
      }
      hasErr = true;
    }
    if (isNaN(rate) || rate <= 0 || rate > 50) {
      if (errRate) {
        errRate.textContent = 'Please enter valid interest rate (0.1% - 50%).';
        errRate.style.display = 'block';
      }
      hasErr = true;
    }
    if (isNaN(tenureInput) || tenureInput <= 0) {
      if (errTenure) {
        errTenure.textContent = 'Please enter valid remaining tenure.';
        errTenure.style.display = 'block';
      }
      hasErr = true;
    }
    if (hasErr) return;

    var months = prepayTenureUnit === 'years' ? Math.round(tenureInput * 12) : Math.round(tenureInput);
    var calculated = Math.round(calculateStandardEMI(principal, rate, months));
    if (emiInput) {
      emiInput.value = formatNumberWithCommas(calculated);
    }
  }

  function calculatePrepayment() {
    var errPrincipal = document.getElementById('err-prepay-principal');
    var errRate = document.getElementById('err-prepay-rate');
    var errTenure = document.getElementById('err-prepay-tenure');
    var errAmount = document.getElementById('err-prepay-amount');
    var banner = document.getElementById('prepay-banner');

    if (errPrincipal) errPrincipal.style.display = 'none';
    if (errRate) errRate.style.display = 'none';
    if (errTenure) errTenure.style.display = 'none';
    if (errAmount) errAmount.style.display = 'none';
    if (banner) banner.style.display = 'none';

    var principal = parseINR(document.getElementById('input-prepay-principal')?.value);
    var rate = parseFloat(document.getElementById('input-prepay-rate')?.value);
    var tenureInput = parseFloat(document.getElementById('input-prepay-tenure')?.value);
    var emi = parseINR(document.getElementById('input-prepay-emi')?.value);
    var prepayAmount = parseINR(document.getElementById('input-prepay-amount')?.value);
    var feePct = parseFloat(document.getElementById('input-prepay-fee')?.value) || 0;

    var hasError = false;

    if (!principal || principal <= 0) {
      if (errPrincipal) {
        errPrincipal.textContent = 'Please enter a valid outstanding principal.';
        errPrincipal.style.display = 'block';
      }
      hasError = true;
    }

    if (isNaN(rate) || rate <= 0 || rate > 50) {
      if (errRate) {
        errRate.textContent = 'Please enter a valid interest rate (0.1% - 50%).';
        errRate.style.display = 'block';
      }
      hasError = true;
    }

    if (isNaN(tenureInput) || tenureInput <= 0) {
      if (errTenure) {
        errTenure.textContent = 'Please enter a valid remaining tenure.';
        errTenure.style.display = 'block';
      }
      hasError = true;
    }

    if (!prepayAmount || prepayAmount <= 0) {
      if (errAmount) {
        errAmount.textContent = 'Please enter a prepayment amount greater than 0.';
        errAmount.style.display = 'block';
      }
      hasError = true;
    } else if (prepayAmount >= principal) {
      if (errAmount) {
        errAmount.textContent = 'Prepayment amount must be less than current outstanding principal (use loan foreclosure for 100% payoff).';
        errAmount.style.display = 'block';
      }
      hasError = true;
    }

    if (hasError) return;

    var totalMonths = prepayTenureUnit === 'years' ? Math.round(tenureInput * 12) : Math.round(tenureInput);
    if (!emi || emi <= 0) {
      emi = Math.round(calculateStandardEMI(principal, rate, totalMonths));
    }

    var r = rate / (12 * 100);
    var remainingPrincipal = principal - prepayAmount;
    var prepayCharge = Math.round((prepayAmount * feePct) / 100);

    // Baseline calculation (Without Prepayment)
    var baselineTotalRepayment = emi * totalMonths;
    var baselineTotalInterest = baselineTotalRepayment - principal;
    if (baselineTotalInterest < 0) baselineTotalInterest = 0;

    // --- Option A: Reduce Tenure (Keep EMI Same) ---
    var newTenureMonths = totalMonths;
    var interestSavedOptA = 0;
    var tenureSavedOptA = 0;
    var totalInterestOptA = 0;

    if (r > 0) {
      var numerator = 1 - (r * remainingPrincipal) / emi;
      if (numerator > 0) {
        var rawTenure = -Math.log(numerator) / Math.log(1 + r);
        newTenureMonths = Math.ceil(rawTenure);
        tenureSavedOptA = Math.max(0, totalMonths - newTenureMonths);
        var totalRepaidOptA = emi * newTenureMonths;
        totalInterestOptA = Math.max(0, totalRepaidOptA - remainingPrincipal);
        interestSavedOptA = Math.max(0, baselineTotalInterest - totalInterestOptA);
      }
    }
    var netSavingsOptA = Math.max(0, interestSavedOptA - prepayCharge);

    // --- Option B: Reduce EMI (Keep Tenure Same) ---
    var newEmiOptB = Math.round(calculateStandardEMI(remainingPrincipal, rate, totalMonths));
    var emiSavedOptB = Math.max(0, emi - newEmiOptB);
    var totalRepaidOptB = newEmiOptB * totalMonths;
    var totalInterestOptB = Math.max(0, totalRepaidOptB - remainingPrincipal);
    var interestSavedOptB = Math.max(0, baselineTotalInterest - totalInterestOptB);
    var netSavingsOptB = Math.max(0, interestSavedOptB - prepayCharge);

    // Render results
    var resultsWrap = document.getElementById('prepay-results-wrapper');
    if (resultsWrap) resultsWrap.style.display = 'block';
    var prepayPh = document.getElementById('prepay-placeholder');
    if (prepayPh) prepayPh.style.display = 'none';

    // Primary stat cards based on selected strategy
    var activeNetSavings = selectedPrepayStrategy === 'tenure' ? netSavingsOptA : netSavingsOptB;
    var activeInterestSaved = selectedPrepayStrategy === 'tenure' ? interestSavedOptA : interestSavedOptB;
    var activeMetricLabel = selectedPrepayStrategy === 'tenure' ? 'Tenure Saved' : 'Monthly EMI Saved';
    var activeMetricVal = selectedPrepayStrategy === 'tenure'
      ? (tenureSavedOptA + ' Months (' + (tenureSavedOptA / 12).toFixed(1) + ' yrs)')
      : (formatINR(emiSavedOptB) + ' / mo');

    var resSavingsEl = document.getElementById('res-prepay-savings');
    var resInterestSavedEl = document.getElementById('res-prepay-interest-saved');
    var resMetricEl = document.getElementById('res-prepay-metric');
    var resMetricLabelEl = document.getElementById('res-prepay-metric-label');
    var resRemainingEl = document.getElementById('res-prepay-remaining');
    var resChargesEl = document.getElementById('res-prepay-charges');

    if (resSavingsEl) resSavingsEl.textContent = formatINR(activeNetSavings);
    if (resInterestSavedEl) resInterestSavedEl.textContent = formatINR(activeInterestSaved);
    if (resMetricEl) resMetricEl.textContent = activeMetricVal;
    if (resMetricLabelEl) resMetricLabelEl.textContent = activeMetricLabel;
    if (resRemainingEl) resRemainingEl.textContent = formatINR(remainingPrincipal);
    if (resChargesEl) resChargesEl.textContent = formatINR(prepayCharge);

    // Strategy comparison cards
    var cardATenure = document.getElementById('card-a-tenure-saved');
    var cardAInterest = document.getElementById('card-a-interest-saved');
    var cardANet = document.getElementById('card-a-net-savings');
    var cardBEmi = document.getElementById('card-b-emi-saved');
    var cardBInterest = document.getElementById('card-b-interest-saved');
    var cardBNet = document.getElementById('card-b-net-savings');

    if (cardATenure) cardATenure.textContent = tenureSavedOptA + ' Months (' + (tenureSavedOptA / 12).toFixed(1) + ' yrs)';
    if (cardAInterest) cardAInterest.textContent = formatINR(interestSavedOptA);
    if (cardANet) cardANet.textContent = formatINR(netSavingsOptA);

    if (cardBEmi) cardBEmi.textContent = formatINR(emiSavedOptB) + ' / month';
    if (cardBInterest) cardBInterest.textContent = formatINR(interestSavedOptB);
    if (cardBNet) cardBNet.textContent = formatINR(netSavingsOptB);

    // Highlight active card
    setPrepaymentStrategy(selectedPrepayStrategy);

    // Comparison Table
    var tbl = document.getElementById('prepay-comparison-tbody');
    if (tbl) {
      tbl.innerHTML =
        '<tr><td>Outstanding Principal</td><td>' + formatINR(principal) + '</td><td>' + formatINR(principal) + '</td><td>' + formatINR(principal) + '</td></tr>' +
        '<tr><td>Part-Prepayment Amount</td><td>—</td><td class="hub-val-highlight">' + formatINR(prepayAmount) + '</td><td class="hub-val-highlight">' + formatINR(prepayAmount) + '</td></tr>' +
        '<tr><td>Remaining Loan Balance</td><td>' + formatINR(principal) + '</td><td>' + formatINR(remainingPrincipal) + '</td><td>' + formatINR(remainingPrincipal) + '</td></tr>' +
        '<tr><td>Monthly EMI</td><td>' + formatINR(emi) + '</td><td>' + formatINR(emi) + '</td><td class="hub-val-positive">' + formatINR(newEmiOptB) + ' (-' + formatINR(emiSavedOptB) + ')</td></tr>' +
        '<tr><td>Remaining Loan Tenure</td><td>' + totalMonths + ' months</td><td class="hub-val-positive">' + newTenureMonths + ' months (-' + tenureSavedOptA + ' mos)</td><td>' + totalMonths + ' months</td></tr>' +
        '<tr><td>Total Interest Payable</td><td>' + formatINR(baselineTotalInterest) + '</td><td>' + formatINR(totalInterestOptA) + '</td><td>' + formatINR(totalInterestOptB) + '</td></tr>' +
        '<tr><td>Prepayment Charges (' + feePct + '%)</td><td>—</td><td>' + formatINR(prepayCharge) + '</td><td>' + formatINR(prepayCharge) + '</td></tr>' +
        '<tr style="background:var(--bg-secondary); font-weight:700;"><td>Net Lifetime Savings</td><td>—</td><td class="hub-val-positive">' + formatINR(netSavingsOptA) + '</td><td class="hub-val-positive">' + formatINR(netSavingsOptB) + '</td></tr>';
    }

    if (banner) {
      banner.className = 'hub-banner positive';
      banner.innerHTML = '<i class="fas fa-coins"></i><div>' +
        '<div class="hub-banner-title">Prepayment Savings Summary</div>' +
        'A part-prepayment of <strong>' + formatINR(prepayAmount) + '</strong> reduces your loan balance to <strong>' + formatINR(remainingPrincipal) + '</strong>. ' +
        (selectedPrepayStrategy === 'tenure'
          ? ('By reducing tenure (Option A), you will save <strong>' + tenureSavedOptA + ' months</strong> and a net total of <strong>' + formatINR(netSavingsOptA) + '</strong> in interest!')
          : ('By reducing monthly EMI (Option B), your EMI drops by <strong>' + formatINR(emiSavedOptB) + '/mo</strong> with net interest savings of <strong>' + formatINR(netSavingsOptB) + '</strong>!')) +
        '</div>';
      banner.style.display = 'flex';
    }
  }

  function resetPrepayment() {
    var form = document.getElementById('prepay-form');
    if (form) form.reset();

    var ids = ['input-prepay-principal', 'input-prepay-rate', 'input-prepay-tenure', 'input-prepay-emi', 'input-prepay-amount', 'input-prepay-fee'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });

    setPrepaymentTenureUnit('months');
    selectedPrepayStrategy = 'tenure';

    var cardA = document.getElementById('strategy-card-a');
    var cardB = document.getElementById('strategy-card-b');
    if (cardA) cardA.classList.remove('selected');
    if (cardB) cardB.classList.remove('selected');

    ['err-prepay-principal', 'err-prepay-rate', 'err-prepay-tenure', 'err-prepay-amount'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    var resultsWrap = document.getElementById('prepay-results-wrapper');
    if (resultsWrap) resultsWrap.style.display = 'none';
    var prepayPh = document.getElementById('prepay-placeholder');
    if (prepayPh) prepayPh.style.display = 'block';
    var banner = document.getElementById('prepay-banner');
    if (banner) banner.style.display = 'none';
  }

  // ── 4. Balance Transfer Calculator ───────────────────────────────
  function calculateTransferExistingEMIFromDetails() {
    var errP = document.getElementById('err-transfer-principal');
    var errR1 = document.getElementById('err-transfer-r1');
    var errT1 = document.getElementById('err-transfer-t1');
    if (errP) errP.style.display = 'none';
    if (errR1) errR1.style.display = 'none';
    if (errT1) errT1.style.display = 'none';

    var principal = parseINR(document.getElementById('input-transfer-existing-principal')?.value);
    var rate = parseFloat(document.getElementById('input-transfer-existing-rate')?.value);
    var tenure = parseFloat(document.getElementById('input-transfer-existing-tenure')?.value);
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

    var principal = parseINR(document.getElementById('input-transfer-existing-principal')?.value);
    var rate1 = parseFloat(document.getElementById('input-transfer-existing-rate')?.value);
    var tenure1 = parseFloat(document.getElementById('input-transfer-existing-tenure')?.value);
    var emi1 = parseINR(document.getElementById('input-transfer-existing-emi')?.value);

    var rate2 = parseFloat(document.getElementById('input-transfer-new-rate')?.value);
    var tenure2 = parseFloat(document.getElementById('input-transfer-new-tenure')?.value);
    var feePct = parseFloat(document.getElementById('input-transfer-fee-pct')?.value) || 0;
    var otherCharges = parseINR(document.getElementById('input-transfer-other-charges')?.value) || 0;

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

    var breakevenMonths = monthlySavings > 0
      ? Math.ceil(totalTransferCosts / monthlySavings)
      : null;

    var resultsWrap = document.getElementById('transfer-results-wrapper');
    if (resultsWrap) resultsWrap.style.display = 'block';
    var transferPh = document.getElementById('transfer-placeholder');
    if (transferPh) transferPh.style.display = 'none';

    var resSavingsEl = document.getElementById('res-transfer-savings');
    var resMonthlyEl = document.getElementById('res-transfer-monthly');
    var resInterestEl = document.getElementById('res-transfer-interest');
    var resCostsEl = document.getElementById('res-transfer-costs');
    var resBreakevenEl = document.getElementById('res-transfer-breakeven');

    if (resSavingsEl) {
      resSavingsEl.textContent = formatINR(netSavings);
      resSavingsEl.style.color = netSavings > 0 ? 'var(--success)' : 'var(--danger)';
    }
    if (resMonthlyEl) resMonthlyEl.textContent = (monthlySavings >= 0 ? '+' : '') + formatINR(monthlySavings) + ' / mo';
    if (resInterestEl) resInterestEl.textContent = (interestSavings >= 0 ? '+' : '') + formatINR(interestSavings);
    if (resCostsEl) resCostsEl.textContent = formatINR(totalTransferCosts);
    if (resBreakevenEl) resBreakevenEl.textContent = breakevenMonths ? (breakevenMonths + ' Months') : 'N/A';

    // Comparison Table
    var tbl = document.getElementById('transfer-comparison-tbody');
    if (tbl) {
      var rateDiff = (rate2 - rate1).toFixed(2);
      var tenureDiff = tenure2 - tenure1;
      var emiDiff = emi2 - emi1;
      var interestDiff = totalInterest2 - totalInterest1;
      var costDiff = totalCost2 - totalCost1;

      tbl.innerHTML =
        '<tr><td>Interest Rate (% p.a.)</td><td>' + rate1.toFixed(2) + '%</td><td>' + rate2.toFixed(2) + '%</td><td class="' + (rateDiff < 0 ? 'hub-val-positive' : 'hub-val-negative') + '">' + (rateDiff > 0 ? '+' : '') + rateDiff + '%</td></tr>' +
        '<tr><td>Remaining Tenure</td><td>' + tenure1 + ' months</td><td>' + tenure2 + ' months</td><td>' + (tenureDiff > 0 ? '+' : '') + tenureDiff + ' months</td></tr>' +
        '<tr><td>Monthly EMI</td><td>' + formatINR(emi1) + '</td><td>' + formatINR(emi2) + '</td><td class="' + (emiDiff < 0 ? 'hub-val-positive' : 'hub-val-negative') + '">' + (emiDiff > 0 ? '+' : '') + formatINR(emiDiff) + '</td></tr>' +
        '<tr><td>Total Interest Payable</td><td>' + formatINR(totalInterest1) + '</td><td>' + formatINR(totalInterest2) + '</td><td class="' + (interestDiff < 0 ? 'hub-val-positive' : 'hub-val-negative') + '">' + (interestDiff > 0 ? '+' : '') + formatINR(interestDiff) + '</td></tr>' +
        '<tr><td>Processing Fee & Charges</td><td>—</td><td>' + formatINR(totalTransferCosts) + '</td><td class="hub-val-negative">+' + formatINR(totalTransferCosts) + '</td></tr>' +
        '<tr style="background:var(--bg-secondary); font-weight:700;"><td>Total Cost of Loan</td><td>' + formatINR(totalCost1) + '</td><td>' + formatINR(totalCost2) + '</td><td class="' + (costDiff < 0 ? 'hub-val-positive' : 'hub-val-negative') + '">' + (costDiff > 0 ? '+' : '') + formatINR(costDiff) + '</td></tr>';
    }

    if (banner) {
      if (netSavings > 0) {
        banner.className = 'hub-banner positive';
        banner.innerHTML = '<i class="fas fa-right-left"></i><div>' +
          '<div class="hub-banner-title">Potential Net Savings: ' + formatINR(netSavings) + '</div>' +
          'Transferring to the new lender at ' + rate2.toFixed(2) + '% p.a. reduces your monthly EMI by <strong>' + formatINR(monthlySavings) +
          '/mo</strong>. After accounting for all transfer costs (' + formatINR(totalTransferCosts) + '), the estimated break-even period is <strong>' +
          (breakevenMonths ? (breakevenMonths + ' months') : 'immediate') + '</strong>.</div>';
      } else {
        banner.className = 'hub-banner warning';
        banner.innerHTML = '<i class="fas fa-triangle-exclamation"></i><div>' +
          '<div class="hub-banner-title">Balance Transfer May Not Be Cost-Effective</div>' +
          'The proposed transfer results in higher total expenditure of <strong>' + formatINR(Math.abs(netSavings)) +
          '</strong> after factoring in transfer fees and interest charges over the remaining tenure.</div>';
      }
      banner.style.display = 'flex';
    }
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
  }

  // ── Auto Initialization ──────────────────────────────────────────
  function initCalculatorHub() {
    // Attach masks to currency fields
    var currencyFields = [
      'input-elig-income', 'input-elig-existing-emi',
      'input-afford-income', 'input-afford-expenses', 'input-afford-debts',
      'input-prepay-principal', 'input-prepay-emi', 'input-prepay-amount',
      'input-transfer-existing-principal', 'input-transfer-existing-emi', 'input-transfer-other-charges'
    ];
    currencyFields.forEach(function (id) {
      attachCurrencyMask(document.getElementById(id));
    });

    // Default to 'emi' tab
    switchHubTab('emi');

    // ALL 4 OTHER CALCULATORS REMAIN STRICTLY EMPTY INITIALLY.
    // Zero demo or sample calculations are run here.
  }

  // Export functions to window
  window.switchHubTab = switchHubTab;
  window.setEligibilityTenureUnit = setEligibilityTenureUnit;
  window.setEligibilityFoir = setEligibilityFoir;
  window.calculateEligibility = calculateEligibility;
  window.resetEligibility = resetEligibility;
  window.prefillEmiFromEligibility = prefillEmiFromEligibility;

  window.setAffordabilityTenureUnit = setAffordabilityTenureUnit;
  window.setAffordabilityBuffer = setAffordabilityBuffer;
  window.calculateAffordability = calculateAffordability;
  window.resetAffordability = resetAffordability;

  window.setPrepaymentTenureUnit = setPrepaymentTenureUnit;
  window.setPrepaymentStrategy = setPrepaymentStrategy;
  window.calculatePrepayEMIFromDetails = calculatePrepayEMIFromDetails;
  window.calculatePrepayment = calculatePrepayment;
  window.resetPrepayment = resetPrepayment;

  window.calculateTransferExistingEMIFromDetails = calculateTransferExistingEMIFromDetails;
  window.calculateBalanceTransfer = calculateBalanceTransfer;
  window.resetBalanceTransfer = resetBalanceTransfer;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCalculatorHub);
  } else {
    initCalculatorHub();
  }
})();
