(() => {
  const STORAGE_KEY = 'dnd_business_projection_v1';
  const defaults = {
    year: new Date().getFullYear(), revenue: 0, quarters: [20, 25, 25, 30],
    profitTargetRate: 0, pphRate: 1.75, vatRate: 11, inputVatShare: 80,
    direct: { materials: 0, labor: 0, subcontract: 0, equipment: 0, logistics: 0, otherDirect: 0 },
    operating: { office: 0, admin: 0, marketing: 0, depreciation: 0, otherOperating: 0 }, costModes: { direct: { materials: 'amount', labor: 'amount', subcontract: 'amount', equipment: 'amount', logistics: 'amount', otherDirect: 'amount' }, operating: { office: 'amount', admin: 'amount', marketing: 'amount', depreciation: 'amount', otherOperating: 'amount' } }, payroll: { annualSalary: 0, annualThr: 0, annualEmployerBenefits: 0 }
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
        annualEmployerBenefits: oldPayroll.annualEmployerBenefits !== undefined ? oldPayroll.annualEmployerBenefits : headcount * number(oldPayroll.monthlyEmployerBenefits) * 12
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
    if (!roster.configured) return { salary: number(state.payroll.annualSalary), allowance: number(state.payroll.annualThr), employerBenefits: number(state.payroll.annualEmployerBenefits), source: 'manual' };
    const year = Math.trunc(number(state.year)) || new Date().getFullYear();
    const yearStart = new Date(year, 0, 1), yearEnd = new Date(year, 11, 31);
    const yearDays = Math.round((yearEnd - yearStart) / 86400000) + 1;
    let salary = 0, allowance = 0, employerBenefits = 0;
    for (const employee of roster.employees) {
      const record = roster.records[String(employee.id)] || {};
      if (!record.startDate) continue;
      const start = new Date(record.startDate + 'T00:00:00');
      const end = record.resignationDate ? new Date(record.resignationDate + 'T00:00:00') : yearEnd;
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < yearStart || start > yearEnd || end < start) continue;
      const monthlySalary = number(record.monthlySalary), monthlyAllowance = number(record.monthlyAllowance), monthlyBenefits = number(record.monthlyEmployerBenefits);
      let activeDays = 0;
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(year, month, 1), monthEnd = new Date(year, month + 1, 0);
        const activeStart = new Date(Math.max(start.getTime(), monthStart.getTime()));
        const activeEnd = new Date(Math.min(end.getTime(), monthEnd.getTime()));
        if (activeEnd < activeStart) continue;
        const days = Math.round((monthEnd - monthStart) / 86400000) + 1;
        const daysActive = Math.round((activeEnd - activeStart) / 86400000) + 1;
        activeDays += daysActive;
        salary += (monthlySalary + monthlyAllowance) * daysActive / days;
        employerBenefits += monthlyBenefits * daysActive / days;
      }
      const annualThrReserve = (monthlySalary + monthlyAllowance) * Math.min(1, activeDays / yearDays);
      // THR is an estimated annual reserve, capped at one month's wage.
      allowance += Math.min(monthlySalary + monthlyAllowance, annualThrReserve);
    }
    return { salary, allowance, employerBenefits, source: 'roster' };
  }
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function renderPayrollRoster() {
    const host = input('projectionPayrollRoster');
    if (!host) return;
    const { employees, records } = payrollRoster();
    const signature = employees.map(employee => [employee.id, employee.name, employee.title].join(':')).join('|');
    if (host.dataset.rosterSignature === signature) return;
    host.dataset.rosterSignature = signature;
    if (!employees.length) {
      host.innerHTML = '<p class="projection-help">Belum ada akun pegawai aktif. Tambahkan pegawai, atau isi total gaji, THR, dan BPJS manual di bawah.</p>';
      return;
    }
    host.innerHTML = '<div class="tablewrap" style="max-height:330px;overflow:auto"><table style="min-width:760px;font-size:10px"><thead><tr><th>Pegawai</th><th>Mulai bekerja</th><th>Tanggal resign (opsional)</th><th>Gaji pokok / bulan</th><th>Tunjangan tetap / bulan</th><th>BPJS perusahaan / bulan</th></tr></thead><tbody>' + employees.map(employee => {
      const record = records[String(employee.id)] || {};
      const attr = (field, type, label) => '<input data-payroll-user="' + escapeHtml(employee.id) + '" data-payroll-field="' + field + '" type="' + type + '" aria-label="' + label + ' ' + escapeHtml(employee.name) + '" value="' + escapeHtml(type === 'date' ? (record[field] || '') : displayNumber(record[field])) + '" style="width:100%;min-width:112px;padding:7px 8px;border:1px solid #dce5e8;border-radius:7px;font:inherit;font-size:10px;color:#244654;background:#fff">';
      return '<tr><td><strong>' + escapeHtml(employee.name || employee.username || 'Pegawai') + '</strong><br><small>' + escapeHtml(employee.title || '') + '</small></td><td>' + attr('startDate', 'date', 'Tanggal mulai') + '</td><td>' + attr('resignationDate', 'date', 'Tanggal resign') + '</td><td>' + attr('monthlySalary', 'text', 'Gaji pokok') + '</td><td>' + attr('monthlyAllowance', 'text', 'Tunjangan tetap') + '</td><td>' + attr('monthlyEmployerBenefits', 'text', 'Iuran BPJS perusahaan') + '</td></tr>';
    }).join('') + '</tbody></table></div><p class="projection-help" style="margin:7px 0 0">Isi tanggal mulai bekerja untuk memasukkan pegawai ke proyeksi. Nominal gaji dan iuran dihitung prorata hari kalender aktif pada tahun yang dipilih.</p>';
    host.querySelectorAll('[data-payroll-field]:not([type="date"])').forEach(bindLocaleInput);
  }
  function updatePayrollInputMode() {
    const { configured } = payrollRoster(), totals = payrollTotals();
    [['projectionAnnualSalary', totals.salary], ['projectionAnnualThr', totals.allowance], ['projectionAnnualEmployerBenefits', totals.employerBenefits]].forEach(([id, amount]) => {
      const field = input(id);
      if (!field) return;
      field.readOnly = configured;
      field.title = configured ? 'Dihitung dari data pegawai di atas.' : 'Mode manual: masukkan total tahunan. Isi tanggal mulai pegawai untuk beralih ke perhitungan otomatis.';
      const label = field.closest('label');
      if (label?.firstChild?.nodeType === Node.TEXT_NODE) label.firstChild.nodeValue = id === 'projectionAnnualThr' ? 'Cadangan THR tahunan ' + (configured ? '(estimasi)' : '(manual)') : id === 'projectionAnnualEmployerBenefits' ? 'BPJS perusahaan tahunan ' + (configured ? '(otomatis)' : '(manual)') : 'Total gaji dan tunjangan tahunan ' + (configured ? '(otomatis)' : '(manual)');
      if (configured || document.activeElement !== field) field.value = displayNumber(amount);
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
    db.settings.employeePayroll[userId][key] = field.type === 'date' ? field.value : Math.max(0, number(field.value));
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
    return { revenue, direct, payroll, operatingOther, operating, gross, grossMargin: revenue ? gross / revenue * 100 : 0, operatingProfit, pph, net, plannedProfit, profitGap, profitAchievement, vatOutput, vatEligibleSpend, vatInput, vatPayable, vatCreditCarry: Math.max(0, vatInput - vatOutput) };
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

  function setInputs() {
    input('projectionYear').value = state.year;
    input('projectionRevenue').value = displayNumber(state.revenue);
    state.quarters.forEach((share, index) => { input(`projectionQ${index + 1}`).value = displayNumber(share); });
    input('projectionPphRate').value = displayNumber(state.pphRate);
    input('projectionVatRate').value = displayNumber(state.vatRate);
    input('projectionInputVatShare').value = displayNumber(state.inputVatShare);
    input('projectionProfitTargetRate').value = displayNumber(state.profitTargetRate);
    renderPayrollRoster();
    updatePayrollInputMode();
    costFields('projectionDirectCosts', 'direct', directLabels);
    costFields('projectionOperatingCosts', 'operating', operatingLabels);
  }

  function renderBreakdown(calc) {
    const rows = [];
    directLabels.forEach(([key, label]) => rows.push({ label, category: 'Biaya langsung', amount: costAmount('direct', key), note: costBasisNote('direct', key) + ' Dikurangkan untuk memperoleh laba kotor.' }));
    const payrollNote = calc.payroll.source === 'roster' ? 'Dihitung dari gaji bulanan dan hari kerja aktif pada tahun proyeksi.' : 'Total tahunan diisi manual karena belum ada tanggal mulai bekerja pada daftar pegawai.';
    rows.push({ label: 'Gaji pokok dan tunjangan tetap', category: 'Gaji karyawan', amount: calc.payroll.salary, note: payrollNote });
    rows.push({ label: 'Cadangan THR tahunan', category: 'Gaji karyawan', amount: calc.payroll.allowance, note: calc.payroll.source === 'roster' ? 'Estimasi prorata masa kerja, maksimal satu bulan upah per tahun.' : payrollNote });
    rows.push({ label: 'Iuran BPJS bagian pemberi kerja', category: 'Gaji karyawan', amount: calc.payroll.employerBenefits, note: payrollNote });
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
    renderCostPreviews();
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
    input('projectionPayrollTotal').textContent = 'Total biaya payroll tahunan: ' + money(calc.payroll.total) + ' — gaji/tunjangan ' + money(calc.payroll.salary) + ', THR ' + money(calc.payroll.allowance) + ', iuran BPJS perusahaan ' + money(calc.payroll.employerBenefits) + '.';
    input('projectionSummary').innerHTML = [
      ['Target omzet (di luar PPN)', calc.revenue], ['Total biaya langsung', -calc.direct], ['Laba kotor', calc.gross, true],
      ['Gaji, THR dan iuran pemberi kerja', -calc.payroll.total], ['Biaya operasional lainnya', -calc.operatingOther], ['Total biaya operasional', -calc.operating], ['Laba operasional', calc.operatingProfit], ['PPh final konstruksi', -calc.pph],
      ['Laba bersih proyeksi', calc.net, true], ['Rencana laba bersih (' + displayNumber(state.profitTargetRate) + '% omzet)', calc.plannedProfit], ['Selisih proyeksi terhadap rencana', calc.profitGap]
    ].map(([label, value, emphasis]) => `<div class="projection-summary-row${emphasis ? ' emphasis' : ''}"><span>${label}</span><strong>${money(value)}</strong></div>`).join('');
    input('projectionTaxDetail').innerHTML = [
      ['Tarif PPh final', `${number(state.pphRate).toLocaleString('id-ID')}%`], ['Dasar omzet PPh final', money(calc.revenue)],
      ['Estimasi PPh final', money(calc.pph)], ['PPN keluaran', money(calc.vatOutput)],
      ['Dasar biaya PPN masukan (di luar gaji)', money(calc.vatEligibleSpend)], ['Estimasi kredit PPN masukan', money(calc.vatInput)], ['Estimasi PPN yang disetor', money(calc.vatPayable)],
      ['Sisa kredit PPN masukan (jika ada)', money(calc.vatCreditCarry)]
    ].map(([label, value]) => `<div class="projection-taxline"><span>${label}</span><strong>${value}</strong></div>`).join('');
    renderQuarters(calc);
    renderBreakdown(calc);
    renderProjectionPlanControls();
  }

  function bind() {
    ['projectionYear', 'projectionRevenue', 'projectionProfitTargetRate', 'projectionQ1', 'projectionQ2', 'projectionQ3', 'projectionQ4', 'projectionPphRate', 'projectionVatRate', 'projectionInputVatShare', 'projectionAnnualSalary', 'projectionAnnualThr', 'projectionAnnualEmployerBenefits'].forEach(id => bindLocaleInput(input(id)));
    input('projectionRevenue').addEventListener('input', () => { state.revenue = number(input('projectionRevenue').value); persist(); renderBusinessProjection(); });
    input('projectionYear').addEventListener('input', () => { state.year = Math.max(2020, Math.min(2100, number(input('projectionYear').value) || new Date().getFullYear())); persist(); });
    input('saveAnnualPlan')?.addEventListener('click', saveAnnualPlan);
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
        renderProjectionPlanControls(); updateDashboardPlanMonitor();
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
      if (payrollRoster().configured) return;
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
  };  const actualsForYear = year => readStore(ACTUAL_KEY)[String(year)] || null;
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
    renderProjectionPlanControls(); updateDashboardPlanMonitor(); const status = input('projectionPlanStatus'); if (status) status.textContent = 'Semua target proyeksi telah dihapus.';
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
    renderProjectionPlanControls(); updateDashboardPlanMonitor();
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
  function renderRealizationPage() {
    const yearField = input('realizationYear'); if (!yearField) return;
    const year = new Date().getFullYear(), actual = actualsForYear(year) || {};
    yearField.value = year;
    ['revenue','gross','operating','net','q1','q2','q3','q4'].forEach(key => { const field = input('actual'+key[0].toUpperCase()+key.slice(1)); if (field) field.value = displayNumber(actual[key] || 0); });
    const note = input('realizationSavedNote'); if (note) note.textContent = actual.savedAt ? 'Tersimpan '+new Date(actual.savedAt).toLocaleString('id-ID') : 'Belum ada realisasi tersimpan untuk tahun ini.';
    const plan = projectionPlanList()[String(year)], summary = input('realizationPlanSummary');
    if (summary) summary.innerHTML = plan ? [['Target omzet',plan.metrics.revenue],['Target laba kotor',plan.metrics.gross],['Target biaya operasional',plan.metrics.operating],['Target laba bersih',plan.metrics.net]].map(row => '<div class="projection-summary-row"><span>'+row[0]+'</span><strong>'+money(row[1])+'</strong></div>').join('') : '<p>Belum ada target tersimpan untuk tahun ini.</p>';
  }
  function saveRealization() {
    const year = new Date().getFullYear(), record = { year, savedAt: new Date().toISOString() };
    ['revenue','gross','operating','net','q1','q2','q3','q4'].forEach(key => { const field = input('actual'+key[0].toUpperCase()+key.slice(1)); record[key] = field ? (field.value.trim().startsWith('-') ? -number(field.value.slice(1)) : number(field.value)) : 0; });
    const actuals = readStore(ACTUAL_KEY); actuals[String(year)] = record;
    if (!writeStore(ACTUAL_KEY, actuals)) { window.alert('Realisasi belum dapat disimpan.'); return; }
    renderRealizationPage(); updateDashboardPlanMonitor(); window.alert('Realisasi tahun '+year+' berhasil disimpan.');
  }
  function updateDashboardPlanMonitor() {
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
  window.renderBusinessProjection = renderBusinessProjection;
  window.getProjectedNetProfit = () => { const value = calculations().net; return Number.isFinite(value) ? value : 0; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { setInputs(); bind(); renderBusinessProjection(); });
  else { setInputs(); bind(); renderBusinessProjection(); }
})();
