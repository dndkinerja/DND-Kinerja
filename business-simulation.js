(() => {
  const STORAGE_KEY = 'dnd_business_projection_v1';
  const defaults = {
    year: new Date().getFullYear(), revenue: 0, quarters: [20, 25, 25, 30],
    pphRate: 1.75, vatRate: 11, inputVatShare: 80,
    direct: { materials: 0, labor: 0, subcontract: 0, equipment: 0, logistics: 0, otherDirect: 0 },
    operating: { salaries: 0, office: 0, admin: 0, marketing: 0, depreciation: 0, otherOperating: 0 }, payroll: { headcount: 0, monthlySalary: 0, annualAllowance: 0, monthlyEmployerBenefits: 0 }
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
  const number = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
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
        payroll: { ...defaults.payroll, ...(saved.payroll || {}) }
      } : structuredClone(defaults);
    } catch (_) { return structuredClone(defaults); }
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* storage may be unavailable in private browsing */ }
  }

  function total(group) { return Object.values(group).reduce((sum, value) => sum + number(value), 0); }

  function calculations() {
    const revenue = number(state.revenue);
    const direct = total(state.direct);
    const headcount = Math.floor(number(state.payroll.headcount));
    const payroll = { headcount, salary: headcount * number(state.payroll.monthlySalary) * 12, allowance: headcount * number(state.payroll.annualAllowance), employerBenefits: headcount * number(state.payroll.monthlyEmployerBenefits) * 12 };
    payroll.total = payroll.salary + payroll.allowance + payroll.employerBenefits;
    const operatingOther = total(state.operating);
    const operating = operatingOther + payroll.total;
    const gross = revenue - direct;
    const operatingProfit = gross - operating;
    const pph = revenue * number(state.pphRate) / 100;
    const vatOutput = revenue * number(state.vatRate) / 100;
    const vatEligibleSpend = Math.max(0, direct + operatingOther - number(state.operating.salaries)) * safePercent(state.inputVatShare) / 100;
    const vatInput = vatEligibleSpend * number(state.vatRate) / 100;
    const vatPayable = Math.max(0, vatOutput - vatInput);
    return { revenue, direct, payroll, operatingOther, operating, gross, grossMargin: revenue ? gross / revenue * 100 : 0, operatingProfit, pph, net: operatingProfit - pph, vatOutput, vatEligibleSpend, vatInput, vatPayable, vatCreditCarry: Math.max(0, vatInput - vatOutput) };
  }

  function costFields(containerId, groupName, labels) {
    input(containerId).innerHTML = labels.map(([key, label]) => `<label class="projection-cost-input"><span>${label}</span><input type="number" min="0" step="100000" id="projection_${groupName}_${key}" aria-label="${label}" value="${number(state[groupName][key])}"></label>`).join('');
    labels.forEach(([key]) => input(`projection_${groupName}_${key}`).addEventListener('input', () => {
      state[groupName][key] = number(input(`projection_${groupName}_${key}`).value);
      persist(); renderBusinessProjection();
    }));
  }

  function setInputs() {
    input('projectionYear').value = state.year;
    input('projectionRevenue').value = number(state.revenue);
    state.quarters.forEach((share, index) => { input(`projectionQ${index + 1}`).value = share; });
    input('projectionPphRate').value = number(state.pphRate);
    input('projectionVatRate').value = number(state.vatRate);
    input('projectionInputVatShare').value = number(state.inputVatShare);
    input('projectionHeadcount').value = Math.floor(number(state.payroll.headcount));
    input('projectionMonthlySalary').value = number(state.payroll.monthlySalary);
    input('projectionAnnualAllowance').value = number(state.payroll.annualAllowance);
    input('projectionEmployerBenefits').value = number(state.payroll.monthlyEmployerBenefits);
    costFields('projectionDirectCosts', 'direct', directLabels);
    costFields('projectionOperatingCosts', 'operating', operatingLabels);
  }

  function renderBreakdown(calc) {
    const rows = [];
    directLabels.forEach(([key, label]) => rows.push({ label, category: 'Biaya langsung', amount: number(state.direct[key]), note: 'Dikurangkan untuk memperoleh laba kotor; dialokasikan menurut porsi omzet kuartal.' }));
    rows.push({ label: 'Gaji pokok karyawan (12 bulan)', category: 'Gaji karyawan', amount: calc.payroll.salary, note: calc.payroll.headcount + ' orang × ' + money(number(state.payroll.monthlySalary)) + ' per bulan × 12 bulan.' });
    rows.push({ label: 'THR/tunjangan karyawan', category: 'Gaji karyawan', amount: calc.payroll.allowance, note: calc.payroll.headcount + ' orang × ' + money(number(state.payroll.annualAllowance)) + ' per tahun.' });
    rows.push({ label: 'Iuran BPJS bagian pemberi kerja', category: 'Gaji karyawan', amount: calc.payroll.employerBenefits, note: calc.payroll.headcount + ' orang × ' + money(number(state.payroll.monthlyEmployerBenefits)) + ' per bulan × 12 bulan.' });
    operatingLabels.forEach(([key, label]) => rows.push({ label, category: 'Operasional lainnya', amount: number(state.operating[key]), note: 'Dikurangkan setelah laba kotor untuk memperoleh laba operasional.' }));
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