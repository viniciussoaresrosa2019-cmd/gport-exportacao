/* Relatórios operacionais: painel existente e PDF mensal imprimível. */
(() => {
  let requestVersion = 0;
  let clientsLoaded = false;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
  const currentMonth = () => new Date().toISOString().slice(0, 7);
  const formatMonth = value => {
    const [year, month] = String(value || '').split('-').map(Number);
    return year && month ? new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric' }).format(new Date(year, month - 1, 1)) : '—';
  };
  const shortMonth = value => {
    const [year, month] = String(value || '').split('-').map(Number);
    return year && month ? new Intl.DateTimeFormat('pt-BR', { month:'short', year:'2-digit' }).format(new Date(year, month - 1, 1)).replace('.', '') : '—';
  };
  const reportTable = (entries, label) => entries.length
    ? `<div class="report-rank-list" role="list" aria-label="Ranking por ${label.toLowerCase()}">${entries.map(([name, count], index) => `<article class="report-rank-item" role="listitem"><span class="report-rank-position">${String(index + 1).padStart(2, '0')}</span><div><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong><small>${count} processo${count === 1 ? '' : 's'} lançado${count === 1 ? '' : 's'}</small></div><b>${count}</b></article>`).join('')}</div>`
    : '<div class="empty">Nenhum processo lançado neste período.</div>';
  const reportBarChart = entries => {
    if (!entries.length) return '<div class="chart-empty">Nenhum processo neste período.</div>';
    const max = Math.max(...entries.map(([, count]) => count), 1);
    return entries.map(([name, count], index) => `<div class="bar-row"><span class="bar-rank">${String(index + 1).padStart(2, '0')}</span><span class="bar-label" title="${escapeHtml(name)}">${escapeHtml(name)}</span><progress class="bar-progress" max="${max}" value="${count}" aria-label="${escapeHtml(name)}: ${count} processos"></progress><strong class="bar-value">${count}</strong></div>`).join('');
  };
  const setLoading = () => { el('reportTotal').textContent = '…'; el('reportAnalystCount').textContent = '…'; el('reportExporterCount').textContent = '…'; };

  async function renderReports() {
    const now = new Date();
    const view = el('reportView').value;
    const selectedMonth = el('reportMonth').value || currentMonth();
    const year = Number(view === 'monthly' ? selectedMonth.slice(0, 4) : (el('reportYear').value || now.getFullYear()));
    const month = Number(selectedMonth.slice(5, 7));
    const version = ++requestVersion;
    const params = new URLSearchParams({ year: String(year) });
    if (view === 'monthly') params.set('month', String(month));
    if (view === 'all') params.set('all', 'true');
    el('reportTitle').textContent = view === 'monthly' ? 'Visão mensal' : view === 'yearly' ? 'Visão anual' : 'Todos os processos lançados';
    el('reportTotalLabel').textContent = view === 'monthly' ? 'Processos lançados no mês' : view === 'yearly' ? 'Processos lançados no ano' : 'Total de processos lançados';
    el('reportPeriod').textContent = view === 'monthly' ? formatMonth(selectedMonth) : view === 'yearly' ? String(year) : 'Todos os períodos';
    setLoading();
    try {
      const report = await window.gportRequest(`/api/reports?${params}`);
      if (version !== requestVersion) return;
      const analysts = (report.analysts || []).map(item => [item.name || 'Não informado', Number(item.total || 0)]);
      const exporters = (report.exporters || []).map(item => [item.name || 'Não informado', Number(item.total || 0)]);
      el('reportTotal').textContent = report.total || 0;
      el('reportAnalystCount').textContent = analysts.length;
      el('reportExporterCount').textContent = exporters.length;
      el('analystChart').innerHTML = reportBarChart(analysts);
      el('exporterChart').innerHTML = reportBarChart(exporters);
      el('analystReport').innerHTML = reportTable(analysts, 'ANALISTA');
      el('exporterReport').innerHTML = reportTable(exporters, 'EXPORTADOR');
      translateInterface(savedAccessibility?.language);
    } catch {
      if (version !== requestVersion) return;
      el('reportTotal').textContent = '—'; el('reportAnalystCount').textContent = '—'; el('reportExporterCount').textContent = '—';
      el('analystChart').innerHTML = '<div class="chart-empty">Não foi possível carregar o relatório agora.</div>';
      el('exporterChart').innerHTML = '';
      window.gportUi?.toast?.error('Não foi possível carregar o relatório. Tente novamente.');
    }
  }

  function syncReportView() {
    const view = el('reportView').value;
    el('reportMonthField').hidden = view !== 'monthly';
    el('reportYearField').hidden = view !== 'yearly';
    void renderReports();
  }

  function chartSvg(comparison) {
    const rows = comparison || [];
    const max = Math.max(1, ...rows.flatMap(item => [Number(item.launched || 0), Number(item.released || 0), Number(item.shipped || 0)]));
    const width = 680, height = 244, chartTop = 24, chartHeight = 166, startX = 52, available = width - startX - 16;
    const groupWidth = available / Math.max(rows.length, 1);
    const barWidth = Math.min(14, Math.max(7, groupWidth / 5));
    const series = [['launched', '#155b91'], ['released', '#18815c'], ['shipped', '#b60008']];
    const grid = [0, .25, .5, .75, 1].map(step => { const y = chartTop + chartHeight - chartHeight * step; return `<line x1="${startX}" y1="${y}" x2="${width - 12}" y2="${y}" stroke="#d8e2ea" stroke-width="1"/><text x="${startX - 8}" y="${y + 4}" text-anchor="end" fill="#607386" font-size="10">${Math.round(max * step)}</text>`; }).join('');
    const bars = rows.map((row, index) => {
      const groupX = startX + index * groupWidth + Math.max(0, (groupWidth - barWidth * 3 - 5) / 2);
      const shapes = series.map(([key, color], seriesIndex) => { const value = Number(row[key] || 0), barHeight = value / max * chartHeight, x = groupX + seriesIndex * (barWidth + 2), y = chartTop + chartHeight - barHeight; return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth}" height="${barHeight.toFixed(1)}" rx="2" fill="${color}"><title>${escapeHtml(shortMonth(row.month))}: ${value}</title></rect>`; }).join('');
      return `${shapes}<text x="${(startX + index * groupWidth + groupWidth / 2).toFixed(1)}" y="${chartTop + chartHeight + 21}" text-anchor="middle" fill="#52677b" font-size="10">${escapeHtml(shortMonth(row.month))}</text>`;
    }).join('');
    return `<svg class="operational-report-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparativo de processos lançados, liberados e embarques dos últimos seis meses"><g font-family="Arial, sans-serif">${grid}${bars}</g></svg>`;
  }

  function reportPdfHtml(report) {
    const current = report.current || {}, scope = report.client?.name || 'Todos os clientes', comparison = report.comparison || [];
    const rows = comparison.map(item => `<tr><td>${escapeHtml(formatMonth(item.month))}</td><td>${Number(item.launched || 0)}</td><td>${Number(item.released || 0)}</td><td>${Number(item.shipped || 0)}</td></tr>`).join('');
    const bookingList = values => {
      const bookings = Array.isArray(values) ? values.filter(Boolean) : [];
      return bookings.length ? `<ul class="booking-list">${bookings.map(booking => `<li>${escapeHtml(booking)}</li>`).join('')}</ul>` : '<p class="booking-empty">Nenhum booking</p>';
    };
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório operacional ${escapeHtml(formatMonth(report.month))}</title><style>@page{size:A4;margin:13mm}*{box-sizing:border-box}body{margin:0;color:#13283a;font-family:Arial,sans-serif}.header{border-bottom:3px solid #155b91;padding:0 0 15px}.brand{color:#155b91;font-size:11px;font-weight:800;letter-spacing:1.2px}.header h1{margin:7px 0 4px;font-size:25px}.header p{margin:0;color:#607386;font-size:12px}.cards{display:grid;grid-template-columns:repeat(3,1fr);align-items:start;gap:10px;margin:19px 0}.card{min-height:88px;padding:13px;border:1px solid #d7e1e8;border-radius:8px;background:#f8fbfd;break-inside:avoid}.card>span{display:block;color:#607386;font-size:10px;font-weight:700;letter-spacing:.45px;text-transform:uppercase}.card>strong{display:block;margin-top:10px;color:#123d62;font-size:30px;line-height:1}.card.shipped>strong{color:#a70007}.booking-list{display:grid;gap:3px;margin:12px 0 0;padding:9px 0 0 17px;border-top:1px solid #d7e1e8;color:#284a66;font-size:9px;line-height:1.25}.booking-list li{padding-left:1px;overflow-wrap:anywhere}.booking-empty{margin:12px 0 0!important;padding-top:9px;border-top:1px solid #d7e1e8;color:#7a8996!important;font-size:9px!important}.section{margin-top:20px;padding:16px;border:1px solid #d7e1e8;border-radius:9px}.section h2{margin:0;font-size:15px}.section p{margin:5px 0 13px;color:#607386;font-size:11px}.legend{display:flex;gap:14px;align-items:center;margin:0 0 4px;color:#506579;font-size:10px}.legend i{display:inline-block;width:9px;height:9px;margin-right:4px;border-radius:2px}.operational-report-chart{display:block;width:100%;height:auto;margin-top:4px}table{width:100%;margin-top:10px;border-collapse:collapse;font-size:10px}th,td{padding:8px;border:1px solid #dce4ea;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#edf3f7;color:#34536d;font-size:9px;text-transform:uppercase}.footer{margin-top:15px;color:#6a7d8c;font-size:9px;text-align:right}@media print{.section{break-inside:avoid}}</style></head><body><header class="header"><div class="brand">GPORT · COMÉRCIO EXTERIOR</div><h1>Relatório operacional mensal</h1><p><strong>Período:</strong> ${escapeHtml(formatMonth(report.month))} &nbsp; | &nbsp; <strong>Exportador:</strong> ${escapeHtml(scope)}</p></header><section class="cards"><article class="card"><span>Processos lançados</span><strong>${Number(current.launched || 0)}</strong>${bookingList(current.launched_bookings)}</article><article class="card"><span>Processos liberados</span><strong>${Number(current.released || 0)}</strong>${bookingList(current.released_bookings)}</article><article class="card shipped"><span>Embarques registrados</span><strong>${Number(current.shipped || 0)}</strong>${bookingList(current.shipped_bookings)}</article></section><section class="section"><h2>Comparação entre meses</h2><p>Volume de lançamentos, liberações e embarques nos últimos seis meses, incluindo o período selecionado.</p><div class="legend"><span><i style="background:#155b91"></i>Lançados</span><span><i style="background:#18815c"></i>Liberados</span><span><i style="background:#b60008"></i>Embarques</span></div>${chartSvg(comparison)}</section><section class="section"><h2>Dados comparativos</h2><table><thead><tr><th>Mês</th><th>Lançados</th><th>Liberados</th><th>Embarques</th></tr></thead><tbody>${rows}</tbody></table></section><footer class="footer">Relatório gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</footer></body></html>`;
  }

  function ensureOperationalReportDialog() {
    let dialog = document.getElementById('monthlyOperationalReportDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'monthlyOperationalReportDialog';
    dialog.className = 'monthly-operational-report-dialog';
    dialog.setAttribute('aria-labelledby', 'monthlyOperationalReportTitle');
    dialog.innerHTML = `<div class="modal-head"><div><p class="eyebrow">Indicadores da operação</p><h2 id="monthlyOperationalReportTitle">Relatórios</h2></div><button class="close" type="button" data-close-monthly-report aria-label="Fechar">×</button></div><form id="monthlyOperationalReportForm" class="monthly-operational-report-form"><p>Selecione o mês e, se necessário, um exportador para gerar o PDF operacional.</p><div class="report-pdf-controls"><div class="field"><label for="monthlyOperationalReportMonth">Mês de referência</label><input id="monthlyOperationalReportMonth" name="month" type="month" required></div><div class="field"><label for="monthlyOperationalReportClient">Exportador</label><select id="monthlyOperationalReportClient" name="client"><option value="">Todos os clientes</option></select></div></div><div class="actions"><button type="button" class="btn secondary" data-close-monthly-report>Cancelar</button><button type="submit" class="btn" id="generateMonthlyOperationalReportBtn">Gerar PDF</button></div></form>`;
    document.body.appendChild(dialog);
    dialog.querySelectorAll('[data-close-monthly-report]').forEach(button => { button.onclick = () => dialog.close(); });
    dialog.querySelector('form').onsubmit = event => { event.preventDefault(); void generateOperationalPdf(dialog); };
    return dialog;
  }

  async function loadClientsForReport(dialog) {
    if (clientsLoaded) return;
    const select = dialog.querySelector('[name="client"]');
    select.disabled = true;
    try {
      const clients = await window.gportRequest('/api/clients');
      clients.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity:'base' }));
      select.insertAdjacentHTML('beforeend', clients.map(client => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`).join(''));
      clientsLoaded = true;
    } catch (error) {
      window.gportUi?.toast?.error(error.message || 'Não foi possível carregar os exportadores.');
    } finally { select.disabled = false; }
  }

  async function generateOperationalPdf(dialog) {
    const form = dialog.querySelector('form'), button = dialog.querySelector('#generateMonthlyOperationalReportBtn'), values = new FormData(form);
    const params = new URLSearchParams({ month: String(values.get('month') || '') });
    if (values.get('client')) params.set('client', String(values.get('client')));
    button.disabled = true; button.textContent = 'Gerando…';
    try {
      const report = await window.gportRequest(`/api/reports/operational-monthly?${params}`);
      const nonce = document.querySelector('meta[name="csp-nonce"]')?.content || '';
      el('previewTitle').textContent = 'Relatório operacional mensal';
      el('pdfFrame').srcdoc = reportPdfHtml(report).replaceAll('<style>', `<style nonce="${nonce}">`);
      dialog.close(); el('previewDialog').showModal();
      window.gportUi?.toast?.success('Relatório mensal preparado para impressão ou salvamento em PDF.');
    } catch (error) {
      window.gportUi?.toast?.error(error.message || 'Não foi possível gerar o relatório mensal.');
    } finally { button.disabled = false; button.textContent = 'Gerar PDF'; }
  }

  async function openOperationalReport() {
    const dialog = ensureOperationalReportDialog();
    dialog.querySelector('[name="month"]').value = el('reportMonth')?.value || currentMonth();
    if (!dialog.open) dialog.showModal();
    await loadClientsForReport(dialog);
  }

  function ensureOperationalReportButton() {
    const top = document.querySelector('#reportsPage .top'), close = el('closeReportsBtn');
    if (!top || !close || document.getElementById('openOperationalReportBtn')) return;
    const actions = document.createElement('div'); actions.className = 'action-cluster';
    const button = document.createElement('button');
    button.id = 'openOperationalReportBtn'; button.className = 'btn'; button.type = 'button'; button.textContent = 'Relatórios';
    button.onclick = () => { void openOperationalReport(); };
    close.before(actions); actions.append(button, close);
  }

  function bindReportControls() {
    el('reportView').onchange = syncReportView;
    el('reportMonth').onchange = () => { void renderReports(); };
    el('reportYear').onchange = () => { void renderReports(); };
  }

  bindReportControls();
  ensureOperationalReportButton();
  window.renderReports = renderReports;
  window.syncReportView = syncReportView;
  window.gportReports = { render: renderReports, syncView: syncReportView };
  window.gportReports.openOperationalReport = openOperationalReport;
})();
