(() => {
  const STORAGE_KEY = 'dnd_business_projection_v1';
  const defaults = {
    year: new Date().getFullYear(), revenue: 0, quarters: [20, 25, 25, 30],
    pphRate: 1.75, vatRate: 11, inputVatShare: 80,
    direct: { materials: 0, labor: 0, subcontract: 0, equipment: 0, logistics: 0, otherDirect: 0 },
    operating: { salaries: 0, office: 0, admin: 0, marketing: 0, depreciation: 0, otherOperating: 0 }, costModes: { direct: { materials: 'amount', labor: 'amount', subcontract: 'amount', equipment: 'amount', logistics: 'amount', otherDirect: 'amount' }, operating: { salaries: 'amount', office: 'amount', admin: 'amount', marketing: 'amount', depreciation: 'amount', otherOperating: 'amount' } }, payroll: { headcount: 0, monthlySalary: 0, annualAllowance: 0, monthlyEmployerBenefits: 0 }
  };
  const directLabels = [
    ['materials', 'Material dan bahan konstruksi'], ['labor', 'Tenaga kerja lapangan'],
    ['subcontract', 'Subkontraktor'], ['equipment', 'Peralatan dan sewa alat'],
    ['logistics', 'Transportasi dan logistik'], ['otherDirect', 'Biaya langsung lainnya']
  ];
  const operatingLabels = [
    ['salaries', 'Gaji tambahan tahunan (di luar simulasi karyawan)'], ['office', 'Sewa kantor dan utilitas'],
    ['admin', 'Administrasi, legal, dan profesional'], ['marketing', 'Pemasaran dan komunikasi'],
    ['depreciation', 'Penyusutan dan biaya pembiayaan'], ['otherOperating', 'Biaya operasional lainnya']
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
  let state = load();

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return saved ? {
        ...defaults, ...saved,
        quarters: Array.isArray(saved.quarters) ? saved.quarters.slice(0, 4) : defaults.quarters.slice(),
        direct: { ...defaults.direct, ...(saved.direct || {}) },
        operating: { ...defaults.operating, ...(saved.operating || {}) },
        costModes: { direct: { ...defaults.costModes.direct, ...(saved.costModes?.direct || {}) }, operating: { ...defaults.costModes.operating, ...(saved.costModes?.operating || {}) } },
        payroll: { ...defaults.payroll, ...(saved.payroll || {}) }
      } : structuredClone(defaults);
    } catch (_) { return structuredClone(defaults); }
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* storage may be unavailable in private browsing */ }
  }

  function costAmount(group, key) { const value = number(state[group][key]); return state.costModes?.[group]?.[key] === 'percent' ? number(state.revenue) * value / 100 : value; }
  function totalCosts(group) { return Object.keys(state[group]).reduce((sum, key) => sum + costAmount(group, key), 0); }
  function costBasisNote(group, key) { return state.costModes?.[group]?.[key] === 'percent' ? displayNumber(state[group][key]) + '% dari omzet target tahunan.' : 'Nilai biaya tahunan yang dimasukkan manual.'; }

  function calculations() {
    const revenue = number(state.revenue);
    const direct = totalCosts('direct');
    const headcount = Math.floor(number(state.payroll.headcount));
    const payroll = { headcount, salary: headcount * number(state.payroll.monthlySalary) * 12, allowance: headcount * number(state.payroll.annualAllowance), employerBenefits: headcount * number(state.payroll.monthlyEmployerBenefits) * 12 };
    payroll.total = payroll.salary + payroll.allowance + payroll.employerBenefits;
    const operatingOther = totalCosts('operating');
    const operating = operatingOther + payroll.total;
    const gross = revenue - direct;
    const operatingProfit = gross - operating;
    const pph = revenue * number(state.pphRate) / 100;
    const vatOutput = revenue * number(state.vatRate) / 100;
    const vatEligibleSpend = Math.max(0, direct + operatingOther - costAmount('operating', 'salaries')) * safePercent(state.inputVatShare) / 100;
    const vatInput = vatEligibleSpend * number(state.vatRate) / 100;
    const vatPayable = Math.max(0, vatOutput - vatInput);
    return { revenue, direct, payroll, operatingOther, operating, gross, grossMargin: revenue ? gross / revenue * 100 : 0, operatingProfit, pph, net: operatingProfit - pph, vatOutput, vatEligibleSpend, vatInput, vatPayable, vatCreditCarry: Math.max(0, vatInput - vatOutput) };
  }

  function setCostMode(group, key, nextMode) {
    const oldMode = state.costModes[group][key] || 'amount';
    if (oldMode === nextMode) return;
    const revenue = number(state.revenue);
    const currentAmount = costAmount(group, key);
    const nextValue = nextMode === 'percent' ? (revenue ? currentAmount / revenue * 100 : 0) : currentAmount;
    state.costModes[group][key] = nextMode;
    state[group][key] = nextValue;
    const field = input('projection_' + group + '_' + key);
    if (field) field.value = displayNumber(nextValue);
    persist(); renderBusinessProjection();
  }

  function costFields(containerId, groupName, labels) {
    input(containerId).innerHTML = labels.map(([key, label]) => {
      const mode = state.costModes[groupName][key] || 'amount';
      return '<label class="projection-cost-input"><span>' + label + '</span><div class="projection-cost-entry"><select id="projectionMode_' + groupName + '_' + key + '" aria-label="Satuan ' + label + '"><option value="amount" ' + (mode === 'amount' ? 'selected' : '') + '>Rp</option><option value="percent" ' + (mode === 'percent' ? 'selected' : '') + '>%</option></select><input type="text" inputmode="decimal" id="projection_' + groupName + '_' + key + '" aria-label="' + label + '" value="' + displayNumber(state[groupName][key]) + '"></div></label>';
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

  function setInputs() {
    input('projectionYear').value = state.year;
    input('projectionRevenue').value = displayNumber(state.revenue);
    state.quarters.forEach((share, index) => { input(`projectionQ${index + 1}`).value = displayNumber(share); });
    input('projectionPphRate').value = displayNumber(state.pphRate);
    input('projectionVatRate').value = displayNumber(state.vatRate);
    input('projectionInputVatShare').value = displayNumber(state.inputVatShare);
    input('projectionHeadcount').value = displayNumber(Math.floor(number(state.payroll.headcount)));
    input('projectionMonthlySalary').value = displayNumber(state.payroll.monthlySalary);
    input('projectionAnnualAllowance').value = displayNumber(state.payroll.annualAllowance);
    input('projectionEmployerBenefits').value = displayNumber(state.payroll.monthlyEmployerBenefits);
    costFields('projectionDirectCosts', 'direct', directLabels);
    costFields('projectionOperatingCosts', 'operating', operatingLabels);
  }

  function renderBreakdown(calc) {
    const rows = [];
    directLabels.forEach(([key, label]) => rows.push({ label, category: 'Biaya langsung', amount: costAmount('direct', key), note: costBasisNote('direct', key) + ' Dikurangkan untuk memperoleh laba kotor.' }));
    rows.push({ label: 'Gaji pokok karyawan (12 bulan)', category: 'Gaji karyawan', amount: calc.payroll.salary, note: calc.payroll.headcount + ' orang × ' + money(number(state.payroll.monthlySalary)) + ' per bulan × 12 bulan.' });
    rows.push({ label: 'THR/tunjangan karyawan', category: 'Gaji karyawan', amount: calc.payroll.allowance, note: calc.payroll.headcount + ' orang × ' + money(number(state.payroll.annualAllowance)) + ' per tahun.' });
    rows.push({ label: 'Iuran BPJS bagian pemberi kerja', category: 'Gaji karyawan', amount: calc.payroll.employerBenefits, note: calc.payroll.headcount + ' orang × ' + money(number(state.payroll.monthlyEmployerBenefits)) + ' per bulan × 12 bulan.' });
    operatingLabels.forEach(([key, label]) => rows.push({ label, category: 'Operasional lainnya', amount: costAmount('operating', key), note: costBasisNote('operating', key) + ' Dikurangkan dalam biaya operasional.' }));
    rows.push({ label: 'Laba kotor', category: 'Hasil usaha', amount: calc.gross, note: 'Omzet sebelum PPN dikurangi biaya langsung pekerjaan.' });
    rows.push({ label: 'Laba operasional', category: 'Hasil usaha', amount: calc.operatingProfit, note: 'Laba kotor dikurangi seluruh biaya operasional.' });
    rows.push({ label: 'PPh final jasa konstruksi', category: 'Pajak penghasilan', amount: calc.pph, note: `${number(state.pphRate).toLocaleString('id-ID')}% dari omzet sebelum PPN; asumsi berdasarkan pembayaran.` });
    rows.push({ label: 'Laba bersih proyeksi', category: 'Hasil usaha', amount: calc.net, note: 'Laba operasional dikurangi PPh final; PPN tidak dihitung sebagai laba/rugi.' });
    rows.push({ label: 'PPN keluaran', category: 'PPN', amount: calc.vatOutput, note: `${number(state.vatRate).toLocaleString('id-ID')}% dari omzet kena pajak sebelum PPN; dipungut dari pelanggan.` });
    rows.push({ label: 'Estimasi PPN masukan dapat dikreditkan', category: 'PPN', amount: calc.vatInput, note: `Estimasi ${safePercent(state.inputVatShare).toLocaleString('id-ID')}% biaya non-gaji memiliki faktur yang memenuhi syarat × tarif PPN.` });
    rows.push({ label: 'Estimasi PPN disetor', category: 'PPN', amount: calc.vatPayable, note: 'PPN keluaran dikurangi kredit PPN masukan; jumlah negatif ditampilkan sebagai kredit/surplus.' });
    input('projectionCostRows').innerHTML = rows.map(row => `<tr><td>${row.label}</td><td>${row.category}</td><td>${money(row.amount)}</td><td>${row.note}</td></tr>`).join('');
  }

  function renderQuarters(calc) {
    const shares = state.quarters.map(safePercent);
    const shareTotal = shares.reduce((sum, value) => sum + value, 0);
    const normalizer = shareTotal || 100;
    const names = ['Kuartal I', 'Kuartal II', 'Kuartal III', 'Kuartal IV'];
    const parts = shares.map(share => share / normalizer);
    const quarterData = parts.map((part, index) => ({
      name: names[index], share: shares[index], revenue: calc.revenue * part,
      direct: calc.direct * part, gross: calc.gross * part,
      operating: calc.operating * part, pph: calc.pph * part,
      vatPayable: calc.vatPayable * part, net: calc.net * part
    }));
    input('projectionQuarterRows').innerHTML = quarterData.map(row => `<tr><td><strong>${row.name}</strong></td><td><div class="projection-quarter-bar"><i style="width:${Math.min(100, row.share)}%"></i>${row.share.toLocaleString('id-ID')}%</div></td><td>${money(row.revenue)}</td><td>${money(row.direct)}</td><td>${money(row.gross)}</td><td>${money(row.operating)}</td><td>${money(row.pph)}</td><td>${money(row.vatPayable)}</td><td><strong>${money(row.net)}</strong></td></tr>`).join('');
    input('projectionQuarterFoot').innerHTML = `<tr><td>Total / target</td><td>${shareTotal.toLocaleString('id-ID')}%</td><td>${money(calc.revenue)}</td><td>${money(calc.direct)}</td><td>${money(calc.gross)}</td><td>${money(calc.operating)}</td><td>${money(calc.pph)}</td><td>${money(calc.vatPayable)}</td><td>${money(calc.net)}</td></tr>`;
    const status = input('projectionShareStatus');
    status.classList.toggle('warn', Math.abs(shareTotal - 100) > .01);
    status.textContent = Math.abs(shareTotal - 100) <= .01
      ? 'Porsi omzet kuartal berjumlah 100%.'
      : `Porsi saat ini ${shareTotal.toLocaleString('id-ID')}%. Nilai omzet kuartal dinormalisasi otomatis agar total tetap sesuai target tahunan.`;
  }

  function renderBusinessProjection() {
    if (!input('projectionRevenue')) return;
    const calc = calculations();
    input('projectionKpiRevenue').textContent = money(calc.revenue);
    input('projectionKpiGross').textContent = money(calc.gross);
    input('projectionKpiGrossMargin').textContent = `Margin kotor ${calc.grossMargin.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
    input('projectionKpiNet').textContent = money(calc.net);
    input('projectionKpiVat').textContent = money(calc.vatPayable);
    input('projectionPayrollTotal').textContent = 'Total biaya gaji tahunan: ' + money(calc.payroll.total) + ' — pokok ' + money(calc.payroll.salary) + ', THR/tunjangan ' + money(calc.payroll.allowance) + ', iuran perusahaan ' + money(calc.payroll.employerBenefits) + '.';
    input('projectionSummary').innerHTML = [
      ['Target omzet (di luar PPN)', calc.revenue], ['Total biaya langsung', -calc.direct], ['Laba kotor', calc.gross, true],
      ['Gaji, THR dan iuran pemberi kerja', -calc.payroll.total], ['Biaya operasional lainnya', -calc.operatingOther], ['Total biaya operasional', -calc.operating], ['Laba operasional', calc.operatingProfit], ['PPh final konstruksi', -calc.pph],
      ['Laba bersih proyeksi', calc.net, true]
    ].map(([label, value, emphasis]) => `<div class="projection-summary-row${emphasis ? ' emphasis' : ''}"><span>${label}</span><strong>${money(value)}</strong></div>`).join('');
    input('projectionTaxDetail').innerHTML = [
      ['Tarif PPh final', `${number(state.pphRate).toLocaleString('id-ID')}%`], ['Dasar omzet PPh final', money(calc.revenue)],
      ['Estimasi PPh final', money(calc.pph)], ['PPN keluaran', money(calc.vatOutput)],
      ['Dasar biaya PPN masukan (di luar gaji)', money(calc.vatEligibleSpend)], ['Estimasi kredit PPN masukan', money(calc.vatInput)], ['Estimasi PPN yang disetor', money(calc.vatPayable)],
      ['Sisa kredit PPN masukan (jika ada)', money(calc.vatCreditCarry)]
    ].map(([label, value]) => `<div class="projection-taxline"><span>${label}</span><strong>${value}</strong></div>`).join('');
    renderQuarters(calc);
    renderBreakdown(calc);
  }

  function bind() {
    ['projectionYear', 'projectionRevenue', 'projectionQ1', 'projectionQ2', 'projectionQ3', 'projectionQ4', 'projectionPphRate', 'projectionVatRate', 'projectionInputVatShare', 'projectionHeadcount', 'projectionMonthlySalary', 'projectionAnnualAllowance', 'projectionEmployerBenefits'].forEach(id => bindLocaleInput(input(id)));
    input('projectionRevenue').addEventListener('input', () => { state.revenue = number(input('projectionRevenue').value); persist(); renderBusinessProjection(); });
    input('projectionYear').addEventListener('input', () => { state.year = Math.max(2020, Math.min(2100, number(input('projectionYear').value) || new Date().getFullYear())); persist(); });
    [1, 2, 3, 4].forEach(index => input(`projectionQ${index}`).addEventListener('input', () => {
      state.quarters[index - 1] = safePercent(input(`projectionQ${index}`).value); persist(); renderBusinessProjection();
    }));
    [['projectionPphRate', 'pphRate'], ['projectionVatRate', 'vatRate'], ['projectionInputVatShare', 'inputVatShare']].forEach(([id, key]) => input(id).addEventListener('input', () => {
      state[key] = safePercent(input(id).value); persist(); renderBusinessProjection();
    }));
    [['projectionHeadcount', 'headcount', true], ['projectionMonthlySalary', 'monthlySalary'], ['projectionAnnualAllowance', 'annualAllowance'], ['projectionEmployerBenefits', 'monthlyEmployerBenefits']].forEach(([id, key, integer]) => input(id).addEventListener('input', () => {
      state.payroll[key] = integer ? Math.floor(number(input(id).value)) : number(input(id).value); persist(); renderBusinessProjection();
    }));
    input('projectionReset').addEventListener('click', () => {
      if (!window.confirm('Reset seluruh asumsi, gaji, dan biaya ke nilai awal?')) return;
      state = structuredClone(defaults); persist(); setInputs(); renderBusinessProjection();
    });
  }

  window.renderBusinessProjection = renderBusinessProjection;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { setInputs(); bind(); renderBusinessProjection(); });
  else { setInputs(); bind(); renderBusinessProjection(); }
})();