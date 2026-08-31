/*
 * Relatórios operacionais.
 *
 * Este módulo permanece em script clássico durante a transição para evitar
 * quebrar os contratos globais da interface atual. Ele depende somente das
 * utilidades compartilhadas `el`, `esc`, `translateInterface`, da API
 * autenticada `window.gportRequest` e dos toasts já existentes.
 */
(() => {
  let requestVersion = 0;

  const reportTable = (entries, label) => entries.length
    ? `<div class="report-rank-list" role="list" aria-label="Ranking por ${label.toLowerCase()}">${entries.map(([name, count], index) => `
        <article class="report-rank-item" role="listitem">
          <span class="report-rank-position">${String(index + 1).padStart(2, '0')}</span>
          <div><strong title="${esc(name)}">${esc(name)}</strong><small>${count} processo${count === 1 ? '' : 's'} lançado${count === 1 ? '' : 's'}</small></div>
          <b>${count}</b>
        </article>`).join('')}</div>`
    : '<div class="empty">Nenhum processo lançado neste período.</div>';

  const reportBarChart = entries => {
    if (!entries.length) return '<div class="chart-empty">Nenhum processo neste período.</div>';
    const max = Math.max(...entries.map(([, count]) => count), 1);
    return entries.map(([name, count], index) => `
      <div class="bar-row">
        <span class="bar-rank">${String(index + 1).padStart(2, '0')}</span>
        <span class="bar-label" title="${esc(name)}">${esc(name)}</span>
        <progress class="bar-progress" max="${max}" value="${count}" aria-label="${esc(name)}: ${count} processos"></progress>
        <strong class="bar-value">${count}</strong>
      </div>`).join('');
  };

  const setLoading = () => {
    el('reportTotal').textContent = '…';
    el('reportAnalystCount').textContent = '…';
    el('reportExporterCount').textContent = '…';
  };

  async function renderReports() {
    const now = new Date();
    const view = el('reportView').value;
    const selectedMonth = el('reportMonth').value || now.toISOString().slice(0, 7);
    const year = Number(view === 'monthly' ? selectedMonth.slice(0, 4) : (el('reportYear').value || now.getFullYear()));
    const month = Number(selectedMonth.slice(5, 7));
    const version = ++requestVersion;
    const params = new URLSearchParams({ year: String(year) });
    if (view === 'monthly') params.set('month', String(month));
    if (view === 'all') params.set('all', 'true');

    el('reportTitle').textContent = view === 'monthly' ? 'Visão mensal' : view === 'yearly' ? 'Visão anual' : 'Todos os processos lançados';
    el('reportTotalLabel').textContent = view === 'monthly' ? 'Processos lançados no mês' : view === 'yearly' ? 'Processos lançados no ano' : 'Total de processos lançados';
    el('reportPeriod').textContent = view === 'monthly'
      ? new Date(year, month - 1, 1).toLocaleDateString(savedAccessibility?.dateFormat || 'pt-BR', { month: 'long', year: 'numeric' })
      : view === 'yearly' ? String(year) : 'Todos os períodos';
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
      el('reportTotal').textContent = '—';
      el('reportAnalystCount').textContent = '—';
      el('reportExporterCount').textContent = '—';
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

  // Compatibilidade temporária com os nomes usados pela camada legada e pelo
  // fluxo de navegação atual. A remoção só ocorrerá após os módulos restantes
  // deixarem de depender destas funções globais.
  window.renderReports = renderReports;
  window.syncReportView = syncReportView;
  window.gportReports = { render: renderReports, syncView: syncReportView };
})();
