(() => {
  const english = () => localStorage.getItem('dnd_language') === 'en';
  const labels = () => english() ? {
    title: 'Contract and Invoice Monitoring', packages: 'Work packages', contractValue: 'Contract value', paid: 'Paid invoices', unpaid: 'Unpaid invoices', paidAmount: 'Paid amount', unpaidAmount: 'Unpaid amount',
    name: 'Work package name', contractNo: 'Contract number', contractDate: 'Contract date', value: 'Contract value (IDR)', invoiceNo: 'Invoice number', invoiceDate: 'Invoice date', invoiceAmount: 'Invoice amount (IDR)', paidValue: 'Amount paid (IDR)', paidDate: 'Payment date', outstanding: 'Outstanding amount (IDR)', progress: 'Actual site progress (%)', status: 'Payment status',
    paidStatus: 'Paid', partialStatus: 'Partially paid', unpaidStatus: 'Unpaid', noInvoice: 'No invoice', invoiceCount: 'Invoice count', totalInvoiced: 'Total invoiced (IDR)', generated: 'Generated', packageSummary: 'Package summary', invoiceDetails: 'Invoice details', page: 'Page'
  } : {
    title: 'Monitoring Kontrak dan Tagihan', packages: 'Paket pekerjaan', contractValue: 'Nilai kontrak', paid: 'Invoice dibayar', unpaid: 'Invoice belum lunas', paidAmount: 'Nilai dibayar', unpaidAmount: 'Sisa belum dibayar',
    name: 'Nama Paket Pekerjaan', contractNo: 'Nomor Kontrak', contractDate: 'Tanggal Kontrak', value: 'Nilai Kontrak (Rp)', invoiceNo: 'Nomor Invoice Tagihan', invoiceDate: 'Tanggal Invoice', invoiceAmount: 'Nilai Invoice (Rp)', paidValue: 'Nilai Dibayarkan (Rp)', paidDate: 'Tanggal Dibayarkan', outstanding: 'Sisa Hutang (Rp)', progress: 'Progress Actual Site (%)', status: 'Status Pembayaran',
    paidStatus: 'Dibayar', partialStatus: 'Dibayar sebagian', unpaidStatus: 'Belum dibayar', noInvoice: 'Belum ada invoice', invoiceCount: 'Jumlah invoice', totalInvoiced: 'Total tagihan (Rp)', generated: 'Dibuat', packageSummary: 'Rekap paket pekerjaan', invoiceDetails: 'Rincian invoice', page: 'Halaman'
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const amount = value => Math.max(0, Number(value) || 0);
  function paidAmount(invoice) {
    const total = amount(invoice?.amount), paid = amount(invoice?.paidAmount);
    if (paid > 0) return Math.min(total || paid, paid);
    return invoice?.paidDate && contractStatus(invoice) === 'paid' ? total : 0;
  }
  function dueAmount(invoice) { return Math.max(0, amount(invoice?.amount) - paidAmount(invoice)); }
  function statusText(invoice, t) {
    const status = contractStatus(invoice);
    return status === 'paid' ? t.paidStatus : status === 'partial' ? t.partialStatus : t.unpaidStatus;
  }
  function snapshot() {
    const t = labels(), projects = contractRows();
    const packageRows = projects.map(project => {
      const invoices = uniqueContractInvoices([project]);
      const invoiceTotal = invoices.reduce((sum, invoice) => sum + amount(invoice.amount), 0);
      const paidTotal = invoices.reduce((sum, invoice) => sum + paidAmount(invoice), 0);
      const outstanding = invoices.length ? invoices.reduce((sum, invoice) => sum + dueAmount(invoice), 0) : amount(project.debtOutstanding);
      return {
        [t.name]: project.name || '—', [t.contractNo]: project.contractNo || '—', [t.contractDate]: project.contractDate || '', [t.value]: amount(project.value),
        [t.invoiceCount]: invoices.length, [t.invoiceNo]: invoices.map(invoice => invoice.number || '—').join(' | ') || '—', [t.invoiceDate]: invoices.map(invoice => invoice.date || '—').join(' | ') || '—',
        [t.totalInvoiced]: invoiceTotal, [t.paidValue]: paidTotal, [t.paidDate]: invoices.map(invoice => invoice.paidDates?.length ? invoice.paidDates.join(', ') : invoice.paidDate || '').filter(Boolean).join(' | ') || '—',
        [t.outstanding]: outstanding, [t.progress]: Math.max(0, Math.min(100, Number(project.progressActual) || 0))
      };
    });
    const invoiceRows = projects.flatMap(project => {
      const invoices = uniqueContractInvoices([project]);
      if (!invoices.length) return [{ project, invoice: null, due: amount(project.debtOutstanding), paid: 0 }];
      return invoices.map(invoice => ({ project, invoice, due: dueAmount(invoice), paid: paidAmount(invoice) }));
    });
    const allInvoices = uniqueContractInvoices(projects);
    const paidInvoices = allInvoices.filter(invoice => contractStatus(invoice) === 'paid');
    const unpaidInvoices = allInvoices.filter(invoice => contractStatus(invoice) !== 'paid');
    const metrics = {
      packageCount: projects.length,
      contractValue: projects.reduce((sum, project) => sum + amount(project.value), 0),
      paidCount: paidInvoices.length,
      paidValue: paidInvoices.reduce((sum, invoice) => sum + paidAmount(invoice), 0),
      unpaidCount: unpaidInvoices.length,
      unpaidValue: unpaidInvoices.reduce((sum, invoice) => sum + dueAmount(invoice), 0)
    };
    return { t, projects, packageRows, invoiceRows, metrics };
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function packageTableRows(data) {
    const t = data.t;
    return data.packageRows.map(row => [row[t.name], row[t.contractNo], row[t.contractDate], row[t.value], row[t.invoiceCount], row[t.invoiceNo], row[t.invoiceDate], row[t.totalInvoiced], row[t.paidValue], row[t.paidDate], row[t.outstanding], row[t.progress]]);
  }
  function invoiceTableRows(data) {
    const t = data.t;
    return data.invoiceRows.map(({project, invoice, due, paid}) => [project.name || '—', project.contractNo || '—', project.contractDate || '', amount(project.value), invoice?.number || '—', invoice?.date || '', amount(invoice?.amount), paid, invoice?.paidDates?.length ? invoice.paidDates.join(', ') : invoice?.paidDate || '', due, invoice ? statusText(invoice, t) : t.noInvoice, Math.max(0, Math.min(100, Number(project.progressActual) || 0))]);
  }
  function summaryRows(data) {
    const t = data.t, m = data.metrics;
    return [[t.title], [t.generated, new Date().toLocaleString(english() ? 'en-GB' : 'id-ID')], [], [t.packages, m.packageCount], [t.contractValue, m.contractValue], [t.paid, m.paidCount], [t.paidAmount, m.paidValue], [t.unpaid, m.unpaidCount], [t.unpaidAmount, m.unpaidValue]];
  }
  function contractsExportExcel() {
    const data = snapshot(), t = data.t;
    if (window.XLSX?.utils) {
      const book = XLSX.utils.book_new();
      const overview = XLSX.utils.aoa_to_sheet(summaryRows(data));
      overview['!cols'] = [{ wch: 35 }, { wch: 28 }];
      XLSX.utils.book_append_sheet(book, overview, english() ? 'Overview' : 'Ringkasan');
      const packageHeaders = [t.name,t.contractNo,t.contractDate,t.value,t.invoiceCount,t.invoiceNo,t.invoiceDate,t.totalInvoiced,t.paidValue,t.paidDate,t.outstanding,t.progress];
      const packageSheet = XLSX.utils.aoa_to_sheet([packageHeaders, ...packageTableRows(data)]);
      packageSheet['!cols'] = [34,22,16,20,14,34,28,20,20,28,20,18].map(wch => ({wch}));
      packageSheet['!autofilter'] = { ref: packageSheet['!ref'] };
      XLSX.utils.book_append_sheet(book, packageSheet, english() ? 'Packages' : 'Rekap Paket');
      const invoiceHeaders = [t.name,t.contractNo,t.contractDate,t.value,t.invoiceNo,t.invoiceDate,t.invoiceAmount,t.paidValue,t.paidDate,t.outstanding,t.status,t.progress];
      const invoiceSheet = XLSX.utils.aoa_to_sheet([invoiceHeaders, ...invoiceTableRows(data)]);
      invoiceSheet['!cols'] = [34,22,16,20,24,16,20,20,24,20,20,18].map(wch => ({wch}));
      invoiceSheet['!autofilter'] = { ref: invoiceSheet['!ref'] };
      XLSX.utils.book_append_sheet(book, invoiceSheet, english() ? 'Invoices' : 'Rincian Invoice');
      XLSX.writeFile(book, 'monitoring-kontrak-tagihan.xlsx');
      return;
    }
    const headers = Object.keys(data.packageRows[0] || {});
    const html = '<html><head><meta charset="utf-8"></head><body><table><tr>' + headers.map(x => '<th>'+esc(x)+'</th>').join('') + '</tr>' + data.packageRows.map(row => '<tr>'+headers.map(key => '<td>'+esc(row[key])+'</td>').join('')+'</tr>').join('') + '</table></body></html>';
    download(new Blob(['\ufeff',html], {type:'application/vnd.ms-excel;charset=utf-8'}), 'monitoring-kontrak-tagihan.xls');
  }
  function reportTable(headers, rows) {
    return '<table><thead><tr>'+headers.map(value=>'<th>'+esc(value)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  }
  function contractsExportDoc() {
    const data = snapshot(), t = data.t, packageHeaders = [t.name,t.contractNo,t.contractDate,t.value,t.invoiceCount,t.invoiceNo,t.invoiceDate,t.totalInvoiced,t.paidValue,t.paidDate,t.outstanding,t.progress], invoiceHeaders = [t.name,t.contractNo,t.invoiceNo,t.invoiceDate,t.invoiceAmount,t.paidValue,t.paidDate,t.outstanding,t.status];
    const m = data.metrics;
    const html = '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:landscape;margin:1.4cm}body{font-family:Arial,sans-serif;color:#213747;font-size:9pt}h1{font-size:20pt}h2{font-size:14pt;margin-top:24px}.summary{margin:12px 0 20px}table{border-collapse:collapse;width:100%;table-layout:auto;margin:8px 0 18px}th{background:#15384a;color:#fff}td,th{border:1px solid #ccd7dc;padding:5px;vertical-align:top}tr:nth-child(even){background:#f4f7f8}</style></head><body><h1>'+esc(t.title)+'</h1><p>'+esc(t.generated)+': '+esc(new Date().toLocaleString(english()?'en-GB':'id-ID'))+'</p><table class="summary"><tr><th>'+esc(t.packages)+'</th><th>'+esc(t.contractValue)+'</th><th>'+esc(t.paid)+'</th><th>'+esc(t.paidAmount)+'</th><th>'+esc(t.unpaid)+'</th><th>'+esc(t.unpaidAmount)+'</th></tr><tr><td>'+m.packageCount+'</td><td>'+esc(contractMoney(m.contractValue))+'</td><td>'+m.paidCount+'</td><td>'+esc(contractMoney(m.paidValue))+'</td><td>'+m.unpaidCount+'</td><td>'+esc(contractMoney(m.unpaidValue))+'</td></tr></table><h2>'+esc(t.packageSummary)+'</h2>'+reportTable(packageHeaders,packageTableRows(data))+'<h2>'+esc(t.invoiceDetails)+'</h2>'+reportTable(invoiceHeaders,invoiceTableRows(data).map(row=>[row[0],row[1],row[4],row[5],row[6],row[7],row[8],row[9],row[10]]))+'</body></html>';
    download(new Blob(['\ufeff',html], {type:'application/msword;charset=utf-8'}), 'monitoring-kontrak-tagihan.doc');
  }
  function pdfBytesFromImages(images) {
    const encoder = new TextEncoder(), encode = value => encoder.encode(value), concat = chunks => {
      const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0), result = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } return result;
    };
    const objects = [], pageIds = images.map((_, index) => 3 + index * 3);
    objects[1] = encode('<< /Type /Catalog /Pages 2 0 R >>');
    objects[2] = encode('<< /Type /Pages /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') + '] /Count ' + images.length + ' >>');
    images.forEach((image, index) => {
      const pageId = 3 + index * 3, imageId = pageId + 1, contentId = pageId + 2;
      const binary = atob(image.split(',')[1]), jpeg = new Uint8Array(binary.length);
      for (let i=0;i<binary.length;i++) jpeg[i]=binary.charCodeAt(i);
      objects[pageId] = encode('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im0 '+imageId+' 0 R >> >> /Contents '+contentId+' 0 R >>');
      objects[imageId] = concat([encode('<< /Type /XObject /Subtype /Image /Width 1684 /Height 1190 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n'), jpeg, encode('\nendstream')]);
      const content = encode('q 842 0 0 595 0 0 cm /Im0 Do Q');
      objects[contentId] = concat([encode('<< /Length '+content.length+' >>\nstream\n'),content,encode('\nendstream')]);
    });
    const chunks=[encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')], offsets=[0]; let byteLength=chunks[0].length;
    for(let id=1;id<objects.length;id++){offsets[id]=byteLength;const header=encode(id+' 0 obj\n'),footer=encode('\nendobj\n');chunks.push(header,objects[id],footer);byteLength+=header.length+objects[id].length+footer.length}
    const xrefOffset=byteLength, xref='xref\n0 '+objects.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xrefOffset+'\n%%EOF';
    chunks.push(encode(xref)); return new Blob([concat(chunks)],{type:'application/pdf'});
  }
  function wrapCanvasText(ctx, value, maxWidth, maxLines=2) {
    const words=String(value??'—').split(/\s+/), lines=[]; let line='';
    for(const word of words){const candidate=line?line+' '+word:word;if(ctx.measureText(candidate).width<=maxWidth){line=candidate;continue}if(line)lines.push(line);line=word;if(ctx.measureText(line).width>maxWidth){let part='';for(const char of line){if(ctx.measureText(part+char).width>maxWidth&&part){lines.push(part);part=char}else part+=char}line=part}}
    if(line)lines.push(line); if(lines.length>maxLines){lines.length=maxLines;lines[maxLines-1]=lines[maxLines-1].replace(/\s+$/,'').replace(/[.,;:]?$/,'…')} return lines;
  }
  async function contractsExportPdf() {
    const data=snapshot(),t=data.t,m=data.metrics,rows=invoiceTableRows(data),width=1684,height=1190,margin=64,columns=[230,125,110,140,160,110,145,165,115,160,96],headers=[t.name,t.contractNo,t.contractDate,t.value,t.invoiceNo,t.invoiceDate,t.invoiceAmount,t.paidValue,t.paidDate,t.outstanding,t.status],images=[];
    const perPage=20,totalPages=Math.max(1,Math.ceil(rows.length/perPage));
    for(let page=0;page<totalPages;page++){
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#17384a';ctx.font='bold 34px Arial';ctx.fillText(t.title,margin,60);ctx.fillStyle='#718490';ctx.font='18px Arial';ctx.fillText(t.generated+': '+new Date().toLocaleString(english()?'en-GB':'id-ID'),margin,91);
      const stats=[[t.packages,String(m.packageCount)],[t.contractValue,contractMoney(m.contractValue)],[t.paid,m.paidCount+' · '+contractMoney(m.paidValue)],[t.unpaid,m.unpaidCount+' · '+contractMoney(m.unpaidValue)]],boxGap=14,boxW=(width-2*margin-boxGap*3)/4,boxY=112,boxH=84;
      stats.forEach((item,index)=>{const x=margin+index*(boxW+boxGap);ctx.fillStyle='#f1f6f7';ctx.beginPath();ctx.roundRect(x,boxY,boxW,boxH,12);ctx.fill();ctx.fillStyle='#718490';ctx.font='16px Arial';ctx.fillText(item[0],x+16,boxY+27);ctx.fillStyle='#17384a';ctx.font='bold 22px Arial';ctx.fillText(item[1],x+16,boxY+62)});
      const pageRows=rows.slice(page*perPage,(page+1)*perPage),tableY=225,headH=62,rowH=42;let x=margin;
      ctx.fillStyle='#17384a';ctx.fillRect(margin,tableY,width-2*margin,headH);ctx.font='bold 14px Arial';ctx.fillStyle='#fff';headers.forEach((header,index)=>{const lines=wrapCanvasText(ctx,header,columns[index]-14,3);lines.forEach((line,lineNo)=>ctx.fillText(line,x+7,tableY+21+lineNo*16));x+=columns[index]});
      pageRows.forEach((row,rowIndex)=>{const y=tableY+headH+rowIndex*rowH;x=margin;ctx.fillStyle=rowIndex%2?'#f2f6f7':'#fff';ctx.fillRect(margin,y,width-2*margin,rowH);ctx.strokeStyle='#d8e1e5';ctx.beginPath();ctx.moveTo(margin,y+rowH);ctx.lineTo(width-margin,y+rowH);ctx.stroke();ctx.font='13px Arial';ctx.fillStyle='#243c4a';headers.forEach((_,index)=>{const raw=index===3||index===6||index===7||index===9?contractMoney(Number(row[index])||0):String(row[index]??'—');const lines=wrapCanvasText(ctx,raw,columns[index]-14,2);lines.forEach((line,lineNo)=>ctx.fillText(line,x+7,y+17+lineNo*15));x+=columns[index]})});
      ctx.fillStyle='#80909a';ctx.font='14px Arial';ctx.fillText(t.page+' '+(page+1)+' / '+totalPages,margin,height-22);images.push(canvas.toDataURL('image/jpeg',0.9));
    }
    download(pdfBytesFromImages(images),'monitoring-kontrak-tagihan.pdf');
  }
  window.contractsExportExcel=contractsExportExcel;
  window.contractsExportDoc=contractsExportDoc;
  window.contractsExportPdf=contractsExportPdf;
  const css=document.createElement('style');css.textContent='.contract-export-menu{position:relative}.contract-export-menu>summary{list-style:none}.contract-export-menu>summary::-webkit-details-marker{display:none}.contract-export-options{position:absolute;z-index:30;right:0;top:calc(100% + 7px);min-width:175px;padding:6px;background:#fff;border:1px solid #dce6e9;border-radius:12px;box-shadow:0 12px 30px rgba(20,48,62,.16)}.contract-export-options button{width:100%;border:0;background:transparent;text-align:left;padding:10px 12px;border-radius:8px;color:#244354;cursor:pointer;font:inherit;font-size:12px}.contract-export-options button:hover{background:#edf6f5;color:#087e80}';document.head.appendChild(css);
})();
