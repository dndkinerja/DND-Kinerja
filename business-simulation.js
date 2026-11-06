(() => {
  const STORAGE_KEY = 'dnd_business_projection_v1';
  const defaults = {
    year: new Date().getFullYear(), revenue: 0, quarters: [20, 25, 25, 30],
    profitTargetRate: 0, pphRate: 1.75, vatRate: 11, inputVatShare: 80,
    direct: { materials: 0, labor: 0, subcontract: 0, equipment: 0, logistics: 0, otherDirect: 0 },
    operating: { office: 0, admin: 0, marketing: 0, depreciation: 0, otherOperating: 0 }, costModes: { direct: { materials: 'amount', labor: 'amount', subcontract: 'amount', equipment: 'amount', logistics: 'amount', otherDirect: 'amount' }, operating: { office: 'amount', admin: 'amount', marketing: 'amount', depreciation: 'amount', otherOperating: 'amount' } }, payroll: { annualSalary: 0, annualThr: 0, annualEmployerBenefits: 0, thrMode: 'automatic', thrMultiplier: 1 }
  };
  const directLabels = [
    ['materials', 'Material dan bahan konstruksi'], ['labor', 'Tenaga kerja lapangan'],
    ['subcontract', 'Subkontraktor'], ['equipment', 'Peralatan dan sewa alat'],
    ['logistics', 'Transportasi dan logistik'], ['otherDirect', 'Biaya langsung lainnya']
  ];
  const operatingLabels = [
    ['office', 'Sewa kantor dan utilitas'], ['admin', 'Administrasi, legal, dan profesional'],
    ['marketing', 'Pemasaran dan komunikasi'], ['depreciation', 'Penyusutan dan biaya pembiayaan'],
    ['otherOperating', 'Biaya operasional lainnya']
  ];
  const money = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
  const parseLocaleNumber = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    let raw = String(value ?? '').trim().replace(/[^0-9,.-]/g, '');
    if (!raw || raw === '-' || raw === ',' || raw === '.') return 0;
    const comma = raw.lastIndexOf(','), dot = raw.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
      raw = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
    } else if (comma >= 0) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else if (dot >= 0) {
      const parts = raw.split('.');
      if (parts.length > 2) {
        const decimalPart = parts.pop();
        raw = parts.join('') + (decimalPart.length <= 2 ? '.' + decimalPart : decimalPart);
      } else if (parts[1].length === 3) raw = parts.join('');
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const number = value => parseLocaleNumber(value);
  const displayNumber = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(number(value));
  const bindLocaleInput = el => {
    if (!el || el.dataset.localeBound) return;
    el.dataset.localeBound = 'true';
    el.addEventListener('focus', () => { const value = number(el.value); el.value = value ? String(value) : ''; });
    el.addEventListener('blur', () => { el.value = displayNumber(el.value); });
  };
  const input = id => document.getElementById(id);
  const safePercent = value => Math.min(100, Math.max(0, number(value)));
  function normalizedQuarterShares() {
    const shares = state.quarters.map(safePercent), total = shares.reduce((sum, share) => sum + share, 0);
    return total > 0 ? shares.map(share => share / total) : [0.25, 0.25, 0.25, 0.25];
  }
  let state = load();

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return structuredClone(defaults);
      const oldPayroll = saved.payroll || {};
      const oldOperating = { ...(saved.operating || {}) };
      const extraSalary = number(oldOperating.salaries);
      delete oldOperating.salaries;
      const headcount = number(oldPayroll.headcount);
      const payroll = {
        annualSalary: oldPayroll.annualSalary !== undefined ? oldPayroll.annualSalary : headcount * number(oldPayroll.monthlySalary) * 12 + extraSalary,
        annualThr: oldPayroll.annualThr !== undefined ? oldPayroll.annualThr : headcount * number(oldPayroll.annualAllowance),
        annualEmployerBenefits: oldPayroll.annualEmployerBenefits !== undefined ? oldPayroll.annualEmployerBenefits : headcount * number(oldPayroll.monthlyEmployerBenefits) * 12,
        thrMode: ['automatic', 'multiplier', 'manual'].includes(oldPayroll.thrMode) ? oldPayroll.thrMode : defaults.payroll.thrMode,
        thrMultiplier: oldPayroll.thrMultiplier !== undefined ? number(oldPayroll.thrMultiplier) : defaults.payroll.thrMultiplier
      };
      return {
        ...defaults, ...saved,
        quarters: Array.isArray(saved.quarters) ? saved.quarters.slice(0, 4) : defaults.quarters.slice(),
        direct: { ...defaults.direct, ...(saved.direct || {}) },
        operating: { ...defaults.operating, ...oldOperating },
        costModes: { direct: { ...defaults.costModes.direct, ...(saved.costModes?.direct || {}) }, operating: { ...defaults.costModes.operating, ...(saved.costModes?.operating || {}) } },
        payroll
      };
    } catch (_) { return structuredClone(defaults); }
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* storage may be unavailable in private browsing */ }
  }

  function directCostBase() {
    const revenue = number(state.revenue);
    const finalPph = revenue * number(state.pphRate) / 100;
    const plannedProfit = revenue * number(state.profitTargetRate) / 100;
    return Math.max(0, revenue - finalPph - plannedProfit);
  }
  function costAmount(group, key) {
    const value = number(state[group][key]);
    const base = group === 'direct' ? directCostBase() : number(state.revenue);
    return state.costModes?.[group]?.[key] === 'percent' ? base * value / 100 : value;
  }
  function totalCosts(group) { return Object.keys(state[group]).reduce((sum, key) => sum + costAmount(group, key), 0); }
  function payrollRoster() {
    const db = window.dndApp?.getDb?.();
    if (!db?.settings) return { employees: [], records: {}, configured: false };
    db.settings.employeePayroll ||= {};
    const employees = (db.users || []).filter(employee => employee.role !== 'admin' && employee.approved !== false);
    const records = db.settings.employeePayroll;
    const configured = employees.some(employee => Boolean(records[String(employee.id)]?.startDate));
    return { employees, records, configured };
  }
  function payrollTotals() {
    const roster = payrollRoster();
    const mode = ['automatic', 'multiplier', 'manual'].includes(state.payroll.thrMode) ? state.payroll.thrMode : 'automatic';
    const multiplier = number(state.payroll.thrMultiplier ?? 1);
    if (!roster.configured) {
      const salary = number(state.payroll.annualSalary), monthlyWage = salary / 12;
      const allowance = mode === 'manual' ? number(state.payroll.annualThr) : monthlyWage * (mode === 'multiplier' ? multiplier : 1);
      return { salary, allowance, employerBenefits: number(state.payroll.annualEmployerBenefits), monthlyWage, thrMode: mode, thrMultiplier: multiplier, source: 'manual' };
    }
    const year = Math.trunc(number(state.year)) || new Date().getFullYear();
    const yearStart = new Date(year, 0, 1), yearEnd = new Date(year, 11, 31);
    let salary = 0, employerBenefits = 0, monthlyWage = 0;
    for (const employee of roster.employees) {
      const record = roster.records[String(employee.id)] || {};
      if (!record.startDate) continue;
      const start = new Date(record.startDate + 'T00:00:00');
      const end = record.resignationDate ? new Date(record.resignationDate + 'T00:00:00') : yearEnd;
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < yearStart || start > yearEnd || end < start) continue;
      const monthlySalary = number(record.monthlySalary), monthlyAllowance = number(record.monthlyAllowance), monthlyBenefits = number(record.monthlyEmployerBenefits);
      monthlyWage += monthlySalary + monthlyAllowance;
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(year, month, 1), monthEnd = new Date(year, month + 1, 0);
        const activeStart = new Date(Math.max(start.getTime(), monthStart.getTime()));
        const activeEnd = new Date(Math.min(end.getTime(), monthEnd.getTime()));
        if (activeEnd < activeStart) continue;
        const days = Math.round((monthEnd - monthStart) / 86400000) + 1;
        const daysActive = Math.round((activeEnd - activeStart) / 86400000) + 1;
        salary += (monthlySalary + monthlyAllowance) * daysActive / days;
        employerBenefits += monthlyBenefits * daysActive / days;
      }
    }
    const allowance = mode === 'manual' ? number(state.payroll.annualThr) : monthlyWage * (mode === 'multiplier' ? multiplier : 1);
    return { salary, allowance, employerBenefits, monthlyWage, thrMode: mode, thrMultiplier: multiplier, source: 'roster' };
  }
  const ptkpValues = { 'TK/0': 54000000, 'TK/1': 58500000, 'TK/2': 63000000, 'TK/3': 67500000, 'K/0': 58500000, 'K/1': 63000000, 'K/2': 67500000, 'K/3': 72000000 };
  function annualPph21(gross, ptkpStatus, activeMonths = 12) {
    const jobExpense = Math.min(Math.max(0, gross) * 0.05, Math.max(0, activeMonths) * 500000);
    const ptkp = ptkpValues[ptkpStatus] || ptkpValues['TK/0'];
    const taxable = Math.floor(Math.max(0, gross - jobExpense - ptkp) / 1000) * 1000;
    const brackets = [[60000000, .05], [250000000, .15], [500000000, .25], [5000000000, .30], [Infinity, .35]];
    let previous = 0, tax = 0;
    for (const [limit, rate] of brackets) {
      const part = Math.max(0, Math.min(taxable, limit) - previous);
      tax += part * rate; previous = limit;
      if (taxable <= limit) break;
    }
    return Math.round(tax);
  }
  function estimateEmployeePph21(payroll = payrollTotals()) {
    const { employees, records, configured } = payrollRoster(), year = Math.trunc(number(state.year)) || new Date().getFullYear();
    let rows = [];
    if (configured) {
      const yearStart = new Date(year, 0, 1), yearEnd = new Date(year, 11, 31), multiplier = number(payroll.thrMultiplier ?? 1);
      for (const employee of employees) {
        const record = records[String(employee.id)] || {};
        if (!record.startDate) continue;
        const start = new Date(record.startDate + 'T00:00:00'), end = record.resignationDate ? new Date(record.resignationDate + 'T00:00:00') : yearEnd;
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < yearStart || start > yearEnd || end < start) continue;
        const monthly = number(record.monthlySalary) + number(record.monthlyAllowance);
        let salary = 0, activeMonths = 0;
        for (let month = 0; month < 12; month++) {
          const monthStart = new Date(year, month, 1), monthEnd = new Date(year, month + 1, 0);
          const activeStart = new Date(Math.max(start.getTime(), monthStart.getTime())), activeEnd = new Date(Math.min(end.getTime(), monthEnd.getTime()));
          if (activeEnd < activeStart) continue;
          activeMonths++;
          const days = Math.round((monthEnd - monthStart) / 86400000) + 1, daysActive = Math.round((activeEnd - activeStart) / 86400000) + 1;
          salary += monthly * daysActive / days;
        }
        rows.push({ employee, record, salary, monthly, activeMonths, thr: 0 });
      }
      if (payroll.thrMode === 'manual') {
        const totalSalary = rows.reduce((sum, row) => sum + row.salary, 0), equalShare = rows.length ? number(payroll.allowance) / rows.length : 0;
        rows.forEach(row => { row.thr = totalSalary ? number(payroll.allowance) * row.salary / totalSalary : equalShare; });
      } else rows.forEach(row => { row.thr = row.monthly * multiplier; });
    } else {
      const weights = employees.map(employee => {
        const record = records[String(employee.id)] || {};
        return Math.max(0, number(record.monthlySalary) + number(record.monthlyAllowance));
      });
      const weightTotal = weights.reduce((sum, value) => sum + value, 0), equalShare = employees.length ? 1 / employees.length : 0;
      rows = employees.map((employee, index) => {
        const record = records[String(employee.id)] || {}, share = weightTotal ? weights[index] / weightTotal : equalShare;
        return { employee, record, salary: number(payroll.salary) * share, thr: number(payroll.allowance) * share, activeMonths: 12 };
      });
    }
    const byId = {};
    rows.forEach(row => {
      const status = ptkpValues[row.record.ptkpStatus] ? row.record.ptkpStatus : 'TK/0';
      const tax = annualPph21(row.salary + row.thr, status, row.activeMonths);
      byId[String(row.employee.id)] = { tax, gross: row.salary + row.thr, status };
    });
    return { byId, total: Object.values(byId).reduce((sum, row) => sum + row.tax, 0), year };
  }
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function renderPayrollRoster() {
    const host = input('projectionPayrollRoster');
    if (!host) return;
    const { employees, records } = payrollRoster();
    const english = localStorage.getItem('dnd_language') === 'en';
    const calculatePph21 = localStorage.getItem('dnd_calculate_employee_pph21') !== 'false';
    const signature = [english ? 'en' : 'id', calculatePph21 ? 'pph21-on' : 'pph21-off', ...employees.map(employee => [employee.id, employee.name, employee.title].join(':'))].join('|');
    if (host.dataset.rosterSignature === signature) return;
    host.dataset.rosterSignature = signature;
    const showPph21 = localStorage.getItem('dnd_show_employee_pph21') === 'true';
    const estimates = calculatePph21 ? estimateEmployeePph21() : { byId: {} };
    const control = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 10px;padding:11px 13px;border:1px solid #cce7e3;border-radius:10px;background:#f2f8f7">' +
      '<label style="display:flex;align-items:center;gap:8px;margin:0;font-size:12px;font-weight:700;color:#244654"><input type="checkbox" id="projectionCalculateEmployeePph21" '+(calculatePph21?'checked':'')+' style="width:18px;height:18px;accent-color:#087e80">'+(english?'Include employee PPh 21 calculation':'Sertakan perhitungan PPh 21 pegawai')+'</label>' +
      '<label style="display:flex;align-items:center;gap:8px;margin:0;font-size:12px;font-weight:700;color:#244654"><input type="checkbox" id="projectionShowEmployeePph21" '+(showPph21 && calculatePph21?'checked':'')+' '+(!calculatePph21?'disabled':'')+' style="width:18px;height:18px;accent-color:#087e80">'+(english?'Show annual PPh 21 per employee':'Tampilkan PPh 21 tahunan per pegawai')+'</label>' +
      '<small style="font-size:10px;color:#71818a">'+(english?'PPh 21 is withheld from employee income.':'PPh 21 dipotong dari penghasilan pegawai.')+'</small></div>';
    const applyPphVisibility = visible => host.querySelectorAll('.employee-pph21-column').forEach(cell => { cell.style.display = visible ? 'table-cell' : 'none'; });
    const bindPphControls = () => {
      host.querySelector('#projectionCalculateEmployeePph21')?.addEventListener('change', event => {
        localStorage.setItem('dnd_calculate_employee_pph21', String(event.target.checked));
        renderBusinessProjection();
      });
      host.querySelector('#projectionShowEmployeePph21')?.addEventListener('change', event => {
        localStorage.setItem('dnd_show_employee_pph21', String(event.target.checked));
        applyPphVisibility(event.target.checked && calculatePph21);
      });
    };
    if (!employees.length) {
      host.innerHTML = control + '<p class="projection-help">'+(english?'No active employee accounts. You can still choose whether to include PPh 21 in the projection.':'Belum ada akun pegawai aktif. Anda tetap dapat memilih apakah PPh 21 disertakan dalam proyeksi.')+'</p>';
      bindPphControls();
      return;
    }
    host.innerHTML = control + '<div class="tablewrap" style="max-height:360px;overflow:auto"><table style="min-width:1040px;font-size:10px"><thead><tr><th>'+(english?'Employee':'Pegawai')+'</th><th>'+(english?'PTKP status':'Status PTKP')+'</th><th>'+(english?'Start date':'Mulai bekerja')+'</th><th>'+(english?'Resignation date (optional)':'Tanggal resign (opsional)')+'</th><th>'+(english?'Base salary / month':'Gaji pokok / bulan')+'</th><th>'+(english?'Fixed allowance / month':'Tunjangan tetap / bulan')+'</th><th>'+(english?'Employer BPJS / month':'BPJS perusahaan / bulan')+'</th><th class="employee-pph21-column">'+(english?'Estimated PPh 21 / year':'Estimasi PPh 21 / tahun')+'</th></tr></thead><tbody>' + employees.map(employee => {
      const record = records[String(employee.id)] || {};
      const attr = (field, type, label) => '<input data-payroll-user="' + escapeHtml(employee.id) + '" data-payroll-field="' + field + '" type="' + type + '" aria-label="' + label + ' ' + escapeHtml(employee.name) + '" value="' + escapeHtml(type === 'date' ? (record[field] || '') : displayNumber(record[field])) + '" style="width:100%;min-width:112px;padding:7px 8px;border:1px solid #dce5e8;border-radius:7px;font:inherit;font-size:10px;color:#244654;background:#fff">';
      const options = ['TK/0','TK/1','TK/2','TK/3','K/0','K/1','K/2','K/3'].map(status => '<option value="'+status+'" '+((record.ptkpStatus||'TK/0')===status?'selected':'')+'>'+status+'</option>').join('');
      const pph = estimates.byId[String(employee.id)]?.tax || 0;
      return '<tr><td><strong>' + escapeHtml(employee.name || employee.username || (english?'Employee':'Pegawai')) + '</strong><br><small>' + escapeHtml(employee.title || '') + '</small></td><td><select data-payroll-user="'+escapeHtml(employee.id)+'" data-payroll-field="ptkpStatus" aria-label="'+(english?'PTKP status for ':'Status PTKP ')+escapeHtml(employee.name)+'" style="min-width:80px;padding:7px 8px;border:1px solid #dce5e8;border-radius:7px;background:#fff;color:#244654">'+options+'</select></td><td>' + attr('startDate', 'date', english?'Start date':'Tanggal mulai') + '</td><td>' + attr('resignationDate', 'date', english?'Resignation date':'Tanggal resign') + '</td><td>' + attr('monthlySalary', 'text', english?'Base salary':'Gaji pokok') + '</td><td>' + attr('monthlyAllowance', 'text', english?'Fixed allowance':'Tunjangan tetap') + '</td><td>' + attr('monthlyEmployerBenefits', 'text', english?'Employer BPJS':'Iuran BPJS perusahaan') + '</td><td class="employee-pph21-column" data-employee-pph21="'+escapeHtml(employee.id)+'" style="white-space:nowrap;font-weight:700;color:#087e80">'+money(pph)+'</td></tr>';
    }).join('') + '</tbody></table></div><p class="projection-help" style="margin:7px 0 0">'+(english?'Enter each employee’s start date to include them in the projection. Salary and BPJS are prorated by active calendar days. Select each employee’s PTKP status for the annual PPh 21 estimate.':'Isi tanggal mulai bekerja untuk memasukkan pegawai ke proyeksi. Gaji dan BPJS dihitung prorata hari kalender aktif. Pilih status PTKP setiap pegawai untuk estimasi PPh 21 tahunan.')+'</p>';
    host.querySelectorAll('input[data-payroll-field]:not([type="date"])').forEach(bindLocaleInput);
    applyPphVisibility(showPph21 && calculatePph21);
    bindPphControls();
  }
  function updatePayrollInputMode() {
    const { configured } = payrollRoster(), totals = payrollTotals();
    const english = localStorage.getItem('dnd_language') === 'en', mode = totals.thrMode;
    const modeField = input('projectionThrMode'), multiplierWrap = input('projectionThrMultiplierWrap'), multiplierField = input('projectionThrMultiplier');
    if (modeField && modeField.value !== mode) modeField.value = mode;
    if (multiplierWrap) multiplierWrap.style.display = mode === 'multiplier' ? 'grid' : 'none';
    if (multiplierField && document.activeElement !== multiplierField) multiplierField.value = displayNumber(totals.thrMultiplier);
    const methodHelp = input('projectionThrHelp');
    if (methodHelp) {
      methodHelp.textContent = mode === 'manual'
        ? (english ? 'Enter the annual THR reserve directly in the field below.' : 'Masukkan nominal cadangan THR tahunan langsung pada kolom di bawah.')
        : mode === 'multiplier'
          ? (english ? 'Calculation: one month wages (' + money(totals.monthlyWage) + ') × ' + displayNumber(totals.thrMultiplier) + ' = ' + money(totals.allowance) + '.' : 'Rumus: upah satu bulan (' + money(totals.monthlyWage) + ') × ' + displayNumber(totals.thrMultiplier) + ' = ' + money(totals.allowance) + '.')
          : (english ? 'Automatic calculation: one month of base salary and fixed allowances = ' + money(totals.monthlyWage) + '.' : 'Hitung otomatis: satu bulan gaji pokok dan tunjangan tetap = ' + money(totals.monthlyWage) + '.');
    }
    const annualFields = [
      ['projectionAnnualSalary', totals.salary, configured, english ? 'Annual salary and fixed allowances ' + (configured ? '(calculated)' : '(manual)') : 'Total gaji dan tunjangan tahunan ' + (configured ? '(otomatis)' : '(manual)')],
      ['projectionAnnualThr', totals.allowance, mode !== 'manual', english ? 'Annual THR reserve ' + (mode === 'automatic' ? '(automatic: one month wages)' : mode === 'multiplier' ? '(monthly wages × multiplier)' : '(manual)') : 'Cadangan THR tahunan ' + (mode === 'automatic' ? '(otomatis: 1 bulan upah)' : mode === 'multiplier' ? '(upah bulanan × pengali)' : '(manual)')],
      ['projectionAnnualEmployerBenefits', totals.employerBenefits, configured, english ? 'Annual employer BPJS ' + (configured ? '(calculated)' : '(manual)') : 'BPJS perusahaan tahunan ' + (configured ? '(otomatis)' : '(manual)')]
    ];
    annualFields.forEach(([id, amount, readOnly, labelText]) => {
      const field = input(id);
      if (!field) return;
      field.readOnly = readOnly;
      field.title = readOnly ? (english ? 'Calculated using the selected THR method and employee payroll data.' : 'Dihitung berdasarkan metode THR terpilih dan data payroll pegawai.') : (english ? 'Enter an annual amount manually.' : 'Masukkan nominal tahunan secara manual.');
      const label = field.closest('label');
      if (label?.firstChild?.nodeType === Node.TEXT_NODE) label.firstChild.nodeValue = labelText;
      if (readOnly || document.activeElement !== field) field.value = displayNumber(amount);
    });
  }
  function savePayrollRow(event) {
    const field = event.target.closest('[data-payroll-user][data-payroll-field]');
    if (!field) return;
    const db = window.dndApp?.getDb?.();
    if (!db?.settings) return;
    db.settings.employeePayroll ||= {};
    const userId = String(field.dataset.payrollUser), key = field.dataset.payrollField;
    db.settings.employeePayroll[userId] ||= {};
    db.settings.employeePayroll[userId][key] = field.type === 'date' ? field.value : key === 'ptkpStatus' ? field.value : Math.max(0, number(field.value));
    if (typeof window.save === 'function') window.save();
    else window.dndApp?.saveLocal?.();
    updatePayrollInputMode();
    renderBusinessProjection();
  }
  function costBasisNote(group, key) {
    if (state.costModes?.[group]?.[key] !== 'percent') return 'Nilai biaya tahunan yang dimasukkan manual.';
    const rate = displayNumber(state[group][key]);
    if (group !== 'direct') return rate + '% dari omzet target tahunan.';
    const revenue = number(state.revenue), pph = revenue * number(state.pphRate) / 100, profit = revenue * number(state.profitTargetRate) / 100;
    const base = Math.max(0, revenue - pph - profit);
    return rate + '% × (omzet ' + money(revenue) + ' − PPh final ' + money(pph) + ' − rencana laba ' + money(profit) + ') = ' + money(base * number(state[group][key]) / 100) + '.';
  }
  function calculations() {
    const revenue = number(state.revenue);
    const direct = totalCosts('direct');
    const payroll = payrollTotals();
    payroll.total = payroll.salary + payroll.allowance + payroll.employerBenefits;
    const operatingOther = totalCosts('operating');
    const operating = operatingOther + payroll.total;
    const gross = revenue - direct;
    const operatingProfit = gross - operating;
    const pph = revenue * number(state.pphRate) / 100;
    const net = operatingProfit - pph;
    const plannedProfit = revenue * number(state.profitTargetRate) / 100;
    const profitGap = net - plannedProfit;
    const profitAchievement = plannedProfit > 0 ? net / plannedProfit * 100 : 0;
    const vatOutput = revenue * number(state.vatRate) / 100;
    const vatEligibleSpend = Math.max(0, direct + operatingOther) * safePercent(state.inputVatShare) / 100;
    const vatInput = vatEligibleSpend * number(state.vatRate) / 100;
    const vatPayable = Math.max(0, vatOutput - vatInput);
    const employeePph21 = localStorage.getItem('dnd_calculate_employee_pph21') === 'false' ? { byId: {}, total: 0, year: Math.trunc(number(state.year)) || new Date().getFullYear() } : estimateEmployeePph21(payroll);
    return { revenue, direct, payroll, employeePph21, operatingOther, operating, gross, grossMargin: revenue ? gross / revenue * 100 : 0, operatingProfit, pph, net, plannedProfit, profitGap, profitAchievement, vatOutput, vatEligibleSpend, vatInput, vatPayable, vatCreditCarry: Math.max(0, vatInput - vatOutput) };
  }

  function setCostMode(group, key, nextMode) {
    const oldMode = state.costModes[group][key] || 'amount';
    if (oldMode === nextMode) return;
    const base = group === 'direct' ? directCostBase() : number(state.revenue);
    const currentAmount = costAmount(group, key);
    const nextValue = nextMode === 'percent' ? (base ? currentAmount / base * 100 : 0) : currentAmount;
    state.costModes[group][key] = nextMode;
    state[group][key] = nextValue;
    const field = input('projection_' + group + '_' + key);
    if (field) field.value = displayNumber(nextValue);
    persist(); renderBusinessProjection();
  }

  function costFields(containerId, groupName, labels) {
    input(containerId).innerHTML = labels.map(([key, label]) => {
      const mode = state.costModes[groupName][key] || 'amount';
      return '<label class="projection-cost-input"><span>' + label + '</span><div class="projection-cost-control"><div class="projection-cost-entry"><select id="projectionMode_' + groupName + '_' + key + '" aria-label="Satuan ' + label + '"><option value="amount" ' + (mode === 'amount' ? 'selected' : '') + '>Rp</option><option value="percent" ' + (mode === 'percent' ? 'selected' : '') + '>%</option></select><input type="text" inputmode="decimal" id="projection_' + groupName + '_' + key + '" aria-label="' + label + '" value="' + displayNumber(state[groupName][key]) + '"></div><small class="projection-cost-result" id="projectionResult_' + groupName + '_' + key + '"></small></div></label>';
    }).join('');
    labels.forEach(([key]) => {
      bindLocaleInput(input('projection_' + groupName + '_' + key));
      input('projectionMode_' + groupName + '_' + key).addEventListener('change', event => setCostMode(groupName, key, event.target.value));
      input('projection_' + groupName + '_' + key).addEventListener('input', () => {
        state[groupName][key] = number(input('projection_' + groupName + '_' + key).value);
        persist(); renderBusinessProjection();
      });
    });
  }

  function renderCostPreviews() {
    [['direct', directLabels], ['operating', operatingLabels]].forEach(([group, labels]) => labels.forEach(([key]) => {
      const result = input('projectionResult_' + group + '_' + key);
      if (!result) return;
      const isPercent = state.costModes?.[group]?.[key] === 'percent';
      result.textContent = isPercent ? 'Hasil hitung: ' + money(costAmount(group, key)) : '';
      result.hidden = !isPercent;
    }));
  }

  function renderDirectCostComposition() {
    const box = input('projectionDirectCostComposition');
    if (!box) return;
    const rateField = input('projectionDirectCostRate'), statusField = input('projectionDirectCostStatus'), bar = input('projectionDirectCostBar');
    const progress = box.querySelector('[role="progressbar"]');
    if (!rateField || !statusField || !bar || !progress) return;
    const english = localStorage.getItem('dnd_language') === 'en';
    const base = directCostBase(), total = totalCosts('direct');
    const comparable = base > 0, ratio = comparable ? total / base * 100 : 0;
    const exceeded = comparable ? total > base + 0.01 : total > 0;
    const displayPercent = value => new Intl.NumberFormat(english ? 'en-US' : 'id-ID', { maximumFractionDigits: 1 }).format(value);
    const barValue = comparable ? Math.min(100, Math.max(0, ratio)) : (total > 0 ? 100 : 0);
    const color = exceeded ? '#c94c42' : '#087e80';
    rateField.textContent = comparable ? displayPercent(ratio) + '%' : (total > 0 ? '—' : '0%');
    rateField.style.color = color;
    bar.style.width = barValue + '%';
    bar.style.background = color;
    progress.setAttribute('aria-valuenow', String(barValue));
    progress.setAttribute('aria-valuetext', comparable ? displayPercent(ratio) + '%' : '0%');
    box.style.borderColor = exceeded ? '#efb8af' : '#dce9e8';
    box.style.background = exceeded ? '#fff7f5' : '#f7fbfa';
    if (!comparable) {
      statusField.textContent = total > 0
        ? (english ? 'Warning: direct costs of ' + money(total) + ' exceed the available allocation of Rp 0. Enter revenue, tax, and profit targets to establish a budget.' : 'Peringatan: biaya langsung ' + money(total) + ' belum memiliki alokasi. Isi omzet, PPh final, dan target laba untuk menghitung batas biaya.')
        : (english ? 'Enter revenue, final tax, and profit targets to calculate the available allocation.' : 'Isi omzet, PPh final, dan target laba untuk menghitung alokasi biaya yang tersedia.');
    } else if (exceeded) {
      statusField.textContent = english
        ? 'Warning: direct costs exceed the available allocation by ' + displayPercent(ratio - 100) + '% (' + money(total - base) + ').'
        : 'Peringatan: komposisi biaya langsung melebihi alokasi sebesar ' + displayPercent(ratio - 100) + '% (' + money(total - base) + ').';
    } else if (ratio >= 99.99) {
      statusField.textContent = english ? 'Direct costs match 100% of the available allocation.' : 'Total biaya langsung sudah sesuai dengan alokasi 100%.';
    } else {
      statusField.textContent = english
        ? 'Remaining allocation: ' + displayPercent(100 - ratio) + '% (' + money(base - total) + ').'
        : 'Sisa alokasi biaya langsung: ' + displayPercent(100 - ratio) + '% (' + money(base - total) + ').';
    }
  }

  function setInputs() {
    input('projectionYear').value = state.year;
    input('projectionRevenue').value = displayNumber(state.revenue);
    state.quarters.forEach((share, index) => { input(`projectionQ${index + 1}`).value = displayNumber(share); });
    input('projectionPphRate').value = displayNumber(state.pphRate);
    input('projectionVatRate').value = displayNumber(state.vatRate);
    input('projectionInputVatShare').value = displayNumber(state.inputVatShare);
    input('projectionProfitTargetRate').value = displayNumber(state.profitTargetRate);
    if (input('projectionThrMode')) input('projectionThrMode').value = state.payroll.thrMode || 'automatic';
    if (input('projectionThrMultiplier')) input('projectionThrMultiplier').value = displayNumber(state.payroll.thrMultiplier ?? 1);
    renderPayrollRoster();
    updatePayrollInputMode();
    costFields('projectionDirectCosts', 'direct', directLabels);
    costFields('projectionOperatingCosts', 'operating', operatingLabels);
  }

  function renderBreakdown(calc) {
    const rows = [];
    directLabels.forEach(([key, label]) => rows.push({ label, category: 'Biaya langsung', amount: costAmount('direct', key), note: costBasisNote('direct', key) + ' Dikurangkan untuk memperoleh laba kotor.' }));
    const english = localStorage.getItem('dnd_language') === 'en';
    const payrollNote = calc.payroll.source === 'roster' ? (english ? 'Calculated from monthly wages and active work dates in the selected year.' : 'Dihitung dari gaji bulanan dan hari kerja aktif pada tahun proyeksi.') : (english ? 'Annual payroll entered manually because employee start dates are not configured.' : 'Total tahunan diisi manual karena belum ada tanggal mulai bekerja pada daftar pegawai.');
    const thrNote = calc.payroll.thrMode === 'manual'
      ? (english ? 'Annual THR reserve entered manually.' : 'Cadangan THR tahunan diisi manual.')
      : calc.payroll.thrMode === 'multiplier'
        ? (english ? 'Monthly wages ' + money(calc.payroll.monthlyWage) + ' × ' + displayNumber(calc.payroll.thrMultiplier) + ' = ' + money(calc.payroll.allowance) + '.' : 'Upah bulanan ' + money(calc.payroll.monthlyWage) + ' × ' + displayNumber(calc.payroll.thrMultiplier) + ' = ' + money(calc.payroll.allowance) + '.')
        : (english ? 'Automatic reserve equals one month of base salary and fixed allowances: ' + money(calc.payroll.monthlyWage) + '.' : 'Otomatis sebesar satu bulan gaji pokok dan tunjangan tetap: ' + money(calc.payroll.monthlyWage) + '.');
    rows.push({ label: english ? 'Base salary and fixed allowances' : 'Gaji pokok dan tunjangan tetap', category: english ? 'Employee compensation' : 'Gaji karyawan', amount: calc.payroll.salary, note: payrollNote });
    rows.push({ label: english ? 'Annual THR reserve' : 'Cadangan THR tahunan', category: english ? 'Employee compensation' : 'Gaji karyawan', amount: calc.payroll.allowance, note: thrNote });
    rows.push({ label: english ? 'Employer BPJS contributions' : 'Iuran BPJS bagian pemberi kerja', category: english ? 'Employee compensation' : 'Gaji karyawan', amount: calc.payroll.employerBenefits, note: payrollNote });
    operatingLabels.forEach(([key, label]) => rows.push({ label, category: 'Operasional lainnya', amount: costAmount('operating', key), note: costBasisNote('operating', key) + ' Dikurangkan dalam biaya operasional.' }));
    rows.push({ label: 'Laba kotor', category: 'Hasil usaha', amount: calc.gross, note: 'Omzet sebelum PPN dikurangi biaya langsung pekerjaan.' });
    rows.push({ label: 'Laba operasional', category: 'Hasil usaha', amount: calc.operatingProfit, note: 'Laba kotor dikurangi seluruh biaya operasional.' });
    rows.push({ label: 'PPh final jasa konstruksi', category: 'Pajak penghasilan', amount: calc.pph, note: `${number(state.pphRate).toLocaleString('id-ID')}% dari omzet sebelum PPN; omzet menjadi proksi pembayaran tahun berjalan.` });
    rows.push({ label: 'Laba bersih proyeksi', category: 'Hasil usaha', amount: calc.net, note: 'Laba operasional dikurangi PPh final; PPN tidak dihitung sebagai laba/rugi.' });
    rows.push({ label: 'Rencana laba bersih tahunan', category: 'Rencana laba', amount: calc.plannedProfit, note: displayNumber(state.profitTargetRate) + '% dari target omzet tahunan.' });
    rows.push({ label: 'Selisih laba bersih terhadap rencana', category: 'Rencana laba', amount: calc.profitGap, note: 'Laba bersih hasil simulasi dikurangi rencana laba tahunan.' });
    rows.push({ label: 'PPN keluaran', category: 'PPN', amount: calc.vatOutput, note: `${number(state.vatRate).toLocaleString('id-ID')}% dari omzet sebelum PPN; dipungut dari pelanggan.` });
    rows.push({ label: 'Dasar biaya untuk estimasi PPN masukan', category: 'PPN', amount: calc.vatEligibleSpend, note: 'Biaya langsung dan operasional lain, tidak termasuk gaji, THR, dan iuran pemberi kerja.' });
    rows.push({ label: 'Estimasi PPN masukan dapat dikreditkan', category: 'PPN', amount: calc.vatInput, note: `Estimasi ${safePercent(state.inputVatShare).toLocaleString('id-ID')}% biaya non-gaji memiliki faktur yang memenuhi syarat.` });
    rows.push({ label: 'Estimasi PPN disetor', category: 'PPN', amount: calc.vatPayable, note: 'PPN keluaran dikurangi kredit PPN masukan yang diperkirakan.' });
    input('projectionCostRows').innerHTML = rows.map(row => `<tr><td>${row.label}</td><td>${row.category}</td><td>${money(row.amount)}</td><td>${row.note}</td></tr>`).join('');
  }

  function renderQuarters(calc) {
    const shares = state.quarters.map(safePercent);
    const shareTotal = shares.reduce((sum, value) => sum + value, 0);
    const allocations = normalizedQuarterShares();
    const names = ['Kuartal I', 'Kuartal II', 'Kuartal III', 'Kuartal IV'];
    const quarterData = allocations.map((part, index) => ({ name: names[index], share: part * 100, revenue: calc.revenue * part, direct: calc.direct * part, gross: calc.gross * part, operating: calc.operating * part, pph: calc.pph * part, vatPayable: calc.vatPayable * part, net: calc.net * part }));
    input('projectionQuarterRows').innerHTML = quarterData.map(row => `<tr><td><strong>${row.name}</strong></td><td><div class="projection-quarter-bar"><i style="width:${Math.min(100, row.share)}%"></i>${row.share.toLocaleString('id-ID',{maximumFractionDigits:2})}%</div></td><td>${money(row.revenue)}</td><td>${money(row.direct)}</td><td>${money(row.gross)}</td><td>${money(row.operating)}</td><td>${money(row.pph)}</td><td>${money(row.vatPayable)}</td><td><strong>${money(row.net)}</strong></td></tr>`).join('');
    input('projectionQuarterFoot').innerHTML = `<tr><td>Total / target</td><td>100%</td><td>${money(calc.revenue)}</td><td>${money(calc.direct)}</td><td>${money(calc.gross)}</td><td>${money(calc.operating)}</td><td>${money(calc.pph)}</td><td>${money(calc.vatPayable)}</td><td>${money(calc.net)}</td></tr>`;
    const status = input('projectionShareStatus'); status.classList.toggle('warn', Math.abs(shareTotal - 100) > .01);
    status.textContent = Math.abs(shareTotal - 100) <= .01 ? 'Porsi omzet kuartal berjumlah 100%.' : shareTotal > 0 ? `Porsi saat ini ${shareTotal.toLocaleString('id-ID')}%. Pembagian kuartal dinormalisasi agar total omzet sama dengan target tahunan.` : 'Semua porsi 0%; omzet dibagi rata 25% per kuartal.';
  }
  function renderBusinessProjection() {
    if (!input('projectionRevenue')) return;
    const selectedYear = Math.trunc(number(state.year)) || new Date().getFullYear();
    const yearHeading = input('projectionYearHeading');
    if (yearHeading) yearHeading.textContent = String(selectedYear);
    renderPayrollRoster();
    const directHost = input('projectionDirectCosts'), operatingHost = input('projectionOperatingCosts');
    if (directHost && !directHost.children.length) costFields('projectionDirectCosts', 'direct', directLabels);
    if (operatingHost && !operatingHost.children.length) costFields('projectionOperatingCosts', 'operating', operatingLabels);
    const calc = calculations();
    Object.entries(calc.employeePph21.byId).forEach(([id, value]) => {
      const cell = [...(input('projectionPayrollRoster')?.querySelectorAll('[data-employee-pph21]') || [])].find(node => node.dataset.employeePph21 === id);
      if (cell) cell.textContent = money(value.tax);
    });
    renderCostPreviews();
    renderDirectCostComposition();
    input('projectionKpiRevenue').textContent = money(calc.revenue);
    input('projectionKpiGross').textContent = money(calc.gross);
    input('projectionKpiGrossMargin').textContent = `Margin kotor ${calc.grossMargin.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
    input('projectionKpiNet').textContent = money(calc.net);
    input('projectionKpiVat').textContent = money(calc.vatPayable);
    input('projectionKpiPlannedProfit').textContent = money(calc.plannedProfit);
    input('projectionKpiProfitTargetRate').textContent = 'Target ' + displayNumber(state.profitTargetRate) + '% dari omzet';
    const profitPreview = input('projectionProfitTargetPreview');
    if (profitPreview) profitPreview.textContent = 'Rencana laba bersih tahunan: ' + money(calc.plannedProfit) + '.';
    updatePayrollInputMode();
    input('projectionPayrollTotal').textContent = localStorage.getItem('dnd_language') === 'en'
      ? 'Total annual payroll: ' + money(calc.payroll.total) + ' — salary/allowances ' + money(calc.payroll.salary) + ', THR reserve ' + money(calc.payroll.allowance) + ', employer BPJS ' + money(calc.payroll.employerBenefits) + '.'
      : 'Total biaya payroll tahunan: ' + money(calc.payroll.total) + ' — gaji/tunjangan ' + money(calc.payroll.salary) + ', THR ' + money(calc.payroll.allowance) + ', iuran BPJS perusahaan ' + money(calc.payroll.employerBenefits) + '.';
    const includeEmployeePph21 = localStorage.getItem('dnd_calculate_employee_pph21') !== 'false';
    input('projectionSummary').innerHTML = [
      ['Target omzet (di luar PPN)', calc.revenue], ['Total biaya langsung', -calc.direct], ['Laba kotor', calc.gross, true],
      ['Gaji, THR dan iuran pemberi kerja', -calc.payroll.total], ['Biaya operasional lainnya', -calc.operatingOther], ['Total biaya operasional', -calc.operating], ['Laba operasional', calc.operatingProfit], ['PPh final konstruksi', -calc.pph],
      ...(includeEmployeePph21 ? [[localStorage.getItem('dnd_language') === 'en' ? 'Employee PPh 21 (withheld from payroll)' : 'Estimasi PPh 21 pegawai (dipotong dari gaji)', calc.employeePph21.total, true]] : []),
      ['Laba bersih proyeksi', calc.net, true], ['Rencana laba bersih (' + displayNumber(state.profitTargetRate) + '% omzet)', calc.plannedProfit], ['Selisih proyeksi terhadap rencana', calc.profitGap]
    ].map(([label, value, emphasis]) => `<div class="projection-summary-row${emphasis ? ' emphasis' : ''}"><span>${label}</span><strong>${money(value)}</strong></div>`).join('');
    const pph21Note = input('projectionPph21Note');
    if (pph21Note) pph21Note.textContent = includeEmployeePph21
      ? (localStorage.getItem('dnd_language') === 'en'
        ? 'Annual estimate using base salary, fixed allowances and the simulated THR reserve, less job expense and each employee’s PTKP status (default TK/0). It is not added to employer operating costs. Other taxable benefits, pension contributions, zakat, income from other employers, and any eligible 2026 government-borne PPh 21 incentive are not included.'
        : 'Estimasi tahunan dari gaji pokok, tunjangan tetap, dan cadangan THR simulasi, dikurangi biaya jabatan dan PTKP masing-masing pegawai (default TK/0). Nilai ini tidak ditambahkan ke biaya operasional pemberi kerja. Belum mencakup natura/benefit kena pajak lain, iuran pensiun, zakat, penghasilan dari pemberi kerja lain, dan insentif PPh 21 ditanggung pemerintah 2026 jika memenuhi syarat.')
      : (localStorage.getItem('dnd_language') === 'en' ? 'Employee PPh 21 calculation is excluded from this projection.' : 'Perhitungan PPh 21 pegawai tidak disertakan dalam proyeksi ini.');
    input('projectionTaxDetail').innerHTML = [
      ['Tarif PPh final', `${number(state.pphRate).toLocaleString('id-ID')}%`], ['Dasar omzet PPh final', money(calc.revenue)],
      ['Estimasi PPh final', money(calc.pph)], ...(includeEmployeePph21 ? [[localStorage.getItem('dnd_language') === 'en' ? 'Estimated employee PPh 21' : 'Estimasi PPh 21 pegawai', money(calc.employeePph21.total)]] : []), ['PPN keluaran', money(calc.vatOutput)],
      ['Dasar biaya PPN masukan (di luar gaji)', money(calc.vatEligibleSpend)], ['Estimasi kredit PPN masukan', money(calc.vatInput)], ['Estimasi PPN yang disetor', money(calc.vatPayable)],
      ['Sisa kredit PPN masukan (jika ada)', money(calc.vatCreditCarry)]
    ].map(([label, value]) => `<div class="projection-taxline"><span>${label}</span><strong>${value}</strong></div>`).join('');
    renderQuarters(calc);
    renderBreakdown(calc);
    renderProjectionPlanControls();
  }

  function bind() {
    ['projectionYear', 'projectionRevenue', 'projectionProfitTargetRate', 'projectionQ1', 'projectionQ2', 'projectionQ3', 'projectionQ4', 'projectionPphRate', 'projectionVatRate', 'projectionInputVatShare', 'projectionAnnualSalary', 'projectionAnnualThr', 'projectionAnnualEmployerBenefits', 'projectionThrMultiplier'].forEach(id => bindLocaleInput(input(id)));
    input('projectionThrMode')?.addEventListener('change', () => {
      const nextMode = input('projectionThrMode').value;
      const previousMode = state.payroll.thrMode || 'automatic';
      const previousAmount = payrollTotals().allowance;
      if (nextMode === 'manual' && previousMode !== 'manual' && !(number(state.payroll.annualThr) > 0)) state.payroll.annualThr = previousAmount;
      state.payroll.thrMode = ['automatic', 'multiplier', 'manual'].includes(nextMode) ? nextMode : 'automatic';
      persist(); updatePayrollInputMode(); renderBusinessProjection();
    });
    input('projectionThrMultiplier')?.addEventListener('input', () => {
      state.payroll.thrMultiplier = number(input('projectionThrMultiplier').value);
      persist(); renderBusinessProjection();
    });
    input('projectionRevenue').addEventListener('input', () => { state.revenue = number(input('projectionRevenue').value); persist(); renderBusinessProjection(); });
    input('projectionYear').addEventListener('input', () => { state.year = Math.max(2020, Math.min(2100, number(input('projectionYear').value) || new Date().getFullYear())); persist(); });
    input('saveAnnualPlan')?.addEventListener('click', saveAnnualPlan);
    input('dashboardTrendMetric')?.addEventListener('change', renderDashboardBusinessTrend);
    input('realizationYear')?.addEventListener('change', renderRealizationPage);
    ['Revenue','Gross','Operating','Net','Q1','Q2','Q3','Q4'].forEach(suffix => { const field = input('actual'+suffix); bindLocaleInput(field); field?.addEventListener('input', renderRealizationComparison); });
    input('saveRealization')?.addEventListener('click', saveRealization);
    input('projectionNewYear')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addProjectionYear(); } });
    input('addProjectionYear')?.addEventListener('click', addProjectionYear);
    input('clearAllProjectionPlans')?.addEventListener('click', clearAllProjectionPlans);
    input('projectionSavedPlans')?.addEventListener('change', () => { if (input('projectionSavedPlans').value) loadAnnualPlan(); });
    input('projectionYearQuick')?.addEventListener('input', () => {
      const raw = Math.trunc(number(input('projectionYearQuick').value));
      if (raw >= 2020 && raw <= 2100) {
        const plans = projectionPlanList();
        input('saveAnnualPlan').textContent = plans[String(raw)] ? 'Perbarui target '+raw : 'Simpan target '+raw;
      }
    });
    input('loadAnnualPlan')?.addEventListener('click', loadAnnualPlan);
    input('projectionSetYear')?.addEventListener('click', activateProjectionYear);
    input('projectionSavedPlanList')?.addEventListener('click', event => {
      const edit = event.target.closest('[data-plan-edit]'), del = event.target.closest('[data-plan-delete]');
      if (edit) { input('projectionSavedPlans').value = edit.dataset.planEdit; loadAnnualPlan(); }
      if (del) {
        const year = del.dataset.planDelete;
        if (!window.confirm('Hapus target tahun '+year+'?')) return;
        const plans = projectionPlanList(); delete plans[year]; saveProjectionPlanList(plans);
        renderProjectionPlanControls(); updateDashboardPlanMonitor(); renderDashboardBusinessTrend();
      }
    });
    input('saveRealization')?.addEventListener('click', saveRealization);
    input('projectionPayrollRoster')?.addEventListener('change', savePayrollRow);
    [1, 2, 3, 4].forEach(index => input(`projectionQ${index}`).addEventListener('input', () => {
      state.quarters[index - 1] = safePercent(input(`projectionQ${index}`).value); persist(); renderBusinessProjection();
    }));
    [['projectionPphRate', 'pphRate'], ['projectionVatRate', 'vatRate'], ['projectionInputVatShare', 'inputVatShare'], ['projectionProfitTargetRate', 'profitTargetRate']].forEach(([id, key]) => input(id).addEventListener('input', () => {
      state[key] = safePercent(input(id).value); persist(); renderBusinessProjection();
    }));
    [['projectionAnnualSalary', 'annualSalary'], ['projectionAnnualThr', 'annualThr'], ['projectionAnnualEmployerBenefits', 'annualEmployerBenefits']].forEach(([id, key]) => input(id).addEventListener('input', () => {
      if (key === 'annualThr' && state.payroll.thrMode !== 'manual') return;
      if (key !== 'annualThr' && payrollRoster().configured) return;
      state.payroll[key] = number(input(id).value); persist(); renderBusinessProjection();
    }));
    input('projectionReset').addEventListener('click', () => {
      if (!window.confirm('Reset seluruh asumsi, gaji, dan biaya ke nilai awal?')) return;
      state = structuredClone(defaults); persist(); setInputs(); renderBusinessProjection();
    });
  }

  const PLAN_KEY = 'dnd_business_plans_v1';
  const ACTUAL_KEY = 'dnd_business_actuals_v1';
  const readStore = key => { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (_) { return {}; } };
  const writeStore = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } };
  const projectionPlanList = () => {
    const appDb = window.dndApp?.getDb?.(), shared = appDb?.settings?.businessProjectionPlans;
    return { ...readStore(PLAN_KEY), ...(shared && typeof shared === 'object' ? shared : {}) };
  };
  const saveProjectionPlanList = plans => {
    const localOk = writeStore(PLAN_KEY, plans), appDb = window.dndApp?.getDb?.(); let appOk = false;
    if (appDb?.settings) { appDb.settings.businessProjectionPlans = plans; try { if (typeof window.save === 'function') { window.save(); appOk = true; } else if (window.dndApp.saveLocal) appOk = window.dndApp.saveLocal() !== false; } catch (_) { /* local fallback remains available */ } }
    return localOk || appOk;
  };  const actualList = () => { const shared = window.dndApp?.getDb?.()?.settings?.businessActuals; return { ...readStore(ACTUAL_KEY), ...(shared && typeof shared === 'object' ? shared : {}) }; };
  const actualsForYear = year => actualList()[String(year)] || null;
  const saveActualList = actuals => { const localOk = writeStore(ACTUAL_KEY, actuals), appDb = window.dndApp?.getDb?.(); let appOk = false; if (appDb?.settings) { appDb.settings.businessActuals = actuals; try { if (typeof window.save === 'function') { window.save(); appOk = true; } else if (window.dndApp.saveLocal) appOk = window.dndApp.saveLocal() !== false; } catch (_) { /* local copy remains available */ } } return localOk || appOk; };
  const financialSnapshot = () => {
    const calc = calculations(), allocations = normalizedQuarterShares();
    return { year: number(state.year) || new Date().getFullYear(), inputs: structuredClone(state), savedAt: new Date().toISOString(), metrics: { revenue: calc.revenue, gross: calc.gross, operating: calc.operating, net: calc.net, quarterly: allocations.map(part => calc.revenue * part) } };
  };  function renderProjectionPlanControls() {
    const select = input('projectionSavedPlans'), button = input('saveAnnualPlan');
    if (!select || !button) return;
    const year = String(number(state.year) || new Date().getFullYear()), plans = projectionPlanList();
    const years = Object.keys(plans).filter(y => /^20\d{2}$|^2100$/.test(y)).sort((a,b) => Number(b)-Number(a));
    select.innerHTML = '<option value="">Pilih target tersimpan</option>' + years.map(y => '<option value="'+y+'">Target '+y+'</option>').join('');
    select.value = plans[year] ? year : '';
    button.textContent = plans[year] ? 'Perbarui target '+year : 'Simpan target '+year;
    const quick = input('projectionYearQuick'); if (quick) quick.value = year;
    const list = input('projectionSavedPlanList');
    if (list) list.innerHTML = years.length ? '<div class="tablewrap"><table><thead><tr><th>Tahun</th><th>Target omzet</th><th>Proyeksi laba bersih</th><th>Terakhir disimpan</th><th>Aksi</th></tr></thead><tbody>' + years.map(y => { const p = plans[y]; return '<tr><td><b>'+y+'</b></td><td>'+money(p.metrics?.revenue || 0)+'</td><td>'+money(p.metrics?.net || 0)+'</td><td>'+(p.savedAt ? new Date(p.savedAt).toLocaleString('id-ID') : '—')+'</td><td><button type="button" class="btn ghost" data-plan-edit="'+y+'">Edit</button> <button type="button" class="btn danger" data-plan-delete="'+y+'">Hapus</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<p style="font-size:11px;color:#82919a">Belum ada target multi-tahun yang disimpan.</p>';
  }
  function addProjectionYear() {
    const raw = Math.trunc(number(input('projectionNewYear')?.value));
    if (!raw || raw < 2020 || raw > 2100) { window.alert('Masukkan tahun antara 2020 sampai 2100.'); return false; }
    const year = String(raw), plans = projectionPlanList();
    if (plans[year]) { input('projectionSavedPlans').value = year; loadAnnualPlan(); const status = input('projectionPlanStatus'); if (status) status.textContent = 'Target '+year+' dimuat. Ubah asumsi lalu simpan kembali untuk memperbarui.'; return true; }
    state.year = raw; persist(); input('projectionYear').value = String(raw); renderBusinessProjection(); renderProjectionPlanControls();
    const status = input('projectionPlanStatus'); if (status) status.textContent = 'Tahun '+year+' siap diisi. Simpan target setelah asumsi selesai.'; return true;
  }
  function clearAllProjectionPlans() {
    const plans = projectionPlanList();
    if (!Object.keys(plans).length) { const status = input('projectionPlanStatus'); if (status) status.textContent = 'Belum ada target yang tersimpan.'; return; }
    if (!window.confirm('Hapus semua target proyeksi yang tersimpan?')) return;
    if (!saveProjectionPlanList({})) { window.alert('Daftar target belum dapat dihapus.'); return; }
    renderProjectionPlanControls(); updateDashboardPlanMonitor(); renderDashboardBusinessTrend(); const status = input('projectionPlanStatus'); if (status) status.textContent = 'Semua target proyeksi telah dihapus.';
  }  function activateProjectionYear() {
    const raw = Math.trunc(number(input('projectionYearQuick')?.value));
    if (!raw || raw < 2020 || raw > 2100) { window.alert('Masukkan tahun antara 2020 sampai 2100.'); return false; }
    state.year = raw;
    input('projectionYear').value = String(raw);
    persist();
    renderBusinessProjection();
    renderProjectionPlanControls();
    return true;
  }
  function saveAnnualPlan() {
    // Gunakan tahun pada kolom tambah tahun sebagai sumber utama saat menyimpan.
    const quickYear = Math.trunc(number(input('projectionYearQuick')?.value));
    if (quickYear >= 2020 && quickYear <= 2100 && quickYear !== Number(state.year)) {
      state.year = quickYear;
      input('projectionYear').value = String(quickYear);
      persist();
    }
    const plan = financialSnapshot(), plans = projectionPlanList(), year = String(plan.year);
    if (plans[year] && !window.confirm('Target '+year+' sudah tersimpan. Perbarui dengan asumsi saat ini?')) return;
    plans[year] = plan;
    if (!saveProjectionPlanList(plans)) { window.alert('Target belum dapat disimpan.'); return; }
    renderProjectionPlanControls(); updateDashboardPlanMonitor(); renderDashboardBusinessTrend(); renderRealizationPage();
    const status = input('projectionPlanStatus'); if (status) status.textContent = 'Target bisnis tahun ' + year + ' berhasil disimpan. Ubah asumsi lalu tekan Perbarui target untuk mengeditnya.';
    window.alert('Target bisnis tahun '+year+' berhasil disimpan.');
  }
  function loadAnnualPlan() {
    const select = input('projectionSavedPlans'), plan = select && projectionPlanList()[select.value];
    if (!plan) return;
    state = { ...structuredClone(defaults), ...structuredClone(plan.inputs) };
    state.direct = { ...defaults.direct, ...(plan.inputs.direct || {}) };
    state.operating = { ...defaults.operating, ...(plan.inputs.operating || {}) };
    state.payroll = { ...defaults.payroll, ...(plan.inputs.payroll || {}) };
    state.costModes = { direct: { ...defaults.costModes.direct, ...(plan.inputs.costModes?.direct || {}) }, operating: { ...defaults.costModes.operating, ...(plan.inputs.costModes?.operating || {}) } };
    persist(); setInputs(); renderBusinessProjection(); renderProjectionPlanControls();
  }
  function renderDashboardBusinessTrend() {
    const svg = input('dashboardBusinessTrendChart'); if (!svg) return;
    const metric = input('dashboardTrendMetric')?.value || 'revenue', plans = projectionPlanList(), actuals = actualList();
    const years = [...new Set([...Object.keys(plans),...Object.keys(actuals)].filter(year=>/^20\d{2}$|^2100$/.test(year)))].sort((a,b)=>Number(a)-Number(b));
    const note = input('dashboardBusinessTrendNote');
    if (!years.length) { svg.setAttribute('viewBox','0 0 900 320'); svg.style.width='100%'; svg.innerHTML='<text x="450" y="160" text-anchor="middle" class="dashboard-trend-empty">Simpan target proyeksi dan input realisasi untuk melihat perkembangan usaha.</text>'; if(note)note.textContent='Data akan tampil setelah target proyeksi dan realisasi tahunan tersimpan.'; return; }
    const data = years.map(year=>({year,target:plans[year]?.metrics?.[metric],actual:actuals[year]?.[metric]}));
    const values = data.flatMap(row=>[row.target,row.actual]).filter(value=>value!==undefined&&value!==null&&Number.isFinite(Number(value))).map(Number),maxValue=Math.max(1,...values),height=340,margin={top:25,right:32,bottom:48,left:92},availableWidth=Math.max(760,(svg.parentElement?.clientWidth||900)-10),width=Math.max(availableWidth,margin.left+margin.right+Math.max(1,years.length-1)*112+120),plotHeight=height-margin.top-margin.bottom,plotWidth=width-margin.left-margin.right;
    const xAt=index=>years.length===1?margin.left+plotWidth/2:margin.left+index*plotWidth/(years.length-1),yAt=value=>margin.top+plotHeight-(Number(value)/maxValue*plotHeight),compact=value=>'Rp '+new Intl.NumberFormat('id-ID',{notation:'compact',maximumFractionDigits:1}).format(value),fullMoney=value=>money(Number(value)||0);
    let grid='',xLabels='';for(let step=0;step<=4;step++){const value=maxValue*step/4,y=yAt(value);grid+=`<line x1="${margin.left}" y1="${y}" x2="${width-margin.right}" y2="${y}" class="dashboard-trend-grid"/><text x="${margin.left-10}" y="${y+4}" text-anchor="end" class="dashboard-trend-axis-label">${compact(value)}</text>`}years.forEach((year,index)=>{const x=xAt(index);xLabels+=`<line x1="${x}" y1="${margin.top+plotHeight}" x2="${x}" y2="${margin.top+plotHeight+5}" class="dashboard-trend-grid"/><text x="${x}" y="${height-14}" text-anchor="middle" class="dashboard-trend-year-label">${year}</text>`});
    const makePath=key=>{let path='',active=false;data.forEach((row,index)=>{const value=row[key];if(value===undefined||value===null||!Number.isFinite(Number(value))){active=false;return}path+=(active?' L':' M')+xAt(index)+' '+yAt(value);active=true});return path};
    const points=(key,cls,label)=>data.map((row,index)=>{const value=row[key];if(value===undefined||value===null||!Number.isFinite(Number(value)))return'';const x=xAt(index),y=yAt(value);return `<circle cx="${x}" cy="${y}" r="5" class="${cls}"><title>${label} ${row.year}: ${fullMoney(value)}</title></circle>`}).join('');
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.style.width=width+'px';svg.innerHTML=grid+xLabels+`<path d="${makePath('target')}" class="dashboard-trend-target-line"/><path d="${makePath('actual')}" class="dashboard-trend-actual-line"/>`+points('target','dashboard-trend-target-point','Proyeksi')+points('actual','dashboard-trend-actual-point','Realisasi');
    const actualYears=data.filter(row=>row.actual!==undefined&&row.actual!==null).length;if(note)note.textContent=actualYears?'Grafik mencakup '+years.length+' tahun; realisasi sudah diinput untuk '+actualYears+' tahun. Arahkan kursor ke titik untuk melihat nilai lengkap.':'Target proyeksi tersedia untuk '+years.length+' tahun. Input realisasi tahunan agar garis realisasi ikut terlihat.';
  }  function renderRealizationPage() {
    const yearField = input('realizationYear'); if (!yearField) return;
    const plans = projectionPlanList(), savedActuals = actualList(), currentYear = new Date().getFullYear();
    const years = [...new Set([currentYear, ...Object.keys(plans), ...Object.keys(savedActuals)].map(Number).filter(year => year >= 2020 && year <= 2100))].sort((a,b) => b-a);
    const selected = Number(yearField.value) || currentYear;
    yearField.innerHTML = years.map(year => '<option value="'+year+'">'+year+(plans[String(year)]?' · target tersimpan':'')+'</option>').join('');
    yearField.value = String(years.includes(selected) ? selected : currentYear);
    const year = Number(yearField.value), actual = actualsForYear(year) || {};
    ['revenue','gross','operating','net','q1','q2','q3','q4'].forEach(key => { const field = input('actual'+key[0].toUpperCase()+key.slice(1)); if (field) field.value = actual.savedAt ? displayNumber(actual[key] || 0) : ''; });
    const note = input('realizationSavedNote'); if (note) note.textContent = actual.savedAt ? 'Tersimpan '+new Date(actual.savedAt).toLocaleString('id-ID') : 'Belum ada realisasi tersimpan untuk tahun '+year+'.';
    renderRealizationComparison();
  }
  function renderRealizationComparison() {
    const root = input('realizationComparison'); if (!root) return;
    const year = Number(input('realizationYear')?.value) || new Date().getFullYear(), plan = projectionPlanList()[String(year)], actual = actualsForYear(year);
    const metrics = [
      ['Omzet tahunan',plan?.metrics?.revenue,actual?.revenue,false],
      ['Laba kotor',plan?.metrics?.gross,actual?.gross,false],
      ['Biaya operasional',plan?.metrics?.operating,actual?.operating,true],
      ['Laba bersih',plan?.metrics?.net,actual?.net,false],
      ...['I','II','III','IV'].map((quarter,index)=>['Omzet Kuartal '+quarter,plan?.metrics?.quarterly?.[index],actual?.['q'+(index+1)],false])
    ];
    root.innerHTML = metrics.map(([label,target,value,isCost]) => {
      const hasActual = value !== undefined && value !== null, hasTarget = target !== undefined && target !== null;
      const variance = hasActual && hasTarget ? value-target : null, ratio = hasActual && hasTarget && Number(target)>0 ? value/Number(target)*100 : null;
      const favorable = variance===null ? false : isCost ? variance<=0 : variance>=0, cls = !hasActual?'realization-neutral':favorable?'realization-good':'realization-over';
      const ratioText = ratio===null?'—':new Intl.NumberFormat('id-ID',{maximumFractionDigits:1}).format(ratio)+'%';
      const varianceText = variance===null?'—':(variance>0?'+':'')+money(variance);
      return '<tr><td><b>'+label+'</b></td><td>'+(hasTarget?money(target):'<span class="realization-neutral">Belum ada target</span>')+'</td><td>'+(hasActual?money(value):'<span class="realization-neutral">Belum diinput</span>')+'</td><td class="'+cls+'">'+varianceText+'</td><td><span class="'+cls+'">'+ratioText+'</span></td></tr>';
    }).join('');
  }
  function saveRealization() {
    const year = Math.trunc(number(input('realizationYear')?.value));
    if (!year || year < 2020 || year > 2100) { window.alert('Pilih tahun realisasi antara 2020 sampai 2100.'); return; }
    const record = { year, savedAt: new Date().toISOString() };
    ['revenue','gross','operating','net','q1','q2','q3','q4'].forEach(key => { const field = input('actual'+key[0].toUpperCase()+key.slice(1)); record[key] = field ? Math.max(0,number(field.value)) : 0; });
    const actuals = actualList(); actuals[String(year)] = record;
    if (!saveActualList(actuals)) { window.alert('Realisasi belum dapat disimpan.'); return; }
    renderRealizationPage(); updateDashboardPlanMonitor(); renderDashboardBusinessTrend(); window.dndApp?.toast?.('Realisasi tahun '+year+' berhasil disimpan.');
  }  function updateDashboardPlanMonitor() {
    const root = input('planActualMonitor'); if (!root) return;
    const year = String(new Date().getFullYear()), plan = projectionPlanList()[year], actual = actualsForYear(year), status = input('planActualYearLabel');
    if (status) status.textContent = 'Tahun '+year+(plan ? ' · target tersimpan' : ' · target belum disimpan');
    const rows = [['Omzet tahunan',plan?.metrics.revenue,actual?.revenue],['Laba kotor',plan?.metrics.gross,actual?.gross],['Biaya operasional',plan?.metrics.operating,actual?.operating],['Laba bersih',plan?.metrics.net,actual?.net],...['I','II','III','IV'].map((q,i)=>['Omzet Kuartal '+q,plan?.metrics.quarterly?.[i],actual?.['q'+(i+1)]])];
    const amount = value => value == null ? '—' : money(value);
    const compact = value => value == null ? '—' : 'Rp ' + new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    root.innerHTML = plan ? '<div class="plan-monitor-grid">' + rows.map(([label,target,value]) => {
      const localMax = Math.max(1, target || 0, value || 0);
      const targetHeight = target == null ? 0 : Math.max(3, (target || 0) / localMax * 100);
      const actualHeight = value == null ? 0 : Math.max(3, (value || 0) / localMax * 100);
      return '<div class="plan-metric-card"><strong class="plan-metric-title">'+label+'</strong><div class="plan-vertical-chart"><div class="plan-vertical-item"><span class="plan-vertical-value" title="'+amount(target)+'">'+compact(target)+'</span><div class="plan-vertical-track"><i class="plan-vertical-target" style="height:'+targetHeight+'%"></i></div><small>Target</small></div><div class="plan-vertical-item"><span class="plan-vertical-value" title="'+amount(value)+'">'+compact(value)+'</span><div class="plan-vertical-track"><i class="plan-vertical-actual" style="height:'+actualHeight+'%"></i></div><small>Realisasi</small></div></div></div>';
    }).join('') + '</div>' : '<p class="plan-monitor-empty">Simpan target tahunan dari menu Simulasi Biaya & Proyeksi untuk mulai membandingkan rencana dan realisasi.</p>';
    const legend = input('planActualLegend'); if (legend) legend.style.display = plan ? 'flex' : 'none';
  }
  window.saveAnnualPlan = saveAnnualPlan; window.loadAnnualPlan = loadAnnualPlan; window.renderRealizationPage = renderRealizationPage; window.saveRealization = saveRealization; window.updateDashboardPlanMonitor = updateDashboardPlanMonitor;
  window.renderBusinessProjection = renderBusinessProjection; window.renderDashboardBusinessTrend = renderDashboardBusinessTrend;
  window.getProjectedNetProfit = () => { const value = calculations().net; return Number.isFinite(value) ? value : 0; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { setInputs(); bind(); renderBusinessProjection(); renderDashboardBusinessTrend(); });
  else { setInputs(); bind(); renderBusinessProjection(); renderDashboardBusinessTrend(); }
})();
