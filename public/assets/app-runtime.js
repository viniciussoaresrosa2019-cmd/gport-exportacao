    /* Integração com a API: dados e credenciais não ficam mais no localStorage. */
    (() => {
      const { toast, safeMessage: safeToastMessage, confirmAction } = window.gportUi;
      const cspNonce = document.querySelector('meta[name="csp-nonce"]')?.content || '';
      const securePrintHtml = html => html.replaceAll('<style>', `<style nonce="${cspNonce}">`);
      const syncShipmentTypeWithoutInlineStyle = () => {
        const isLcl = form.elements.tipoEmbarque.value === 'LCL';
        el('containerFields').querySelectorAll('input,select').forEach(input => { input.disabled = isLcl; });
        el('containerFields').hidden = isLcl;
        if (isLcl) {
          for (const name of ['qtdContainers','tipoContainer','containers','tara','lacre','lacreNovo','notasFiscais']) form.elements[name].value = '';
          el('containerDetails').replaceChildren();
        }
      };
      syncShipmentType = syncShipmentTypeWithoutInlineStyle;
      form.elements.tipoEmbarque.onchange = syncShipmentTypeWithoutInlineStyle;
      // O novo lacre só complementa a vistoria MAPA. Ele pode ser informado
      // depois, sem impedir o lançamento do processo.
      const makeMapaSealOptional = () => el('containerDetails')?.querySelectorAll('[data-new-seal]').forEach(input => { input.required = false; });
      new MutationObserver(makeMapaSealOptional).observe(el('containerDetails'), { childList:true });
      makeMapaSealOptional();
      const pendingToast = sessionStorage.getItem('gport_toast_notice');
      if (pendingToast) { sessionStorage.removeItem('gport_toast_notice'); window.setTimeout(() => toast.info(pendingToast), 50); }
      const csrfToken = () => document.cookie.split('; ').find(value => value.startsWith('gport_csrf='))?.split('=').slice(1).join('') || '';
      let availableAssignees = [];
      let realtimeSource = null;
      let realtimeRefreshTimer = null;
      let sessionRecoveryRequired = false;
      let sessionCheckPromise = null;
      let lastSessionCheckAt = 0;
      const sessionCheckIntervalMs = 15 * 60 * 1000;
      // Clientes e responsáveis quase não mudam durante uma sessão. Mantê-los
      // em memória evita duas requisições extras a cada busca, paginação ou
      // atualização da planilha. O cache não persiste no navegador e expira
      // rapidamente para que alterações feitas por outra pessoa apareçam.
      const referenceDataCache = { expiresAt: 0 };
      const referenceDataTtlMs = 5 * 60 * 1000;
      let referenceDataLoadPromise = null;
      let selectedVgmReportDay = null;
      const autoSaveTimers = new Map();
      const scheduleAutoSave = (key, task) => {
        clearTimeout(autoSaveTimers.get(key));
        autoSaveTimers.set(key, setTimeout(async () => { try { await task(); } catch (error) { toast.error(error.message); } }, 350));
      };
      const showProcessesPage = () => {
        el('processesPage').hidden = false; el('vgmPage').hidden = true; el('vgmReportPage').hidden = true; el('releasePage').hidden = true; el('followupPage').hidden = true; el('reportsPage').hidden = true;
        el('processNav').classList.add('active'); el('vgmNav').classList.remove('active'); el('vgmReportNav').classList.remove('active'); el('releaseNav').classList.remove('active'); el('followupNav').classList.remove('active'); el('reportsNav').classList.remove('active');
      };
      const showVgmPage = () => {
        el('processesPage').hidden = true; el('vgmPage').hidden = false; el('vgmReportPage').hidden = true; el('releasePage').hidden = true; el('followupPage').hidden = true; el('reportsPage').hidden = true;
        el('processNav').classList.remove('active'); el('vgmNav').classList.add('active'); el('vgmReportNav').classList.remove('active'); el('releaseNav').classList.remove('active'); el('followupNav').classList.remove('active'); el('reportsNav').classList.remove('active');
        renderVgm();
      };
      const showVgmReportPage = () => {
        if (!['admin', 'vgm'].includes(currentUser?.role)) { toast.warning('Acesso restrito a VGM e Administrador.'); return; }
        el('processesPage').hidden = true; el('vgmPage').hidden = true; el('vgmReportPage').hidden = false; el('releasePage').hidden = true; el('followupPage').hidden = true; el('reportsPage').hidden = true;
        el('processNav').classList.remove('active'); el('vgmNav').classList.remove('active'); el('vgmReportNav').classList.add('active'); el('releaseNav').classList.remove('active'); el('followupNav').classList.remove('active'); el('reportsNav').classList.remove('active');
        renderVgmReport();
      };
      const showReleasePage = () => {
        el('processesPage').hidden = true; el('vgmPage').hidden = true; el('vgmReportPage').hidden = true; el('releasePage').hidden = false; el('followupPage').hidden = true; el('reportsPage').hidden = true;
        el('processNav').classList.remove('active'); el('vgmNav').classList.remove('active'); el('vgmReportNav').classList.remove('active'); el('releaseNav').classList.add('active'); el('followupNav').classList.remove('active'); el('reportsNav').classList.remove('active');
        renderRelease();
      };
      const showFollowupPage = () => {
        el('processesPage').hidden = true; el('vgmPage').hidden = true; el('vgmReportPage').hidden = true; el('releasePage').hidden = true; el('followupPage').hidden = false; el('reportsPage').hidden = true;
        el('processNav').classList.remove('active'); el('vgmNav').classList.remove('active'); el('vgmReportNav').classList.remove('active'); el('releaseNav').classList.remove('active'); el('followupNav').classList.add('active'); el('reportsNav').classList.remove('active');
        renderFollowup();
      };
      const formatStorageSize = bytes => {
        const value = Number(bytes || 0);
        if (value < 1024 * 1024) return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits:1 }).format(value / 1024)} KB`;
        return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits:1 }).format(value / (1024 * 1024))} MB`;
      };
      const loadDatabaseUsage = async () => {
        const card = el('databaseUsageCard');
        card.dataset.level = 'loading';
        el('databaseUsagePercent').textContent = 'Carregando…';
        try {
          const usage = await request('/api/reports/database-usage');
          const percent = Math.max(0, Number(usage.usagePercent || 0));
          const progressPercent = Math.min(100, percent);
          const level = percent >= 95 ? 'critical' : percent >= 85 ? 'high' : percent >= 70 ? 'attention' : 'normal';
          const status = { normal:'Uso normal', attention:'Atenção', high:'Próximo do limite', critical:'Limite crítico' }[level];
          card.dataset.level = level;
          el('databaseUsagePercent').textContent = `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits:1 }).format(percent)}% utilizado`;
          el('databaseUsageAmount').textContent = `${formatStorageSize(usage.usedBytes)} de ${formatStorageSize(usage.capacityBytes)} · ${formatStorageSize(usage.availableBytes)} disponíveis`;
          el('databaseUsageStatus').textContent = status;
          el('databaseUsageBar').style.width = `${progressPercent}%`;
          const progress = el('databaseUsageProgress');
          progress.setAttribute('aria-valuenow', String(progressPercent));
          progress.setAttribute('aria-valuetext', `${percent}% utilizado, ${status.toLowerCase()}`);
          el('databaseUsageMeasuredAt').textContent = `Atualizado em ${new Date(usage.measuredAt).toLocaleString('pt-BR')}. O valor fica em cache por até 10 minutos.`;
        } catch (error) {
          card.dataset.level = 'error';
          el('databaseUsagePercent').textContent = 'Indisponível';
          el('databaseUsageAmount').textContent = 'Não foi possível medir o banco agora.';
          el('databaseUsageStatus').textContent = 'Tente novamente mais tarde';
          el('databaseUsageMeasuredAt').textContent = 'Os demais relatórios continuam disponíveis.';
        }
      };
      const showReportsPage = () => {
        if (currentUser?.role !== 'admin') { toast.warning('Apenas administradores podem acessar os relatórios.'); return; }
        el('processesPage').hidden = true; el('vgmPage').hidden = true; el('vgmReportPage').hidden = true; el('releasePage').hidden = true; el('followupPage').hidden = true; el('reportsPage').hidden = false;
        el('processNav').classList.remove('active'); el('vgmNav').classList.remove('active'); el('vgmReportNav').classList.remove('active'); el('releaseNav').classList.remove('active'); el('followupNav').classList.remove('active'); el('reportsNav').classList.add('active');
        const now = new Date(); if (!el('reportMonth').value) el('reportMonth').value = now.toISOString().slice(0,7); if (!el('reportYear').value) el('reportYear').value = now.getFullYear(); syncReportView(); void loadDatabaseUsage();
      };
      window.showProcessesPage = showProcessesPage;
      window.showReportsPage = showReportsPage;
      const applyRoleTabs = () => {
        const role = currentUser?.role;
        el('vgmNav').hidden = !['admin', 'analyst', 'vgm'].includes(role); el('vgmReportNav').hidden = true; el('openVgmReportBtn').hidden = !['admin', 'vgm'].includes(role);
        el('releaseNav').hidden = !['admin', 'analyst', 'liberacao'].includes(role);
        el('followupNav').hidden = !['admin', 'analyst'].includes(role);
        // Financeiro e Prazos permanecem no código para reversão futura, mas
        // ficam fora da experiência operacional atual por decisão de produto.
        el('financialNav').hidden = true;
        el('deadlineNav').hidden = true;
        el('reportsNav').hidden = role !== 'admin';
        if (el('vgmNav').hidden && el('releaseNav').hidden) showProcessesPage();
        window.dispatchEvent(new Event('gport:role-tabs-updated'));
      };
      const money = p => p.valor ? `${p.moeda || 'USD'} ${Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
      const sectionSearchOptions = '<option value="booking" selected>BOOKING</option><option value="fatura">FATURA</option><option value="due">DUE</option><option value="navio">NAVIO</option><option value="agencia">AGÊNCIA</option><option value="porto">PORTO</option><option value="importador">IMPORTADOR</option>';
      const matchesSectionSearch = (process, filter) => {
        if (!filter) return true;
        const term = String(filter.value || '').trim().toLocaleLowerCase('pt-BR');
        if (!term) return true;
        const values = filter.field === 'porto' ? [process.origem, process.destino] : [process[filter.field]];
        return values.some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(term));
      };
      const renderSectionSearch = (id, anchor, filter, onChange) => {
        let controls = el(id);
        if (!controls) { controls = document.createElement('div'); controls.id = id; controls.className = 'toolbar'; anchor.insertAdjacentElement('afterend', controls); }
        controls.innerHTML = `<select class="select" aria-label="Campo para filtrar">${sectionSearchOptions}</select><input class="search" placeholder="Informe o valor a pesquisar"><button class="btn" type="button">Filtrar</button><button class="btn secondary" type="button">Limpar</button>`;
        const [field, value, apply, clear] = controls.querySelectorAll('select,input,button');
        if (filter) { field.value = filter.field; value.value = filter.value; }
        const submit = () => { if (!field.value) return toast.warning('Selecione qual dado deseja pesquisar.'); if (!value.value.trim()) return toast.warning('Informe o valor a pesquisar.'); onChange({ field:field.value, value:value.value.trim() }); };
        let automaticSearchTimer = null;
        const runAutomaticSearch = () => {
          const term = value.value.trim();
          if (!term) { onChange(null); return; }
          if (!field.value) return;
          const caret = value.selectionStart;
          onChange({ field:field.value, value:term });
          requestAnimationFrame(() => { const nextInput = el(id)?.querySelector('input'); if (nextInput) { nextInput.focus(); nextInput.setSelectionRange(caret, caret); } });
        };
        const scheduleAutomaticSearch = () => { clearTimeout(automaticSearchTimer); automaticSearchTimer = setTimeout(runAutomaticSearch, 300); };
        apply.onclick = submit; clear.onclick = () => { clearTimeout(automaticSearchTimer); onChange(null); }; value.oninput = scheduleAutomaticSearch; field.onchange = scheduleAutomaticSearch; value.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); clearTimeout(automaticSearchTimer); submit(); } };
      };
      const vgmStatuses = ['Enviado pelo Cliente', 'Enviando no DRAFT', 'Não', 'Sim'];
      const renderVgm = () => {
        const canEdit = ['admin', 'vgm'].includes(currentUser?.role); const vgmSent = p => ['Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT'].includes(p.vgmStatus); const filterSelect = el('vgmFilterSelect'); filterSelect.value = vgmFilter; filterSelect.onchange = () => { vgmFilter = filterSelect.value; renderVgm(); }; renderSectionSearch('vgmSearchControls', filterSelect.closest('.field'), vgmSearchFilter, filter => { vgmSearchFilter = filter; renderVgm(); }); const vgmProcesses = (vgmFilter === 'sent' ? data.filter(vgmSent) : vgmFilter === 'pending' ? data.filter(p => !vgmSent(p)) : data).filter(process => matchesSectionSearch(process, vgmSearchFilter)).slice().sort((a,b) => String(b.dataEnvioVgmOrdenacao || '').localeCompare(String(a.dataEnvioVgmOrdenacao || '')));
        const options = p => vgmStatuses.map(status => `<option ${p.vgmStatus === status ? 'selected' : ''}>${esc(status)}</option>`).join('');
        const analystOptions = p => {
          const people = [...availableAssignees, ...(p.analistaFisico && !availableAssignees.some(a => a.username === p.analistaFisico) ? [{ username:p.analistaFisico, role:'' }] : [])];
          return `<option value="">Selecione</option>${people.map(person => `<option value="${esc(person.username)}" ${p.analistaFisico === person.username ? 'selected' : ''}>${esc(person.username)}</option>`).join('')}`;
        };
        el('vgmList').innerHTML = vgmProcesses.length ? `<div class="vgm-board" role="list" aria-label="Processos para controle de VGM">${vgmProcesses.map(p => { const key = esc(p.id); const booking = esc(p.booking || '—'); return `<article class="vgm-card process-status-row ${p.canalLiberacao ? `process-channel-${String(p.canalLiberacao).toLowerCase()}` : ''}" role="listitem"><div class="vgm-card-process"><span class="vgm-card-label">BOOKING</span><strong class="process">${booking}</strong><span class="vgm-card-exporter">${esc(p.exportador || '—')}</span><span class="vgm-card-importer">${esc(p.importador || 'Importador não informado')}</span></div><div class="vgm-card-field"><label for="vgm-status-${key}">STATUS VGM</label><select id="vgm-status-${key}" aria-label="Status VGM do booking ${booking}" data-vgm-status="${key}" ${canEdit ? '' : 'disabled'}>${options(p)}</select></div><div class="vgm-card-field vgm-card-date"><span class="vgm-card-label">ENVIO</span><strong>${esc(p.dataEnvioVgm || 'Não enviado')}</strong></div><div class="vgm-card-field"><label for="vgm-destination-${key}">ENVIADO PARA</label><input id="vgm-destination-${key}" aria-label="VGM enviado para do booking ${booking}" data-vgm-sent-to="${key}" value="${esc(p.vgmEnviadoPara || '')}" placeholder="Informar" ${canEdit ? '' : 'readonly'}></div><div class="vgm-card-field"><label for="vgm-analyst-${key}">PROCESSO FÍSICO</label><select id="vgm-analyst-${key}" aria-label="Responsável pelo processo físico do booking ${booking}" data-vgm-analyst="${key}" ${canEdit ? '' : 'disabled'}>${analystOptions(p)}</select></div><div class="vgm-card-field vgm-card-deadline"><label for="vgm-schedule-${key}">AGENDAMENTO</label><input id="vgm-schedule-${key}" aria-label="Deadline de agendamento do booking ${booking}" data-vgm-release-schedule="${key}" value="${esc(p.agendamentoLiberacao || '')}" placeholder="dd/mm hh:mm" ${canEdit ? '' : 'readonly'}></div><div class="vgm-card-field vgm-card-deadline"><label for="vgm-deadline-${key}">LIBERAÇÃO</label><input id="vgm-deadline-${key}" aria-label="Deadline de liberação do booking ${booking}" data-vgm-release-deadline="${key}" value="${esc(p.deadlineLiberacao || '')}" placeholder="dd/mm hh:mm" ${canEdit ? '' : 'readonly'}></div></article>`; }).join('')}</div>` : '<div class="empty">Nenhum processo cadastrado.</div>';
        if (canEdit) {
          const vgmBulk = document.createElement('div');
          vgmBulk.className = 'bulk-actions';
          vgmBulk.innerHTML = `<label><input id="vgmSelectAll" type="checkbox"> Selecionar visíveis</label><select id="vgmBulkStatus" aria-label="Status de VGM para os selecionados">${vgmStatuses.map(status => `<option>${esc(status)}</option>`).join('')}</select><button class="btn secondary" id="vgmBulkApply" type="button">Atualizar selecionados</button>`;
          el('vgmList').prepend(vgmBulk);
          el('vgmList').querySelectorAll('.vgm-card').forEach(card => { const id = card.querySelector('[data-vgm-status]')?.dataset.vgmStatus; if (!id) return; const select = document.createElement('label'); select.className = 'bulk-select'; select.innerHTML = `<input type="checkbox" data-vgm-bulk-id="${esc(id)}" aria-label="Selecionar processo">`; card.prepend(select); });
          el('vgmSelectAll').addEventListener('change', event => el('vgmList').querySelectorAll('[data-vgm-bulk-id]').forEach(input => { input.checked = event.target.checked; }));
          el('vgmBulkApply').addEventListener('click', async () => {
            const ids = [...el('vgmList').querySelectorAll('[data-vgm-bulk-id]:checked')].map(input => input.dataset.vgmBulkId);
            if (!ids.length) return toast.warning('Selecione pelo menos um processo.');
            const vgmStatus = el('vgmBulkStatus').value;
            if (!(await confirmAction('Atualizar VGM em lote', `Aplicar “${vgmStatus}” a ${ids.length} processo(s)?`))) return;
            try { const result = await request('/api/processes/bulk/vgm', { method:'PATCH', body:JSON.stringify({ ids, vgmStatus }) }); await refreshData(); renderVgm(); toast.success(`${result.updated} processo(s) atualizado(s).`); } catch (error) { toast.error(error.message); }
          });
          el('vgmList').querySelectorAll('select[data-vgm-status],select[data-vgm-analyst]').forEach(input => input.addEventListener('change', async () => { try { await saveVgmRow(input.dataset.vgmStatus || input.dataset.vgmAnalyst); } catch (error) { toast.error(error.message); renderVgm(); } }));
          el('vgmList').querySelectorAll('[data-vgm-sent-to]').forEach(input => {
            // Salvar a cada tecla reconstruía a tabela e interrompia a
            // digitação. Grave somente quando o usuário concluir o campo.
            input.addEventListener('change', async () => { try { await saveVgmRow(input.dataset.vgmSentTo); } catch (error) { toast.error(error.message); renderVgm(); } });
            input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); input.blur(); } });
          });
          el('vgmList').querySelectorAll('[data-vgm-release-schedule],[data-vgm-release-deadline]').forEach(input => {
            input.addEventListener('input', () => { input.value = formatDateTyping(input.value, true); });
            input.addEventListener('change', async () => { try { await saveVgmRow(input.dataset.vgmReleaseSchedule || input.dataset.vgmReleaseDeadline); } catch (error) { toast.error(error.message); renderVgm(); } });
            input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); input.blur(); } });
          });
        }
      };
      const renderVgmReport = () => {
        const sent = data.filter(p => ['Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT'].includes(p.vgmStatus) && p.dataEnvioVgmOrdenacao);
        const groups = new Map();
        sent.forEach(p => { const key = p.dataEnvioVgmOrdenacao.slice(0, 10); const current = groups.get(key) || { key, name:p.dataEnvioVgm || '—', total:0, processes:[] }; current.total += 1; current.processes.push(p); groups.set(key, current); });
        const days = [...groups.values()].sort((a,b) => b.key.localeCompare(a.key));
        const max = Math.max(...days.map(d => d.total), 1);
        if (selectedVgmReportDay && !groups.has(selectedVgmReportDay)) selectedVgmReportDay = null;
        const selectedDay = selectedVgmReportDay ? groups.get(selectedVgmReportDay) : null;
        el('vgmReportTotal').textContent = sent.length; el('vgmReportDays').textContent = days.length;
        el('vgmDailyChart').innerHTML = days.length ? days.map((d,i) => `<button type="button" class="bar-row vgm-report-day ${selectedVgmReportDay === d.key ? 'active' : ''}" data-vgm-report-day="${esc(d.key)}" aria-pressed="${selectedVgmReportDay === d.key}" aria-label="Ver ${d.total} VGM(s) enviado(s) em ${esc(d.name)}"><span class="bar-rank">${i+1}</span><span class="bar-label">${esc(d.name)}</span><progress class="bar-progress bar-progress--vgm" max="${max}" value="${d.total}" aria-hidden="true"></progress><span class="bar-value">${d.total}</span></button>`).join('') : '<div class="chart-empty">Nenhum VGM enviado com data registrada.</div>';
        el('vgmDailyReport').innerHTML = days.length ? `<table class="report-table vgm-report-table"><thead><tr><th>DATA DO ENVIO</th><th>VGMs ENVIADOS</th></tr></thead><tbody>${days.map(d => `<tr class="${selectedVgmReportDay === d.key ? 'active' : ''}"><td><button type="button" class="vgm-report-day-link" data-vgm-report-day="${esc(d.key)}" aria-pressed="${selectedVgmReportDay === d.key}">${esc(d.name)}</button></td><td>${d.total}</td></tr>`).join('')}</tbody></table>${selectedDay ? `<section class="vgm-day-details" aria-live="polite"><div class="vgm-day-details-head"><div><h3>VGMs enviados em ${esc(selectedDay.name)}</h3><p>${selectedDay.total} processo(s) encontrado(s).</p></div><button type="button" class="btn secondary" id="clearVgmReportDay">Mostrar todos os dias</button></div><div class="table-wrap"><table class="report-table"><thead><tr><th>BOOKING</th><th>EXPORTADOR</th><th>ROTA</th><th>STATUS</th><th>ENVIADO PARA</th></tr></thead><tbody>${selectedDay.processes.map(p => `<tr class="process-status-row ${p.canalLiberacao ? `process-channel-${String(p.canalLiberacao).toLowerCase()}` : ''}"><td><strong>${esc(p.booking || '—')}</strong></td><td>${esc(p.exportador || '—')}</td><td>${esc(route(p))}</td><td>${esc(p.vgmStatus || '—')}</td><td>${esc(p.vgmEnviadoPara || '—')}</td></tr>`).join('')}</tbody></table></div></section>` : ''}` : '';
        // Painel lateral de consulta: datas em cartões e processos do dia em
        // uma lista compacta, evitando a segunda tabela pesada do relatório.
        el('vgmDailyReport').innerHTML = days.length ? `<div class="vgm-report-days" role="list" aria-label="Dias com envio de VGM">${days.map(d => `<button type="button" class="vgm-report-day-card ${selectedVgmReportDay === d.key ? 'active' : ''}" data-vgm-report-day="${esc(d.key)}" aria-pressed="${selectedVgmReportDay === d.key}" aria-label="Ver ${d.total} VGM(s) enviado(s) em ${esc(d.name)}"><span>${esc(d.name)}</span><strong>${d.total}</strong><small>VGM${d.total === 1 ? '' : 's'}</small></button>`).join('')}</div>${selectedDay ? `<section class="vgm-day-details" aria-live="polite"><div class="vgm-day-details-head"><div><h3>VGMs enviados em ${esc(selectedDay.name)}</h3><p>${selectedDay.total} processo(s) encontrado(s).</p></div><button type="button" class="btn secondary" id="clearVgmReportDay">Mostrar todos os dias</button></div><div class="vgm-day-processes" role="list">${selectedDay.processes.map(p => `<article class="vgm-day-process process-status-row ${p.canalLiberacao ? `process-channel-${String(p.canalLiberacao).toLowerCase()}` : ''}" role="listitem"><strong>${esc(p.booking || '—')}</strong><span>${esc(p.exportador || '—')}</span><small>${esc(route(p))} · ${esc(p.vgmStatus || '—')} · ${esc(p.vgmEnviadoPara || 'Destino não informado')}</small></article>`).join('')}</div></section>` : ''}` : '<div class="chart-empty">Nenhum VGM enviado com data registrada.</div>';
        const selectVgmDay = key => { selectedVgmReportDay = key; renderVgmReport(); };
        document.querySelectorAll('[data-vgm-report-day]').forEach(button => button.onclick = () => selectVgmDay(button.dataset.vgmReportDay));
        el('clearVgmReportDay')?.addEventListener('click', () => { selectedVgmReportDay = null; renderVgmReport(); });
      };
      const renderRelease = () => {
        const canEdit = ['admin', 'liberacao'].includes(currentUser?.role); const normalizePort = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); const deadlineOrder = p => { const stored = Date.parse(p.releaseDeadlineOrder || ''); if (Number.isFinite(stored)) return stored; const match = String(p.deadlineLiberacao || '').match(/^(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/); if (!match) return Number.MAX_SAFE_INTEGER; const now = new Date(), date = new Date(now.getFullYear(), Number(match[2])-1, Number(match[1]), Number(match[3]), Number(match[4])); if (date.getTime() < now.getTime() - 36e5*12) date.setFullYear(date.getFullYear()+1); return date.getTime(); }; const filterSelect = el('releaseFilterSelect'); filterSelect.value = releaseFilter; filterSelect.onchange = () => { releaseFilter = filterSelect.value; renderRelease(); }; renderSectionSearch('releaseSearchControls', filterSelect.closest('.field'), releaseSearchFilter, filter => { releaseSearchFilter = filter; renderRelease(); }); let portControls = el('releasePortFilters'); if (!portControls) { portControls = document.createElement('div'); portControls.id = 'releasePortFilters'; portControls.className = 'release-port-filters'; filterSelect.closest('.field').insertAdjacentElement('afterend', portControls); } const standardPorts = ['Imbituba','Itajaí','Itapoá','Navegantes','Paranaguá','Rio Grande','Santos']; const knownPortMap = new Map(); [...standardPorts, ...data.map(p => String(p.origem || '').trim())].forEach(port => { const key=normalizePort(port); if(key&&!knownPortMap.has(key))knownPortMap.set(key,port); }); const knownPorts = [...knownPortMap.values()].sort((a,b) => a.localeCompare(b,'pt-BR',{sensitivity:'base'})); portControls.innerHTML = `<span>Porto de origem:</span><button type="button" class="btn secondary ${releasePortFilter === 'all' ? 'active' : ''}" data-release-port="all" aria-pressed="${releasePortFilter === 'all'}">Todos</button>${knownPorts.map(port => `<button type="button" class="btn secondary ${normalizePort(port) === normalizePort(releasePortFilter) ? 'active' : ''}" data-release-port="${esc(port)}" aria-pressed="${normalizePort(port) === normalizePort(releasePortFilter)}">${esc(port)}</button>`).join('')}`; portControls.querySelectorAll('[data-release-port]').forEach(button => button.onclick = () => { releasePortFilter = button.dataset.releasePort; renderRelease(); }); const releaseProcesses = (releaseFilter === 'released' ? data.filter(p => p.liberacaoStatus === 'Sim') : releaseFilter === 'pending' ? data.filter(p => p.liberacaoStatus !== 'Sim') : data).filter(p => releasePortFilter === 'all' || normalizePort(p.origem) === normalizePort(releasePortFilter)).filter(process => matchesSectionSearch(process, releaseSearchFilter)).slice().sort((a,b) => deadlineOrder(a) - deadlineOrder(b) || String(a.booking || '').localeCompare(String(b.booking || ''),'pt-BR'));
        const options = p => ['Não', 'Sim'].map(status => `<option ${p.liberacaoStatus === status ? 'selected' : ''}>${status}</option>`).join('');
        const channels = p => `<option value="">Selecione</option>${['Laranja','Verde','Vermelho'].map(channel => `<option value="${channel}" ${p.canalLiberacao === channel ? 'selected' : ''}>${channel}</option>`).join('')}`;
        // A liberação é organizada primeiro por porto e, dentro de cada grupo,
        // pelo deadline mais próximo. Isso evita alternar a atenção entre
        // terminais durante a operação.
        const releaseGroups = new Map();
        releaseProcesses.forEach(process => {
          const port = String(process.origem || '').trim() || 'Porto não informado';
          const key = normalizePort(port) || 'sem-porto';
          if (!releaseGroups.has(key)) releaseGroups.set(key, { port, processes:[] });
          releaseGroups.get(key).processes.push(process);
        });
        const releaseRow = p => `<tr class="process-status-row ${p.canalLiberacao ? `process-channel-${String(p.canalLiberacao).toLowerCase()}` : ''}"><td><strong>${esc(p.booking || '—')}</strong></td><td>${esc(p.exportador || '—')}<span class="sub">${esc(p.importador || '')}</span></td><td>${esc(p.origem || '—')}</td><td><input data-release-vessel="${p.id}" value="${esc(p.navio || '')}" ${canEdit ? '' : 'readonly'}></td><td><input data-release-schedule="${p.id}" value="${esc(p.agendamentoLiberacao || '')}" placeholder="dd/mm hh:mm" ${canEdit ? '' : 'readonly'}></td><td><input data-release-deadline="${p.id}" value="${esc(p.deadlineLiberacao || '')}" placeholder="dd/mm hh:mm" ${canEdit ? '' : 'readonly'}></td><td><select data-release-channel="${p.id}" ${canEdit ? '' : 'disabled'}>${channels(p)}</select></td><td><select data-release-status="${p.id}" ${canEdit ? '' : 'disabled'}>${options(p)}</select></td><td><input data-release-date="${p.id}" value="${esc(p.dataLiberacao || '')}" placeholder="dd/mm" ${canEdit ? '' : 'readonly'}></td></tr>`;
        const releaseTable = processes => `<table class="release-table"><thead><tr><th>BOOKING</th><th>EXPORTADOR / IMPORTADOR</th><th>PORTO DE ORIGEM</th><th>NAVIO</th><th>AGENDAMENTO</th><th>DEADLINE DE LIBERAÇÃO</th><th>CANAL</th><th>LIBERADO?</th><th>DATA DE LIBERAÇÃO</th></tr></thead><tbody>${processes.slice().sort((a,b) => deadlineOrder(a) - deadlineOrder(b) || String(a.booking || '').localeCompare(String(b.booking || ''),'pt-BR')).map(releaseRow).join('')}</tbody></table>`;
        el('releaseList').innerHTML = releaseProcesses.length ? `<div class="release-groups" role="list">${[...releaseGroups.values()].sort((a,b) => a.port.localeCompare(b.port,'pt-BR',{sensitivity:'base'})).map(group => `<section class="release-port-group" role="listitem"><header><div><span>PORTO DE ORIGEM</span><h2>${esc(group.port)}</h2></div><strong>${group.processes.length} processo${group.processes.length === 1 ? '' : 's'}</strong></header>${releaseTable(group.processes)}</section>`).join('')}</div>` : '<div class="empty">Nenhum processo cadastrado.</div>';
        const releaseLabels = ['BOOKING','EXPORTADOR / IMPORTADOR','PORTO DE ORIGEM','NAVIO','AGENDAMENTO','DEADLINE DE LIBERAÇÃO','CANAL','LIBERADO?','DATA DE LIBERAÇÃO'];
        el('releaseList').querySelectorAll('tbody tr').forEach(row => row.querySelectorAll('td').forEach((cell, index) => { cell.dataset.label = releaseLabels[index] || ''; }));
        if (canEdit) el('releaseList').querySelectorAll('[data-release-schedule]').forEach(input => input.addEventListener('input', () => { input.value = formatDateTyping(input.value, true); }));
        if (canEdit) el('releaseList').querySelectorAll('[data-release-deadline]').forEach(input => input.addEventListener('input', () => { input.value = formatDateTyping(input.value, true); })); if (canEdit) el('releaseList').querySelectorAll('[data-release-date]').forEach(input => input.addEventListener('input', () => { input.value = formatDateTyping(input.value); }));
        if (canEdit) {
          const releaseBulk = document.createElement('div');
          releaseBulk.className = 'bulk-actions';
          releaseBulk.innerHTML = '<label><input id="releaseSelectAll" type="checkbox"> Selecionar visíveis</label><select id="releaseBulkStatus" aria-label="Status de liberação para os selecionados"><option value="Sim">Liberado</option><option value="Não">Não liberado</option></select><button class="btn secondary" id="releaseBulkApply" type="button">Atualizar selecionados</button>';
          el('releaseList').prepend(releaseBulk);
          el('releaseList').querySelectorAll('tbody tr').forEach(row => { const id = row.querySelector('[data-release-status]')?.dataset.releaseStatus; if (!id) return; const cell = document.createElement('td'); cell.className = 'bulk-cell'; cell.dataset.label = 'SELECIONAR'; cell.innerHTML = `<input type="checkbox" data-release-bulk-id="${esc(id)}" aria-label="Selecionar processo">`; row.prepend(cell); });
          el('releaseSelectAll').addEventListener('change', event => el('releaseList').querySelectorAll('[data-release-bulk-id]').forEach(input => { input.checked = event.target.checked; }));
          el('releaseBulkApply').addEventListener('click', async () => {
            const ids = [...el('releaseList').querySelectorAll('[data-release-bulk-id]:checked')].map(input => input.dataset.releaseBulkId);
            if (!ids.length) return toast.warning('Selecione pelo menos um processo.');
            const releaseStatus = el('releaseBulkStatus').value;
            if (!(await confirmAction('Atualizar liberação em lote', `Aplicar o status selecionado a ${ids.length} processo(s)?`))) return;
            try { const result = await request('/api/processes/bulk/release', { method:'PATCH', body:JSON.stringify({ ids, releaseStatus }) }); await refreshData(); renderRelease(); toast.success(`${result.updated} processo(s) atualizado(s).`); } catch (error) { toast.error(error.message); }
          });
          el('releaseList').querySelectorAll('select[data-release-status],select[data-release-channel]').forEach(input => input.addEventListener('change', async () => { try { await saveReleaseRow(input.dataset.releaseStatus || input.dataset.releaseChannel); } catch (error) { toast.error(error.message); renderRelease(); } }));
          el('releaseList').querySelectorAll('input[data-release-vessel],input[data-release-schedule],input[data-release-deadline],input[data-release-date]').forEach(input => input.addEventListener('input', () => {
            const id = input.dataset.releaseVessel || input.dataset.releaseSchedule || input.dataset.releaseDeadline || input.dataset.releaseDate;
            const schedule = el('releaseList').querySelector(`[data-release-schedule="${id}"]`)?.value;
            const deadline = el('releaseList').querySelector(`[data-release-deadline="${id}"]`)?.value; const releaseDate = el('releaseList').querySelector(`[data-release-date="${id}"]`)?.value;
            if ((schedule && !dateForDatabase(schedule, true)) || (deadline && !dateForDatabase(deadline, true)) || (releaseDate && !dateForDatabase(releaseDate))) return;
            scheduleAutoSave(`release-${id}`, () => saveReleaseRow(id));
          }));
        }
      };
      const renderFollowup = () => {
        renderSectionSearch('followupSearchControls', document.querySelector('#followupPage .intro'), followupSearchFilter, filter => { followupSearchFilter = filter; renderFollowup(); }); const followupProcesses = data.filter(process => matchesSectionSearch(process, followupSearchFilter));
        el('followupPdfList').innerHTML = followupProcesses.length ? `<div class="followup-board" role="list">${followupProcesses.map(p => `<article class="followup-card process-status-row ${p.canalLiberacao ? `process-channel-${String(p.canalLiberacao).toLowerCase()}` : ''}" role="listitem"><div class="followup-card__process"><span>BOOKING</span><strong>${esc(p.booking || '—')}</strong><small>${esc(p.fatura || 'Sem fatura')}</small></div><div class="followup-card__party"><span>EXPORTADOR</span><strong>${esc(p.exportador || '—')}</strong><small>${esc(p.importador || 'Importador não informado')}</small></div><div class="followup-card__meta"><span>NAVIO</span><strong>${esc(p.navio || '—')}</strong></div><div class="followup-card__meta"><span>ANALISTA</span><strong>${esc(p.analista || '—')}</strong></div><div class="followup-card__actions"><button class="btn secondary followup-history" data-followup-history="${p.id}" aria-label="Ver histórico do booking ${esc(p.booking || 'sem booking')}">Histórico</button><button class="btn secondary followup-pdf" data-followup-pdf="${p.id}" aria-label="Gerar PDF do histórico do booking ${esc(p.booking || 'sem booking')}">PDF</button></div></article>`).join('')}</div>` : '<div class="empty">Nenhum processo encontrado.</div>';
      };
      const historyLabel = item => {
        let details = item.details || {}; try { details = typeof details === 'string' ? JSON.parse(details) : details; } catch { details = {}; }
        if (item.action === 'process.created') return 'Processo lançado';
        if (item.action === 'process.updated') return 'Processo alterado';
        if (item.action === 'process.vgm_updated') return ['Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT'].includes(details.vgmStatus) ? 'VGM enviado' : 'VGM atualizado';
        if (item.action === 'process.release_updated') return details.releaseStatus === 'Sim' ? 'Processo liberado' : 'Liberação atualizada';
        if (item.action === 'process.followup_updated') return 'Follow up atualizado';
        return 'Processo atualizado';
      };
      const historyDateTime = value => {
        const date = new Date(value); if (Number.isNaN(date.getTime())) return '—';
        return `${date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})} ${date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
      };
      const historyDetails = item => {
        let details = item.details || {}; try { details = typeof details === 'string' ? JSON.parse(details) : details; } catch { details = {}; }
        if (item.action === 'process.created') return 'Processo cadastrado no sistema.';
        if (item.action === 'process.updated') {
          const labels={process_number:'Número técnico',display_process_number:'Número do processo',status:'Status',client_id:'Exportador',importer:'Importador',invoice:'Fatura',booking:'Booking',due_number:'DUE',due_issue_date:'Data de emissão da DUE',ruc_number:'RUC',origin_port:'Porto de origem',destination_port:'Porto de destino',vessel:'Navio',agency:'Agência',carrier:'Armador',deadline:'Deadline de draft',shipping_date:'Data de envio do draft',container_collection_date:'Data da coleta',collection_terminal:'Terminal da coleta',free_time_days:'Free time',incoterm:'Incoterm',shipment_type:'Tipo de embarque',bl_type:'Tipo de BL',freight_type:'Tipo de frete',mapa_inspection:'MAPA',isf_lacey:'ISF/LACEY',container_quantity:'Quantidade de contêineres',container_type:'Tipo de contêiner',container_details:'Dados dos contêineres',cubic_meters:'M³',net_weight_kg:'Peso líquido',gross_weight_kg:'Peso bruto',packages_quantity:'Quantidade de pacotes',cargo_value:'Valor da carga',currency:'Moeda'};
          const dateFields=new Set(['due_issue_date','deadline','shipping_date','container_collection_date']);
          const parseJson=value=>{if(typeof value!=='string')return value;const text=value.trim();if(!text||!['[','{'].includes(text[0]))return value;try{return JSON.parse(text)}catch{return value}};
          const containers=value=>{const list=parseJson(value);if(!Array.isArray(list))return 'Dados atualizados';if(!list.length)return 'Nenhum contêiner';const visible=list.slice(0,4).map((container,index)=>{const parts=[container.number||`Contêiner ${index+1}`];if(container.tare!==undefined&&container.tare!=='')parts.push(`tara ${container.tare} kg`);if(container.seal)parts.push(`lacre ${container.seal}`);if(container.invoice_number||container.invoiceNumber)parts.push(`NF ${container.invoice_number||container.invoiceNumber}`);if(container.new_seal)parts.push(`novo lacre ${container.new_seal}`);return parts.join(', ')});if(list.length>visible.length)visible.push(`mais ${list.length-visible.length} contêiner(es)`);return visible.join(' | ')};
          const display=(field,value)=>{if(value===null||value===undefined||value==='')return '—';if(field==='client_id')return clients.find(client=>client.id===value)?.nome||'Exportador alterado';if(field==='container_details')return containers(value);if(dateFields.has(field))return dateForField(value)||'—';if(['mapa_inspection','isf_lacey'].includes(field)&&typeof value==='boolean')return value?'Sim':'Não';const parsed=parseJson(value);if(typeof parsed==='object')return 'Dados atualizados';return String(parsed).slice(0,120)};
          const changes=details.changes&&typeof details.changes==='object'?Object.entries(details.changes):[];
          if(!changes.length)return 'Dados do processo foram alterados.';
          const readable=changes.map(([field,value])=>({label:labels[field]||'Campo do processo',before:display(field,value?.before),after:display(field,value?.after)})).filter(change=>change.before!==change.after);
          if(!readable.length)return 'Registro técnico sem alteração visível nos dados do processo.';
          const visible=readable.slice(0,8).map(change=>`${change.label}: ${change.before} → ${change.after}`);
          if(readable.length>visible.length)visible.push(`Outros ${readable.length-visible.length} campo(s) também foram alterados.`);
          return visible.join('\n');
        }
        if (item.action === 'process.vgm_updated') return [details.vgmStatus && `Status VGM: ${details.vgmStatus}`, details.vgmSentTo && `Enviado para: ${details.vgmSentTo}`, details.physicalProcessAnalyst && `Processo físico com: ${details.physicalProcessAnalyst}`].filter(Boolean).join(' · ') || 'Controle de VGM atualizado.';
        if (item.action === 'process.release_updated') return [details.releaseStatus && `Status: ${details.releaseStatus}`, details.releaseChannel && `Canal: ${details.releaseChannel}`, details.vessel && `Navio: ${details.vessel}`, details.releaseSchedule && `Agendamento: ${dateForField(details.releaseSchedule,true)}`, details.releaseDeadline && `Deadline: ${dateForField(details.releaseDeadline,true)}`].filter(Boolean).join(' · ') || 'Controle de liberação atualizado.';
        if (item.action === 'process.followup_updated') return [details.followupStatus && `Status: ${details.followupStatus}`, details.followupNote && `Observação: ${details.followupNote}`].filter(Boolean).join(' · ') || 'Follow up atualizado.';
        return 'Alteração registrada no processo.';
      };
      const showFollowupHistory = async process => {
        const events = await request(`/api/processes/${process.id}/followup-history`);
        let modal = el('processHistoryDialog');
        if (!modal) {
          modal = document.createElement('dialog'); modal.id='processHistoryDialog'; modal.className='process-history-dialog';
          modal.innerHTML='<div class="modal-head"><div><p class="eyebrow">Acompanhamento</p><h2>Histórico do processo</h2></div><button class="close" type="button" aria-label="Fechar histórico">×</button></div><p class="intro" id="processHistoryIntro"></p><ol id="processHistoryTimeline" class="history-timeline"></ol>';
          document.body.appendChild(modal); modal.querySelector('.close').onclick=()=>modal.close();
        }
        el('processHistoryIntro').textContent=`BOOKING ${process.booking || '—'} · ${process.exportador || 'Exportador não informado'}`;
        const timeline=el('processHistoryTimeline'); timeline.replaceChildren(...events.map(item => { const row=document.createElement('li'); const head=document.createElement('strong'); const meta=document.createElement('span'); const details=document.createElement('p'); head.textContent=historyLabel(item); meta.textContent=`${historyDateTime(item.created_at)} · ${item.username || 'Usuário não identificado'}`; details.textContent=historyDetails(item); row.append(head,meta,details); return row; }));
        if (!events.length) timeline.innerHTML='<li><strong>Nenhuma alteração registrada.</strong></li>';
        modal.showModal();
      };
      const printFollowupPdf = async process => {
        const events = await request(`/api/processes/${process.id}/followup-history`);
        const rows = events.length ? events.map(item => {const date=esc(historyDateTime(item.created_at)).replace(' ','<br>');const details=esc(historyDetails(item)).replace(/\n/g,'<br>');return `<tr><td>${date}</td><td>${esc(historyLabel(item))}</td><td>${details}</td><td>${esc(item.username || '—')}</td></tr>`}).join('') : '<tr><td colspan="4">Nenhuma alteração registrada.</td></tr>';
        const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Histórico ${esc(process.booking || '')}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#111;margin:0}h1{font-size:21px;margin:0 0 6px}p{margin:4px 0;color:#444;font-size:12px}.head{border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.5px}th{text-align:left;background:#e9edf2;padding:8px;border:1px solid #aaa}td{padding:8px;border:1px solid #bbb;vertical-align:top;line-height:1.4;overflow-wrap:anywhere}th:nth-child(1){width:13%}th:nth-child(2){width:14%}th:nth-child(3){width:61%}th:nth-child(4){width:12%}.footer{margin-top:16px;color:#555;font-size:9px}</style></head><body><div class="head"><h1>Histórico do processo</h1><p><strong>Booking:</strong> ${esc(process.booking || '—')}</p><p><strong>Exportador:</strong> ${esc(process.exportador || '—')} &nbsp; | &nbsp; <strong>Importador:</strong> ${esc(process.importador || '—')}</p><p><strong>Navio:</strong> ${esc(process.navio || '—')} &nbsp; | &nbsp; <strong>Analista:</strong> ${esc(process.analista || '—')}</p></div><table><thead><tr><th>DATA E HORA</th><th>ALTERAÇÃO</th><th>O QUE FOI ALTERADO</th><th>USUÁRIO</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">Documento gerado em ${new Date().toLocaleString('pt-BR')}</div></body></html>`;
        el('previewTitle').textContent = 'Histórico do processo';
        el('pdfFrame').srcdoc = securePrintHtml(html); el('previewDialog').showModal();
      };
      const renderFinancial = () => {
        el('financialList').innerHTML = data.length ? `<table class="data-table"><thead><tr><th>BOOKING</th><th>EXPORTADOR</th><th>FATURA</th><th>VALOR</th><th>MOEDA</th><th>STATUS</th></tr></thead><tbody>${data.map(p => `<tr class="${p.canalLiberacao ? `process-channel-${String(p.canalLiberacao).toLowerCase()}` : ''}"><td><strong>${esc(p.booking || '—')}</strong></td><td>${esc(p.exportador || '—')}</td><td>${esc(p.fatura || '—')}</td><td>${esc(money(p))}</td><td>${esc(p.moeda || 'USD')}</td><td>${esc(p.status || '—')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhum processo cadastrado.</div>';
      };
      const requireSessionLogin = () => {
        if (sessionRecoveryRequired) return;
        sessionRecoveryRequired = true;
        currentUser = null;
        realtimeSource?.close(); realtimeSource = null;
        const message = 'Sua sessão expirou. Entre novamente para continuar; os dados preenchidos foram mantidos.';
        el('loginError').textContent = message;
        el('loginError').hidden = false;
        if (!el('loginDialog').open) el('loginDialog').showModal();
        toast.warning('Sessão expirada. Entre novamente para continuar sem perder o formulário.');
      };
      const request = async (url, options = {}) => {
        const response = await fetch(url, {
          ...options,
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', ...(['POST','PATCH','DELETE'].includes(options.method || 'GET') ? { 'X-CSRF-Token': csrfToken() } : {}), ...(options.headers || {}) }
        });
        const body = response.status === 204 ? null : await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(body.error || 'Não foi possível concluir a operação.');
          error.status = response.status;
          if (response.status === 401 && currentUser && !String(url).startsWith('/api/auth/')) requireSessionLogin();
          throw error;
        }
        return body;
      };
      const ensureSessionActive = async ({ force = false } = {}) => {
        if (!currentUser) return false;
        if (!force && Date.now() - lastSessionCheckAt < sessionCheckIntervalMs) return true;
        if (sessionCheckPromise) return sessionCheckPromise;
        sessionCheckPromise = request('/api/me')
          .then(result => {
            currentUser = result.user;
            lastSessionCheckAt = Date.now();
            sessionRecoveryRequired = false;
            return true;
          })
          .catch(error => {
            // Uma falha momentânea de rede não apaga a sessão local nem o
            // formulário. Somente um 401 confirmado solicita novo login.
            if (error.status !== 401) return true;
            return false;
          })
          .finally(() => { sessionCheckPromise = null; });
        return sessionCheckPromise;
      };
      const value = (v) => v === null || v === undefined ? '' : v;
      const containerParts = (v) => String(v || '').split('/').map(x => x.trim()).filter(Boolean);
      const dateTimeInput = value => value ? String(value).replace('Z', '').slice(0, 16) : '';
      const dateForField = (value, withTime = false) => {
        if (!value) return '';
        const raw = String(value).trim();
        // Valores que já vieram do formulário (dd/mm ou dd/mm hh:mm) não
        // devem passar novamente pela conversão do banco, pois isso os apagava
        // ao reabrir um processo para edição.
        if (/^\d{1,2}\/\d{1,2}(?:\s+\d{1,2}:\d{2})?$/.test(raw)) return raw;
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
        if (!match) return '';
        return `${match[3]}/${match[2]}${withTime && match[4] ? ` ${match[4]}:${match[5]}` : ''}`;
      };
      const dateForDatabase = (value, withTime = false) => {
        const raw = String(value || '').trim(); if (!raw) return null;
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return withTime ? raw.slice(0, 16) : raw.slice(0, 10);
        const match = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
        if (!match || (withTime && (!match[3] || Number(match[3]) > 23 || Number(match[4]) > 59))) return null;
        const year = new Date().getFullYear(), day = match[1].padStart(2, '0'), month = match[2].padStart(2, '0');
        const date = new Date(`${year}-${month}-${day}T12:00`);
        if (Number.isNaN(date.getTime()) || date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day)) return null;
        return withTime ? `${year}-${month}-${day}T${match[3].padStart(2, '0')}:${match[4]}` : `${year}-${month}-${day}`;
      };
      // Datas são digitadas somente com números: 2307 vira 23/07.
      const formatDateTyping = (value, withTime = false) => {
        const digits = String(value || '').replace(/\D/g, '').slice(0, withTime ? 8 : 4);
        if (digits.length <= 2) return digits;
        const date = `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
        if (!withTime || digits.length <= 4) return date;
        const hours = digits.slice(4, 6);
        return digits.length <= 6 ? `${date} ${hours}` : `${date} ${hours}:${digits.slice(6, 8)}`;
      };
      const attachDateMask = (fieldName, withTime = false) => {
        const input = form.elements[fieldName];
        if (!input) return;
        input.addEventListener('input', () => { input.value = formatDateTyping(input.value, withTime); });
      };
      attachDateMask('prazo', true);
      attachDateMask('envio');
      attachDateMask('coleta');
      attachDateMask('dueEmissao');
      const decimalForDatabase = (value, label) => {
        const raw = String(value || '').trim();
        if (!raw) return null;
        if (!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,3})?$/.test(raw)) throw new Error(`${label} deve usar ponto para milhar, vírgula e no máximo 3 casas decimais. Ex.: 1.000,125.`);
        return Number(raw.replaceAll('.', '').replace(',', '.'));
      };
      const toViewClient = c => ({ id: c.id, nome: c.name, cnpj: c.tax_id, contato: c.contact, telefone: c.phone, email: c.email, pais: c.country, endereco: c.address, rucManual: c.ruc_manual === true, dueOnly: c.due_only === true, ovacao: c.ovacao === true, active: c.active !== false });
      const dueOnlyClientControl = (() => {
        const label = document.createElement('label');
        label.className = 'check-row';
        label.htmlFor = 'clientDueOnly';
        label.innerHTML = '<input id="clientDueOnly" name="dueOnly" type="checkbox" class="control-auto-width"> Apenas DU-E';
        el('clientForm').querySelector('input[name="rucManual"]').closest('label').insertAdjacentElement('afterend', label);
        return label.querySelector('input');
      })();
      // Em lançamentos "Apenas DU-E", origem e destino continuam visíveis e
      // obrigatórios. Somente os demais campos operacionais são simplificados.
      const dueOnlyFieldNames = ['importador', 'ruc', 'tipoEmbarque', 'armador', 'agencia', 'prazo', 'envio', 'coleta', 'terminal', 'freetime', 'incoterm', 'tipoBL', 'tipoFrete', 'vistoriaMapa', 'isfLacey', 'metragem', 'pesoLiquido', 'pesoBruto', 'volumes', 'valor', 'moeda'];
      const syncDueOnlyLaunchFields = () => {
        const selected = clients.find(c => c.id === form.elements.exportador.value);
        const dueOnly = selected?.dueOnly === true;
        form.dataset.dueOnly = dueOnly ? 'true' : 'false';
        dueOnlyFieldNames.forEach(name => {
          const input = form.elements[name], field = input?.closest('.field');
          if (!input || !field) return;
          input.dataset.defaultRequired ??= String(input.required);
          field.hidden = dueOnly;
          input.required = dueOnly ? false : input.dataset.defaultRequired === 'true';
        });
        ['qtdContainers', 'tipoContainer'].forEach(name => {
          const input = form.elements[name], field = input?.closest('.field');
          if (!input || !field) return;
          input.dataset.defaultRequired ??= String(input.required);
          field.hidden = dueOnly;
          input.required = dueOnly ? false : input.dataset.defaultRequired === 'true';
        });
        const sectionTitles = [...form.querySelectorAll('.section-title')];
        if (sectionTitles[2]) sectionTitles[2].hidden = dueOnly;
        if (dueOnly) {
          form.elements.tipoEmbarque.value = 'FCL';
          form.elements.qtdContainers.value = '1';
          form.elements.tipoContainer.value = 'NÃO INFORMADO';
          syncShipmentType();
          renderContainerDetails(1);
        }
      };
      dueOnlyClientControl.addEventListener('change', () => { if (dueOnlyClientControl.checked) el('clientForm').elements.rucManual.checked = false; });
      el('clientForm').elements.rucManual.addEventListener('change', () => { if (el('clientForm').elements.rucManual.checked) dueOnlyClientControl.checked = false; });
      form.elements.exportador.addEventListener('change', syncDueOnlyLaunchFields);
      const toViewProcess = p => {
        let details = p.container_details;
        try { details = typeof details === 'string' ? JSON.parse(details) : details; } catch { details = []; }
        const decimalForInput = value => { if (value === null || value === undefined || value === '') return ''; const raw = String(value); const number = Number(raw.includes(',') ? raw.replaceAll('.', '').replace(',', '.') : raw); return Number.isFinite(number) ? number.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : ''; };
        const integerForInput = value => { if (value === null || value === undefined || value === '') return ''; return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); };
        const numbers = Array.isArray(details) ? details.map(x => x.number).filter(Boolean).join(' / ') : '';
        const taras = Array.isArray(details) ? details.map(x => integerForInput(x.tare)).filter(Boolean).join(' / ') : '';
        const seals = Array.isArray(details) ? details.map(x => x.seal).filter(Boolean).join(' / ') : '';
        const newSeals = Array.isArray(details) ? details.map(x => x.new_seal).filter(Boolean).join(' / ') : '';
        const notes = Array.isArray(details) ? details.map(x => x.invoice_number).filter(Boolean).join(' / ') : '';
        return { id:p.id, numero:p.process_number, numeroProcesso:p.display_process_number || '', status:p.status, clientId:p.client_id, exportador:p.exporter, ovacao:p.client_ovacao === true, importador:p.importer, fatura:p.invoice, booking:p.booking, due:p.due_number, dueEmissao:dateForField(p.due_issue_date), ruc:p.ruc_number, origem:p.origin_port, destino:p.destination_port, navio:p.vessel, agencia:p.agency, armador:p.carrier, tipoEmbarque:p.shipment_type || '', tipoBL:p.bl_type, tipoFrete:p.freight_type, vistoriaMapa:p.mapa_inspection ? 'Sim' : 'Não', isfLacey:p.isf_lacey ? 'Sim' : 'Não', vgmStatus:p.vgm_status || 'Não', vgmEnviadoPara:p.vgm_sent_to || '', dataEnvioVgm:dateForField(p.vgm_sent_date), dataEnvioVgmOrdenacao:p.vgm_sent_date || '', liberacaoStatus:p.release_status || 'Não', canalLiberacao:p.release_channel || '', dataLiberacao:dateForField(p.release_date), agendamentoLiberacao:dateForField(p.release_schedule, true), deadlineLiberacao:dateForField(p.release_deadline, true), followupStatus:p.followup_status || 'Pendente', followupNote:p.followup_note || '', analistaFisico:p.physical_process_analyst || '', prazo:dateForField(p.deadline, true), envio:p.shipping_date, coleta:p.container_collection_date, terminal:p.collection_terminal, freetime:p.free_time_days, incoterm:p.incoterm, qtdContainers:p.container_quantity, tipoContainer:p.container_type, containers:numbers, tara:taras, lacre:seals, lacreNovo:newSeals, notasFiscais:notes, metragem:decimalForInput(p.cubic_meters), pesoLiquido:decimalForInput(p.net_weight_kg), pesoBruto:decimalForInput(p.gross_weight_kg), volumes:p.packages_quantity, valor:p.cargo_value, moeda:p.currency || 'USD', analista:p.analyst };
      };
      const toApiProcess = p => {
        const client = clients.find(c => c.id === p.exportador);
        const numbers = containerParts(p.containers), taras = containerParts(p.tara), seals = containerParts(p.lacre), notes = containerParts(p.notasFiscais), newSeals = containerParts(p.lacreNovo);
        const deadline = dateForDatabase(p.prazo, true), shippingDate = dateForDatabase(p.envio), containerCollectionDate = dateForDatabase(p.coleta), dueIssueDate = dateForDatabase(p.dueEmissao);
        const rucManual = client?.rucManual === true, dueOnly = client?.dueOnly === true;
        if (!dueOnly && !deadline) throw new Error('Informe o deadline de draft no formato dd/mm hh:mm.');
        if (!dueOnly && p.envio && !shippingDate) throw new Error('Informe a data de envio no formato dd/mm.');
        if (!dueOnly && p.coleta && !containerCollectionDate) throw new Error('Informe a data de coleta no formato dd/mm.');
        if (!rucManual && !String(p.due || '').trim()) throw new Error('Informe a DU-E ou marque RUC manual no cadastro do exportador.');
        if (!dueOnly && !rucManual && !dueIssueDate) throw new Error('Informe a data de emissão da DU-E no formato dd/mm.');
        if (p.dueEmissao && !dueIssueDate) throw new Error('Informe a data de emissão da DU-E no formato dd/mm.');
        return { processId:p.id || null, processNumber:p.numero || p.booking || `SEM-BOOKING-${Date.now()}`, displayProcessNumber:p.numeroProcesso || null, status:p.status, clientId:client?.id, importer:p.importador, invoice:p.fatura, booking:p.booking, dueNumber:p.due, dueIssueDate, rucNumber:p.ruc, originPort:p.origem, destinationPort:p.destino, vessel:p.navio, agency:p.agencia, carrier:p.armador, shipmentType:dueOnly ? 'FCL' : p.tipoEmbarque, blType:p.tipoBL, freightType:p.tipoFrete, mapaInspection:dueOnly ? false : p.vistoriaMapa === 'Sim', isfLacey:dueOnly ? false : p.isfLacey === 'Sim', deadline:dueOnly ? null : deadline, shippingDate:dueOnly ? null : shippingDate, containerCollectionDate:dueOnly ? null : containerCollectionDate, collectionTerminal:p.terminal, freeTimeDays:dueOnly ? null : (p.freetime === '' ? null : Number(p.freetime)), incoterm:dueOnly ? '' : p.incoterm, containerQuantity:dueOnly ? Math.max(1, numbers.length) : (p.qtdContainers === '' ? null : Number(p.qtdContainers)), containerType:dueOnly ? 'NÃO INFORMADO' : p.tipoContainer, containerDetails:numbers.map((number, i) => ({ number, tare:taras[i] || '', seal:seals[i] || '', invoiceNumber:notes[i] || '', new_seal:newSeals[i] || '' })), cubicMeters:dueOnly ? null : decimalForDatabase(p.metragem, 'A metragem cúbica'), netWeightKg:dueOnly ? null : decimalForDatabase(p.pesoLiquido, 'O peso líquido'), grossWeightKg:dueOnly ? null : decimalForDatabase(p.pesoBruto, 'O peso bruto'), packagesQuantity:dueOnly ? null : (p.volumes === '' ? null : Number(p.volumes)), cargoValue:dueOnly ? null : currencyForDatabase(p.valor), currency:dueOnly ? 'USD' : (p.moeda || 'USD') };
      };
      // O banco normaliza o porto de origem para maiúsculas. Como as opções
      // visíveis preservam acentos e capitalização, atribuir o texto direto ao
      // <select> pode não encontrar uma opção e deixá-lo em branco na edição.
      // A comparação abaixo ignora maiúsculas e acentos, sem alterar o valor
      // originalmente armazenado para processos antigos.
      const normalizedPort = value => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLocaleUpperCase('pt-BR');
      const restoreOriginPort = value => {
        const originSelect = form.elements.origem;
        const origin = String(value || '').trim();
        if (!originSelect || !origin) return;
        const option = [...originSelect.options].find(item => normalizedPort(item.value || item.textContent) === normalizedPort(origin));
        if (option) {
          originSelect.value = option.value;
          return;
        }
        // Preserva também portos cadastrados em versões anteriores que não
        // estejam na lista padrão, evitando apagar o dado ao editar e salvar.
        const legacyOption = new Option(origin, origin, false, true);
        originSelect.add(legacyOption);
      };
      const resetNewProcessContainerState = () => {
        // Inputs hidden usam o valor atual como valor padrão em alguns
        // navegadores. Por isso form.reset() sozinho pode restaurar os dados do
        // último processo editado. Zere valor e defaultValue antes de gerar as
        // linhas do novo lançamento.
        for (const name of ['qtdContainers', 'tipoContainer', 'containers', 'tara', 'lacre', 'lacreNovo', 'notasFiscais']) {
          const input = form.elements[name];
          if (!input) continue;
          input.value = '';
          if (input.type === 'hidden') input.defaultValue = '';
        }
        el('containerDetails').replaceChildren();
      };
      const nativeOpenProcess = open;
      open = p => {
        // Os campos dos contêineres são gerados dinamicamente. Limpe a tela
        // anterior antes de preencher o processo atual, evitando que valores
        // antigos apareçam mesmo quando o banco já possui os dados corretos.
        el('containerDetails').innerHTML = '';
        nativeOpenProcess(p);
        // A capa só pode ser emitida a partir de um processo persistido. O
        // lançamento novo deve ser salvo antes de disponibilizar esta ação.
        el('printBtn').hidden = !p;
        el('processWorkspaceBtn').hidden = !p;
        newProcessIdempotencyKey = p ? null : crypto.randomUUID();
        if (!p) {
          // Não reutilize nenhum identificador do último processo salvo. O
          // reset do navegador não é suficiente em todos os fluxos de modal,
          // pois campos hidden podem manter o valor alterado por JavaScript.
          // Sem essa limpeza um lançamento novo poderia virar um PATCH e
          // sobrescrever o processo aberto anteriormente.
          editingProcessId = null;
          form.elements.id.value = '';
          form.elements.createdAt.value = '';
          form.elements.numeroProcesso.value = '';
          delete form.dataset.prelaunchId;
          resetNewProcessContainerState();
        } else {
          restoreOriginPort(p.origem);
        }
        syncDueOnlyLaunchFields();
        if (!p) {
          form.dispatchEvent(new Event('gport:review-update'));
          form.dispatchEvent(new CustomEvent('gport:process-form-opened', { detail:{ mode:'create' } }));
          return;
        }
        form.elements.id.value = p.id;
        form.elements.exportador.value = p.clientId || clients.find(client => client.nome === p.exportador)?.id || '';
        renderClientOptions();
        form.elements.exportador.value = p.clientId || clients.find(client => client.nome === p.exportador)?.id || '';
        form.elements.prazo.value = dateForField(p.prazo, true);
        form.elements.envio.value = dateForField(p.envio);
        form.elements.coleta.value = dateForField(p.coleta);
        syncDueOnlyLaunchFields();
        form.dispatchEvent(new Event('gport:review-update'));
        form.dispatchEvent(new CustomEvent('gport:process-form-opened', { detail:{ mode:'edit' } }));
      };
      // Calendário operacional: consulta somente o intervalo exibido e não
      // interfere na lista principal nem nos filtros que o usuário já aplicou.
      const isoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const calendarEventLabel = (process, field) => ({ deadline:'Draft', container_collection_date:'Coleta', release_schedule:'Agendamento', release_deadline:'Liberação' }[field] || 'Prazo');
      const calendarDateLabel = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) : '';
      const renderCalendar = async () => {
        const month = el('calendarMonth').value;
        if (!/^\d{4}-\d{2}$/.test(month)) return;
        const [year, monthNumber] = month.split('-').map(Number);
        const from = new Date(year, monthNumber - 1, 1), to = new Date(year, monthNumber, 0);
        el('calendarSummary').textContent = 'Carregando prazos…'; el('calendarGrid').innerHTML = '';
        try {
          const calendar = await request(`/api/calendar?from=${isoDate(from)}&to=${isoDate(to)}`);
          // Durante uma atualização, o navegador pode receber o JavaScript
          // novo antes de o servidor responder no formato novo. Aceite a
          // lista legada também para que o calendário nunca deixe de abrir.
          const rows = Array.isArray(calendar) ? calendar : (calendar.processes || []);
          const prelaunches = Array.isArray(calendar) ? [] : (calendar.prelaunches || []);
          const events = new Map();
          rows.forEach(process => ['deadline', 'container_collection_date', 'release_schedule', 'release_deadline'].forEach(field => {
            const key = String(process[field] || '').slice(0, 10);
            if (key >= isoDate(from) && key <= isoDate(to)) (events.get(key) || (events.set(key, []), events.get(key))).push({ process, label:calendarEventLabel(process, field), type:'process' });
          }));
          prelaunches.forEach(prelaunch => {
            const key = String(prelaunch.deadline || '').slice(0, 10);
            if (key >= isoDate(from) && key <= isoDate(to)) (events.get(key) || (events.set(key, []), events.get(key))).push({ process:prelaunch, label:'Pré-lançamento', type:'prelaunch' });
          });
          const firstWeekday = (from.getDay() + 6) % 7;
          const days = Array.from({ length:firstWeekday }, () => '<div class="calendar-day is-empty" aria-hidden="true"></div>');
          for (let day = 1; day <= to.getDate(); day += 1) {
            const key = `${month}-${String(day).padStart(2, '0')}`, dayEvents = events.get(key) || [];
            days.push(`<article class="calendar-day ${dayEvents.length ? 'has-events' : ''}"><strong>${day}</strong><div>${dayEvents.slice(0, 4).map(({ process, label, type }) => `<button type="button" class="calendar-event ${type === 'prelaunch' ? 'is-prelaunch' : ''}" data-calendar-${type}="${esc(process.id)}" title="${esc(`${label}: ${process.booking || 'Sem booking'}`)}"><span>${esc(label)}</span>${esc(process.booking || '—')}</button>`).join('')}${dayEvents.length > 4 ? `<small>+${dayEvents.length - 4} prazos</small>` : ''}</div></article>`);
          }
          el('calendarGrid').innerHTML = '<div class="calendar-weekdays"><span>SEG</span><span>TER</span><span>QUA</span><span>QUI</span><span>SEX</span><span>SÁB</span><span>DOM</span></div><div class="calendar-days">' + days.join('') + '</div>';
          el('calendarSummary').textContent = `${rows.length} processo(s) e ${prelaunches.length} pré-lançamento(s) na sua agenda em ${from.toLocaleDateString('pt-BR', { month:'long', year:'numeric' })}.`;
          el('calendarGrid').querySelectorAll('[data-calendar-process]').forEach(button => button.onclick = async () => {
            const process = data.find(item => item.id === button.dataset.calendarProcess);
            if (process) { el('calendarDialog').close(); open(process); return; }
            try { const item = toViewProcess(await request(`/api/processes/${button.dataset.calendarProcess}`)); el('calendarDialog').close(); open(item); } catch (error) { toast.error(error.message); }
          });
          el('calendarGrid').querySelectorAll('[data-calendar-prelaunch]').forEach(button => button.onclick = () => {
            const prelaunch = prelaunches.find(item => item.id === button.dataset.calendarPrelaunch);
            if (!prelaunch) return;
            el('calendarDialog').close(); open(null);
            form.elements.exportador.value = prelaunch.client_id;
            renderClientOptions(); form.elements.exportador.value = prelaunch.client_id;
            form.elements.booking.value = prelaunch.booking || '';
            form.elements.prazo.value = dateForField(prelaunch.deadline, true);
            syncDueOnlyLaunchFields(); form.dispatchEvent(new Event('gport:review-update'));
            form.dataset.prelaunchId = prelaunch.id;
            toast.info('Pré-lançamento carregado. Complete e salve o processo para finalizá-lo.');
          });
        } catch (error) { el('calendarSummary').textContent = 'Não foi possível carregar o calendário agora.'; toast.error(error.message); }
      };
      const openCalendar = () => { const now = new Date(); if (!el('calendarMonth').value) el('calendarMonth').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; el('calendarDialog').showModal(); void renderCalendar(); };
      el('calendarBtn').onclick = openCalendar;
      el('closeCalendarBtn').onclick = () => el('calendarDialog').close();
      el('calendarMonth').onchange = () => void renderCalendar();
      el('calendarTodayBtn').onclick = () => { const now = new Date(); el('calendarMonth').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; void renderCalendar(); };
      const openPrelaunchForm = () => {
        const select = el('prelaunchClient');
        select.innerHTML = '<option value="">Selecione um exportador</option>' + clients.filter(client => client.active !== false).map(client => `<option value="${esc(client.id)}">${esc(client.nome)}</option>`).join('');
        el('prelaunchForm').hidden = false; el('prelaunchBooking').focus();
      };
      el('openPrelaunchBtn').onclick = openPrelaunchForm;
      el('cancelPrelaunchBtn').onclick = () => { el('prelaunchForm').reset(); el('prelaunchForm').hidden = true; };
      el('prelaunchDeadline').addEventListener('input', event => { event.target.value = formatDateTyping(event.target.value, true); });
      el('prelaunchForm').onsubmit = async event => {
        event.preventDefault();
        const deadline = dateForDatabase(el('prelaunchDeadline').value, true);
        if (!deadline) return toast.warning('Informe o deadline no formato dd/mm hh:mm.');
        try {
          await request('/api/prelaunches', { method:'POST', body:JSON.stringify({ clientId:el('prelaunchClient').value, booking:el('prelaunchBooking').value.trim(), deadline }) });
          event.currentTarget.reset(); event.currentTarget.hidden = true; toast.success('Pré-lançamento salvo na sua agenda.'); void renderCalendar();
        } catch (error) { toast.error(error.message); }
      };

      // Espaço de trabalho do processo: registros curtos, checklist e anexos
      // controlados ficam fora do formulário principal para evitar poluição.
      const workspace = { processId:null, checklist:[], comments:[], attachments:[] };
      const setWorkspaceTab = tab => {
        document.querySelectorAll('[data-workspace-tab]').forEach(button => { const active = button.dataset.workspaceTab === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
        document.querySelectorAll('[data-workspace-panel]').forEach(panel => { panel.hidden = panel.dataset.workspacePanel !== tab; });
      };
      const renderWorkspace = () => {
        el('checklistList').innerHTML = workspace.checklist.length ? workspace.checklist.map(item => `<article class="workspace-item"><label><input type="checkbox" data-checklist-toggle="${esc(item.id)}" ${item.completed ? 'checked' : ''}><span>${esc(item.label)}</span></label><button type="button" class="icon-button" data-checklist-delete="${esc(item.id)}" aria-label="Excluir item ${esc(item.label)}">×</button></article>`).join('') : '<p class="empty">Nenhum item no checklist.</p>';
        el('commentList').innerHTML = workspace.comments.length ? workspace.comments.map(item => `<article class="workspace-comment"><p>${esc(item.body)}</p><small>${esc(item.username || 'Usuário')} · ${new Date(item.created_at).toLocaleString('pt-BR')}</small></article>`).join('') : '<p class="empty">Nenhum comentário registrado.</p>';
        el('attachmentList').innerHTML = workspace.attachments.length ? workspace.attachments.map(item => `<article class="workspace-item"><div><strong>${esc(item.file_name)}</strong><small>${esc(item.mime_type)} · ${Math.ceil(Number(item.size_bytes || 0) / 1024)} KB</small></div><div class="workspace-actions"><button type="button" class="btn secondary" data-attachment-download="${esc(item.id)}">Baixar</button><button type="button" class="icon-button" data-attachment-delete="${esc(item.id)}" aria-label="Excluir anexo ${esc(item.file_name)}">×</button></div></article>`).join('') : '<p class="empty">Nenhum anexo enviado.</p>';
        el('checklistList').querySelectorAll('[data-checklist-toggle]').forEach(input => input.onchange = async () => { try { await request(`/api/processes/${workspace.processId}/checklist/${input.dataset.checklistToggle}`, { method:'PATCH', body:JSON.stringify({ completed:input.checked }) }); await loadWorkspace(); } catch (error) { toast.error(error.message); input.checked = !input.checked; } });
        el('checklistList').querySelectorAll('[data-checklist-delete]').forEach(button => button.onclick = async () => { if (!(await confirmAction('Excluir item', 'Excluir este item do checklist?'))) return; try { await request(`/api/processes/${workspace.processId}/checklist/${button.dataset.checklistDelete}`, { method:'DELETE' }); await loadWorkspace(); } catch (error) { toast.error(error.message); } });
        el('attachmentList').querySelectorAll('[data-attachment-download]').forEach(button => button.onclick = () => { window.open(`/api/processes/${workspace.processId}/attachments/${button.dataset.attachmentDownload}/download`, '_blank', 'noopener'); });
        el('attachmentList').querySelectorAll('[data-attachment-delete]').forEach(button => button.onclick = async () => { if (!(await confirmAction('Excluir anexo', 'Excluir este anexo? Esta ação não poderá ser desfeita.'))) return; try { await request(`/api/processes/${workspace.processId}/attachments/${button.dataset.attachmentDelete}`, { method:'DELETE' }); await loadWorkspace(); } catch (error) { toast.error(error.message); } });
      };
      const loadWorkspace = async () => {
        if (!workspace.processId) return;
        const [checklist, comments, attachments] = await Promise.all([request(`/api/processes/${workspace.processId}/checklist`), request(`/api/processes/${workspace.processId}/comments`), request(`/api/processes/${workspace.processId}/attachments`)]);
        workspace.checklist = checklist; workspace.comments = comments; workspace.attachments = attachments; renderWorkspace();
      };
      const openWorkspace = async () => {
        if (!editingProcessId) return toast.warning('Salve o processo antes de registrar o acompanhamento.');
        workspace.processId = editingProcessId;
        el('workspaceTitle').textContent = `Processo ${form.elements.booking.value || 'sem booking'}`;
        el('processWorkspaceDialog').showModal(); setWorkspaceTab('checklist');
        try { await request(`/api/processes/${workspace.processId}/checklist/defaults`, { method:'POST', body:'{}' }); await loadWorkspace(); } catch (error) { toast.error(error.message); }
      };
      el('processWorkspaceBtn').onclick = openWorkspace;
      el('closeWorkspaceBtn').onclick = () => el('processWorkspaceDialog').close();
      document.querySelectorAll('[data-workspace-tab]').forEach(button => button.onclick = () => setWorkspaceTab(button.dataset.workspaceTab));
      el('checklistForm').onsubmit = async event => { event.preventDefault(); const label = el('checklistText').value.trim(); if (!label) return; try { await request(`/api/processes/${workspace.processId}/checklist`, { method:'POST', body:JSON.stringify({ label }) }); event.currentTarget.reset(); await loadWorkspace(); } catch (error) { toast.error(error.message); } };
      el('commentForm').onsubmit = async event => { event.preventDefault(); const body = el('commentText').value.trim(); if (!body) return; try { await request(`/api/processes/${workspace.processId}/comments`, { method:'POST', body:JSON.stringify({ body }) }); event.currentTarget.reset(); await loadWorkspace(); } catch (error) { toast.error(error.message); } };
      const readFileAsBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.')); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.readAsDataURL(file); });
      el('attachmentForm').onsubmit = async event => { event.preventDefault(); const file = el('attachmentFile').files[0]; if (!file) return toast.warning('Selecione um arquivo para enviar.'); if (file.size > 4 * 1024 * 1024) return toast.warning('O anexo deve ter no máximo 4 MB.'); try { const contentBase64 = await readFileAsBase64(file); await request(`/api/processes/${workspace.processId}/attachments`, { method:'POST', body:JSON.stringify({ fileName:file.name, mimeType:file.type, contentBase64 }) }); event.currentTarget.reset(); await loadWorkspace(); toast.success('Anexo enviado com sucesso.'); } catch (error) { toast.error(error.message); } };
      // Garante que o botão sempre use a abertura reforçada acima, mesmo se
      // outro script tiver registrado um manipulador anterior.
      el('newBtn').onclick = async () => {
        if (await ensureSessionActive({ force:true })) open(null);
      };
      let processPagination = { offset:0, limit:50, hasMore:false, total:0 };
      const updateLoadMoreButton = () => {
        let button = el('loadMoreProcesses');
        if (!button) {
          button = document.createElement('button'); button.id = 'loadMoreProcesses'; button.type = 'button';
          button.className = 'btn secondary load-more-processes';
          const panel = document.querySelector('#processPage .panel:last-of-type');
          if (panel) panel.after(button);
          button.onclick = () => refreshData({ append:true }).catch(error => toast.error(error.message));
        }
        button.hidden = !processPagination.hasMore;
        button.textContent = `Carregar mais processos (${data.length} de ${processPagination.total})`;
      };
      const processFilterSessionKey = 'gport:process-filter:v1';
      let serverProcessFilter = null;
      // Cada pesquisa recebe uma versão. Caso uma busca antiga termine depois
      // da mais nova, a resposta antiga é descartada e não substitui a lista.
      let processRefreshVersion = 0;
      try {
        const savedFilter = JSON.parse(sessionStorage.getItem(processFilterSessionKey) || 'null');
        if (savedFilter?.field && (savedFilter?.value || savedFilter?.launchedFrom || savedFilter?.launchedTo)) {
          serverProcessFilter = savedFilter;
          el('searchField').value = savedFilter.field;
          el('search').value = savedFilter.value || '';
          el('processLaunchedFrom').value = savedFilter.launchedFrom || '';
          el('processLaunchedTo').value = savedFilter.launchedTo || '';
        }
      } catch { sessionStorage.removeItem(processFilterSessionKey); }
      const renderProcessPage = () => {
        render();
        renderClients();
        updateLoadMoreButton();
        const summary = el('processListMeta');
        if (summary) {
          const total = Number(processPagination.total || data.length);
          summary.textContent = `${total} processo${total === 1 ? '' : 's'} na visualização`;
        }
      };
      const showProcessLoading = () => {
        const emptyState = el('empty');
        if (!emptyState) return;
        el('rows').innerHTML = '';
        emptyState.classList.add('is-skeleton');
        emptyState.setAttribute('aria-busy', 'true');
        emptyState.innerHTML = '<strong>Carregando processos…</strong><span class="skeleton-line"></span><span class="skeleton-line"></span><span class="skeleton-line"></span>';
        emptyState.hidden = false;
        el('totalProcesses').textContent = '—';
        el('dueSoon').textContent = '—';
      };
      const applyProcessPage = (remoteProcesses, append) => {
        const page = Array.isArray(remoteProcesses)
          ? { items:remoteProcesses, pagination:{ limit:50, offset:0, total:remoteProcesses.length, hasMore:false } }
          : remoteProcesses;
        const viewItems = page.items.map(item => ({ ...toViewProcess(item), createdAt:item.created_at || '', updatedAt:item.updated_at || '', releaseDeadlineOrder:item.release_deadline || '' }));
        data = append ? [...data, ...viewItems] : viewItems;
        el('empty')?.classList.remove('is-skeleton');
        el('empty')?.removeAttribute('aria-busy');
        processPagination = page.pagination;
        renderProcessPage();
        if (!data.length) {
          el('empty').textContent = 'Nenhum processo encontrado.';
          el('empty').hidden = false;
        }
      };
      async function refreshData({ append=false, refreshReferenceData=false } = {}) {
        const refreshVersion = ++processRefreshVersion;
        const offset = append ? processPagination.offset + processPagination.limit : 0;
        const searchParams = new URLSearchParams({ limit:'50', offset:String(offset) });
        const requestedFilter = serverProcessFilter ? { ...serverProcessFilter } : null;
        if (requestedFilter) {
          searchParams.set('field', requestedFilter.field);
          searchParams.set('search', requestedFilter.value || '');
          if (requestedFilter.launchedFrom) searchParams.set('launchedFrom', requestedFilter.launchedFrom);
          if (requestedFilter.launchedTo) searchParams.set('launchedTo', requestedFilter.launchedTo);
        }
        if (processClientFilter !== 'all') {
          const selectedClient = clients.find(client => client.id === processClientFilter);
          searchParams.set('client', processClientFilter);
          if (selectedClient?.nome) searchParams.set('clientName', selectedClient.nome);
        }
        const needsReferenceData = refreshReferenceData || Date.now() >= referenceDataCache.expiresAt;
        const processRequest = request(`/api/processes?${searchParams}`);
        // Clientes e responsáveis não são necessários para exibir a planilha.
        // As três requisições começam juntas; a lista fica disponível assim que
        // os processos chegam, mesmo se referências demorarem ou falharem.
        const referenceRequests = needsReferenceData
          ? (referenceDataLoadPromise ||= Promise.allSettled([request('/api/clients'), request('/api/assignees')]))
          : null;
        if (!append && !data.length) showProcessLoading();
        const remoteProcesses = await processRequest;
        if (refreshVersion !== processRefreshVersion) return false;
        applyProcessPage(remoteProcesses, append);
        if (needsReferenceData) {
          // Dependências de formulário seguem em segundo plano. Assim, login,
          // paginação e filtros não aguardam clientes/responsáveis para terminar.
          void referenceRequests.then(([clientResult, assigneeResult]) => {
            if (clientResult.status === 'fulfilled') clients = clientResult.value.map(toViewClient);
            if (assigneeResult.status === 'fulfilled') availableAssignees = assigneeResult.value;
            if (clientResult.status === 'fulfilled' && assigneeResult.status === 'fulfilled') referenceDataCache.expiresAt = Date.now() + referenceDataTtlMs;
            renderClients();
            // Os filtros por exportador dependem da lista de clientes. Como essa
            // referência é carregada em segundo plano, redesenha a planilha assim
            // que ela chegar para exibir todos os botões sem exigir recarregamento.
            if (clientResult.status === 'fulfilled') render();
          }).finally(() => { referenceDataLoadPromise = null; });
        }
        return true;
      }
      let realtimeFallbackTimer = null;
      let realtimeFailureTimer = null;
      let realtimeNoticeTimer = null;
      let realtimeEventsReceived = 0;
      const realtimeFallbackIntervalMs = 60_000;
      const setRealtimeNotice = (message, duration = 5_000) => {
        const notice = el('realtimeNotice'); if (!notice) return;
        notice.textContent = message; notice.hidden = false;
        clearTimeout(realtimeNoticeTimer);
        if (duration) realtimeNoticeTimer = setTimeout(() => { notice.hidden = true; }, duration);
      };
      const renderAffectedViews = () => {
        render(); updateLoadMoreButton();
        // Não substitua o input enquanto alguém está digitando. O evento será
        // refletido quando a edição for concluída ou na próxima sincronização.
        const editingVgmDestination = document.activeElement?.matches?.('[data-vgm-sent-to]');
        if (!el('vgmPage').hidden && !editingVgmDestination) renderVgm();
        if (!el('releasePage').hidden) renderRelease();
        if (!el('followupPage').hidden) renderFollowup();
      };
      const stopRealtimeFallback = () => {
        clearTimeout(realtimeFailureTimer); realtimeFailureTimer = null;
        if (realtimeFallbackTimer) clearInterval(realtimeFallbackTimer);
        realtimeFallbackTimer = null;
      };
      const refreshByFallback = async () => {
        if (!currentUser || document.hidden || processSaveBusy) return;
        try { await refreshData(); } catch { /* tenta novamente no próximo ciclo */ }
      };
      const startRealtimeFallback = () => {
        if (realtimeFallbackTimer) return;
        setRealtimeNotice('Atualização em tempo real indisponível. Sincronização a cada minuto.', 8_000);
        realtimeFallbackTimer = setInterval(refreshByFallback, realtimeFallbackIntervalMs);
      };
      const refreshReferencesFromEvent = async () => {
        try {
          const requests = [request('/api/clients'), request('/api/assignees')];
          if (currentUser?.role === 'admin') requests.push(request('/api/users'));
          const [remoteClients, remoteAssignees, remoteUsers] = await Promise.all(requests);
          clients = remoteClients.map(toViewClient); availableAssignees = remoteAssignees;
          if (remoteUsers) users = remoteUsers;
          referenceDataCache.expiresAt = Date.now() + referenceDataTtlMs;
          renderClients(); if (currentUser?.role === 'admin') renderUsers();
        } catch { /* o cache atual permanece utilizável até a próxima tentativa */ }
      };
      const applyProcessRealtimeChange = async event => {
        if (!currentUser || processSaveBusy || !event?.id) return;
        const position = data.findIndex(item => item.id === event.id);
        if (event.change === 'deleted') {
          if (position >= 0) data = data.filter(item => item.id !== event.id);
          processPagination.total = Math.max(0, processPagination.total - 1);
          renderAffectedViews();
          if (position >= 0) setRealtimeNotice('Um processo visível foi removido.');
          return;
        }
        // Um filtro ativo pode ganhar ou perder itens depois de uma alteração.
        // Uma única busca da página corrente preserva o resultado exato.
        if (serverProcessFilter) {
          try { await refreshData(); } catch { /* evento futuro ou fallback fará nova tentativa */ }
          return;
        }
        // Para uma criação na primeira página, inserimos o novo processo sem
        // recarregar toda a listagem. Em páginas posteriores mostramos aviso
        // para não alterar a ordenação/paginação que o usuário está consultando.
        if (position < 0) {
          if (event.change !== 'created') return;
          try {
            const remote = await request(`/api/processes/${event.id}`);
            const view = { ...toViewProcess(remote), updatedAt:remote.updated_at || '' };
            if (processPagination.offset === 0) {
              const visibleCount = Math.max(data.length, processPagination.limit);
              data = [view, ...data].slice(0, visibleCount);
              processPagination.total += 1;
              renderAffectedViews(); setRealtimeNotice('Novo processo adicionado à lista.');
            } else setRealtimeNotice('Há um novo processo disponível. Volte à primeira página para visualizá-lo.');
          } catch { /* autorização ou rede serão tratadas pelo próximo evento/fallback */ }
          return;
        }
        try {
          const remote = await request(`/api/processes/${event.id}`);
          const previous = data[position];
          const view = { ...toViewProcess(remote), updatedAt:remote.updated_at || '' };
          data = data.map(item => item.id === event.id ? { ...previous, ...view } : item);
          renderAffectedViews();
          if (event.change !== 'updated') setRealtimeNotice('Processo atualizado automaticamente.');
        } catch (error) {
          if (error.status === 404) return;
          // A lista visível não é recarregada em cada evento. Só em caso de
          // falha pontual fazemos uma tentativa segura de recuperação.
          try { await refreshData(); } catch { /* fallback/reconexão tratarão */ }
        }
      };
      const connectRealtime = () => {
        if (!window.EventSource || realtimeSource) return;
        realtimeSource = new EventSource('/api/events');
        realtimeSource.onopen = () => {
          const wasUsingFallback = !!realtimeFallbackTimer;
          stopRealtimeFallback();
          if (wasUsingFallback) setRealtimeNotice('Atualização em tempo real restabelecida.');
        };
        realtimeSource.addEventListener('process-changed', rawEvent => {
          realtimeEventsReceived += 1;
          let event; try { event = JSON.parse(rawEvent.data); } catch { return; }
          window.dispatchEvent(new CustomEvent('gport:process-changed', { detail:event }));
          clearTimeout(realtimeRefreshTimer);
          realtimeRefreshTimer = setTimeout(() => applyProcessRealtimeChange(event), 120);
        });
        realtimeSource.addEventListener('reference-changed', () => { refreshReferencesFromEvent(); });
        // EventSource reconecta automaticamente. O polling só começa após 10
        // segundos desconectado, evitando chamadas extras em oscilações breves.
        realtimeSource.onerror = () => {
          if (!realtimeFailureTimer) realtimeFailureTimer = setTimeout(startRealtimeFallback, 10_000);
        };
      };
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        void ensureSessionActive({ force:true }).then(active => {
          if (!active) return;
          connectRealtime();
          if (realtimeFallbackTimer) refreshByFallback();
        });
      });
      // Enquanto a aplicação está visível, renova a sessão sem gerar polling de
      // processos. Abas em segundo plano continuam sujeitas ao limite seguro.
      setInterval(() => {
        if (currentUser && !document.hidden) void ensureSessionActive({ force:true });
      }, sessionCheckIntervalMs);
      // A pesquisa principal é realizada no servidor para não carregar toda a
      // base no navegador. O renderizador legado continua recebendo somente a
      // página já filtrada.
      let processSearchTimer = null;
      const applyServerProcessSearch = async ({ showValidation=false } = {}) => {
        const field = el('searchField').value, value = el('search').value.trim();
        const launchedFrom = el('processLaunchedFrom').value, launchedTo = el('processLaunchedTo').value;
        const hasPeriod = !!(launchedFrom || launchedTo);
        if (launchedFrom && launchedTo && launchedFrom > launchedTo) {
          if (showValidation) toast.warning('A data inicial deve ser anterior ou igual à data final.');
          return;
        }
        if (!value && !hasPeriod) {
          if (showValidation) return toast.warning('Informe um valor para pesquisar ou selecione um período.');
          if (serverProcessFilter) {
            serverProcessFilter = null; processFilter = null; sessionStorage.removeItem(processFilterSessionKey);
            try { await refreshData(); } catch (error) { toast.error(error.message); }
          }
          return;
        }
        serverProcessFilter = { field, value, launchedFrom, launchedTo }; processFilter = null; sessionStorage.setItem(processFilterSessionKey, JSON.stringify(serverProcessFilter));
        const filterKey = `${field}:${value}:${launchedFrom}:${launchedTo}`;
        const summary = el('filterSummary'); summary.hidden = false; summary.textContent = 'Buscando processos…'; summary.setAttribute('aria-busy', 'true');
        try {
          const applied = await refreshData();
          if (!applied || `${serverProcessFilter?.field || ''}:${serverProcessFilter?.value || ''}:${serverProcessFilter?.launchedFrom || ''}:${serverProcessFilter?.launchedTo || ''}` !== filterKey) return;
          const periodText = launchedFrom || launchedTo ? ` no período selecionado` : '';
          summary.textContent = `${processPagination.total} processo(s) encontrado(s)${periodText}.`;
        }
        catch (error) { toast.error(error.message); }
        finally { if (`${serverProcessFilter?.field || ''}:${serverProcessFilter?.value || ''}:${serverProcessFilter?.launchedFrom || ''}:${serverProcessFilter?.launchedTo || ''}` === filterKey) summary.removeAttribute('aria-busy'); }
      };
      const scheduleServerProcessSearch = () => { clearTimeout(processSearchTimer); processSearchTimer = setTimeout(() => { void applyServerProcessSearch(); }, 250); };
      el('filterBtn').onclick = () => { clearTimeout(processSearchTimer); return applyServerProcessSearch({ showValidation:true }); };
      el('search').oninput = scheduleServerProcessSearch;
      el('searchField').onchange = scheduleServerProcessSearch;
      el('processLaunchedFrom').onchange = scheduleServerProcessSearch;
      el('processLaunchedTo').onchange = scheduleServerProcessSearch;
      el('search').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); clearTimeout(processSearchTimer); void applyServerProcessSearch({ showValidation:true }); } };
      el('clearFilterBtn').onclick = async () => {
        clearTimeout(processSearchTimer); serverProcessFilter = null; processFilter = null; sessionStorage.removeItem(processFilterSessionKey); el('search').value = ''; el('searchField').selectedIndex = 0; el('processLaunchedFrom').value = ''; el('processLaunchedTo').value = '';
        try { await refreshData(); } catch (error) { toast.error(error.message); }
      };
      const turnstileWidget = el('turnstileWidget');
      const turnstileSiteKey = turnstileWidget?.dataset.sitekey || '';
      let turnstileWidgetId = null, turnstileToken = '';
      const resetTurnstile = () => { turnstileToken = ''; if (turnstileWidgetId !== null && window.turnstile) window.turnstile.reset(turnstileWidgetId); };
      window.initializeTurnstile = () => {
        if (!turnstileSiteKey || !window.turnstile || turnstileWidgetId !== null) return;
        turnstileWidget.hidden = false;
        turnstileWidgetId = window.turnstile.render(turnstileWidget, { sitekey: turnstileSiteKey, theme: 'auto', callback: token => { turnstileToken = token; }, 'expired-callback': () => { turnstileToken = ''; }, 'error-callback': () => { turnstileToken = ''; } });
      };
      async function signIn(credentials, persist) {
        if (turnstileSiteKey && !turnstileToken) throw new Error('Conclua a verificação de segurança antes de entrar.');
        if (turnstileSiteKey) credentials.turnstileToken = turnstileToken;
        const result = await request('/api/auth/login', { method:'POST', body:JSON.stringify(credentials) });
        currentUser = result.user;
        sessionRecoveryRequired = false; lastSessionCheckAt = Date.now();
        el('currentUserName').textContent = currentUser.username;
        el('usersNav').hidden = currentUser.role !== 'admin';
        applyRoleTabs();
        // A sessão já está válida neste ponto. Fechamos o login e exibimos
        // feedback imediato; processos e referências continuam em paralelo.
        el('loginDialog').close(); showProcessLoading(); connectRealtime();
        void refreshData({ refreshReferenceData:true }).catch(() => toast.warning('A sessão foi iniciada, mas os processos ainda estão carregando.'));
        toast.success('Login realizado com sucesso.');
      }
      async function restoreSession() {
        try {
          const result = await request('/api/me'); currentUser = result.user; lastSessionCheckAt = Date.now();
          el('currentUserName').textContent = currentUser.username;
          el('usersNav').hidden = currentUser.role !== 'admin';
          applyRoleTabs();
          el('loginDialog').close(); showProcessLoading(); connectRealtime();
          void refreshData({ refreshReferenceData:true }).catch(() => toast.warning('Não foi possível atualizar os processos agora. Tente novamente em instantes.'));
        } catch { currentUser = null; }
      }
      el('loginForm').onsubmit = async e => {
        e.preventDefault(); const v = Object.fromEntries(new FormData(e.currentTarget));
        try { await signIn(v, !!v.remember); el('loginError').hidden = true; }
        catch (error) { resetTurnstile(); el('loginError').textContent = safeToastMessage(error.message, 'Não foi possível entrar. Verifique seus dados e tente novamente.'); el('loginError').hidden = false; toast.error('Não foi possível entrar. Verifique seus dados e tente novamente.'); }
      };
      const registrationCodeField = document.createElement('div');
      registrationCodeField.className = 'field';
      registrationCodeField.innerHTML = '<label for="signupRegistrationCode">Código de cadastro (se solicitado)</label><input id="signupRegistrationCode" name="registrationCode" type="password" autocomplete="off">';
      el('signupForm').querySelector('.grid').appendChild(registrationCodeField);
      el('signupForm').onsubmit = async e => {
        e.preventDefault(); const v = Object.fromEntries(new FormData(e.currentTarget));
        if (v.password !== v.confirmPassword) return toast.warning('A confirmação de senha não confere.');
        try { await request('/api/auth/register', { method:'POST', body:JSON.stringify(v) }); el('signupDialog').close(); el('loginDialog').showModal(); el('loginForm').elements.username.value = v.username; e.currentTarget.reset(); toast.success('Conta criada. Agora faça login.'); }
        catch (error) { toast.error(error.message); }
      };
      if (el('showSignupBtn')) el('showSignupBtn').onclick = () => { el('loginDialog').close(); el('signupDialog').showModal(); };
      el('closeSignupBtn').onclick = el('backToLoginBtn').onclick = () => { el('signupDialog').close(); el('loginDialog').showModal(); };
      const resetClientForm = () => { el('clientForm').reset(); el('clientForm').elements.id.value = ''; el('clientForm').elements.pais.value = 'Brasil'; el('clientFormTitle').textContent = 'Cadastro de exportadores'; el('saveClientBtn').textContent = 'Salvar exportador'; };
      el('clientsBtn').onclick = () => { resetClientForm(); renderClients(); el('clientsDialog').showModal(); };
      el('clientList').onclick = async e => {
        const editButton = e.target.closest('.edit-client');
        const deleteButton = e.target.closest('.delete-client');
        const button = editButton || deleteButton;
        if (!button) return;
        const client = clients.find(c => c.id === button.dataset.clientId);
        if (!client) return;
        if (deleteButton) {
          if (!(await confirmAction('Excluir exportador', `Excluir o exportador ${client.nome}? Esta ação não poderá ser desfeita.`))) return;
          try {
            await request(`/api/clients/${client.id}`, { method:'DELETE' });
            await refreshData({ refreshReferenceData:true });
            resetClientForm();
            toast.success('Exportador excluído com sucesso.');
          } catch (error) { toast.error(error.message); }
          return;
        }
        const formClient = el('clientForm');
        formClient.elements.cnpj.value = formatCnpj(formClient.elements.cnpj.value);
        Object.entries(client).forEach(([key, value]) => { if (formClient.elements[key] && formClient.elements[key].type !== 'checkbox') formClient.elements[key].value = value || ''; });
        formClient.elements.rucManual.checked = client.rucManual === true;
        formClient.elements.dueOnly.checked = client.dueOnly === true;
        formClient.elements.ovacao.checked = client.ovacao === true;
        el('clientFormTitle').textContent = 'Editar exportador'; el('saveClientBtn').textContent = 'Salvar alterações';
        formClient.scrollIntoView({ behavior:'smooth', block:'start' });
      };
      el('clientForm').elements.cnpj.addEventListener('input', e => { e.target.value = formatCnpj(e.target.value); });
      const normalizeUppercaseInput = input => { input.value = input.value.toLocaleUpperCase('pt-BR'); };
      // Campos operacionais são padronizados enquanto o usuário digita.
      // E-mail, credenciais e valores monetários não passam por esta regra.
      form.querySelectorAll('input[type="text"]').forEach(input => {
        if (!['valor', 'exportadorCnpj'].includes(input.name)) input.addEventListener('input', () => normalizeUppercaseInput(input));
      });
      el('containerDetails').addEventListener('input', event => {
        if (event.target.matches('[data-lacre], [data-nf], [data-new-seal]')) normalizeUppercaseInput(event.target);
      });
      ['nome', 'contato', 'pais', 'endereco'].forEach(name => {
        const input = el('clientForm').elements[name];
        if (input) input.addEventListener('input', () => normalizeUppercaseInput(input));
      });
      el('clientForm').onsubmit = async e => {
        e.preventDefault(); const v = Object.fromEntries(new FormData(e.currentTarget)); const payload = { name:v.nome, taxId:v.cnpj, contact:v.contato, phone:v.telefone, email:v.email, country:v.pais, address:v.endereco, rucManual:v.rucManual === 'on', dueOnly:v.dueOnly === 'on', ovacao:v.ovacao === 'on' };
        if (payload.rucManual && payload.dueOnly) { toast.warning('Escolha apenas RUC manual ou Apenas DU-E.'); return; }
        try { const editing = !!v.id; await request(v.id ? `/api/clients/${v.id}` : '/api/clients', { method:v.id ? 'PATCH' : 'POST', body:JSON.stringify(payload) }); await refreshData({ refreshReferenceData:true }); resetClientForm(); toast.success(editing ? 'Exportador atualizado com sucesso.' : 'Exportador cadastrado com sucesso.'); }
        catch (error) { toast.error(error.message); }
      };
      let processAutoSaveTimer = null, processSaveBusy = false, processSavePending = false, newProcessIdempotencyKey = null;
      // A validação é tratada pela própria rotina de salvamento, que apresenta
      // mensagens claras. Isso evita o bloqueio silencioso do navegador.
      form.noValidate = true;
      // `editingProcessId` é a única fonte de verdade para decidir entre POST
      // (novo) e PATCH (edição). O campo hidden é mantido apenas para a tela.
      const processIdFromForm = () => String(editingProcessId || '').trim();
      const showProcessSaveState = text => { const button = form.querySelector('button[type="submit"]'); if (button) button.textContent = text; };
      const persistProcessForm = async ({ closeAfter = false, quiet = false } = {}) => {
        if (processSaveBusy) { processSavePending = true; return false; }
        syncContainerDetails();
        // Reforço no navegador: a API repete esta validação para impedir qualquer
        // salvamento por requisição manual ou navegador antigo.
        const requiredFields = [...form.querySelectorAll('[required]:not(:disabled)')];
        const invalidPlaceholder = requiredFields.find(input => /^[.*]+$/.test(String(input.value || '').trim()));
        if (invalidPlaceholder) {
          invalidPlaceholder.setCustomValidity('Preencha este campo com uma informação válida.');
          if (!quiet) { invalidPlaceholder.reportValidity(); toast.warning('Revise os campos obrigatórios.'); }
          return false;
        }
        requiredFields.forEach(input => input.setCustomValidity(''));
        if (!form.checkValidity()) {
          if (!quiet) { form.reportValidity(); toast.warning('Revise os campos obrigatórios.'); }
          return false;
        }
        const values = Object.fromEntries(new FormData(form));
        const processId = processIdFromForm();
        // Nunca permita que um ID residual de um formulário anterior seja
        // enviado em uma criação nova.
        if (!processId) values.id = '';
        values.updatedAt = data.find(item => item.id === processId)?.updatedAt || null;
        const isNewProcess = !processId;
        // Um autosave só existe na edição. Um lançamento novo é salvo apenas
        // pelo botão, evitando processos incompletos ou duplicados.
        if (quiet && !processId) return false;
        const button = form.querySelector('button[type="submit"]');
        const originalLabel = button?.textContent || 'Salvar processo';
        try {
          processSaveBusy = true;
          if (button) { button.disabled = true; showProcessSaveState('Salvando…'); }
          const payload = toApiProcess(values);
          payload.updatedAt = values.updatedAt;
          if (isNewProcess) payload.idempotencyKey ||= (newProcessIdempotencyKey ||= crypto.randomUUID());
          if (!payload.clientId) throw new Error('Selecione um exportador cadastrado.');
          const saved = await request(processId ? `/api/processes/${processId}` : '/api/processes', { method:processId ? 'PATCH' : 'POST', body:JSON.stringify(payload) });
          const client = clients.find(item => item.id === payload.clientId);
          const previous = data.find(item => item.id === processId) || {};
          const view = { ...toViewProcess({ ...saved, exporter:client?.nome || previous.exportador || '', analyst:previous.analista || currentUser?.username || '' }), updatedAt:saved.updated_at || '' };
          data = processId ? data.map(item => item.id === processId ? { ...item, ...view } : item) : [view, ...data].slice(0, Math.max(data.length, processPagination.limit));
          if (isNewProcess) processPagination.total += 1;
          // Mantém o mesmo identificador após o primeiro lançamento. A partir
          // daqui qualquer novo ajuste é obrigatoriamente uma atualização.
          form.elements.id.value = view.id;
          editingProcessId = view.id;
          el('processWorkspaceBtn').hidden = false;
          if (isNewProcess) newProcessIdempotencyKey = null;
          // Um pré-lançamento só é concluído após o processo definitivo ser
          // persistido. Em falha de rede, ele continua na agenda do analista.
          if (isNewProcess && form.dataset.prelaunchId) {
            try { await request(`/api/prelaunches/${form.dataset.prelaunchId}`, { method:'DELETE' }); delete form.dataset.prelaunchId; }
            catch { toast.warning('Processo salvo, mas o pré-lançamento continua na agenda. Você pode removê-lo depois.'); }
          }
          if (isNewProcess) {
            // Um filtro anterior não deve esconder um processo recém-lançado.
            processFilter = null;
            el('search').value = '';
            el('searchField').selectedIndex = 0;
          }
          if (closeAfter) {
            dialog.close(); render(); editingProcessId = null;
            toast.success(isNewProcess ? 'Processo criado com sucesso.' : 'Processo atualizado com sucesso.');
          }
          else { showProcessSaveState('Salvo automaticamente'); window.setTimeout(() => { if (!processSaveBusy) showProcessSaveState('Salvar processo'); }, 1000); }
          return true;
        } catch (error) {
          showProcessSaveState(originalLabel);
          if (!quiet) toast.error(error.message || 'Não foi possível salvar o processo.');
          return false;
        } finally {
          processSaveBusy = false;
          if (button) button.disabled = false;
          if (processSavePending) { processSavePending = false; scheduleProcessAutoSave(); }
        }
      };
      const scheduleProcessAutoSave = () => {
        if (!processIdFromForm()) return;
        window.clearTimeout(processAutoSaveTimer);
        processAutoSaveTimer = window.setTimeout(() => { persistProcessForm({ quiet:true }); }, 900);
      };
      form.addEventListener('input', scheduleProcessAutoSave);
      form.addEventListener('change', scheduleProcessAutoSave);
      form.onsubmit = async e => { e.preventDefault(); await persistProcessForm({ closeAfter:true }); };
      el('deleteProcessBtn').onclick = async () => {
        if (!editingProcessId || !(await confirmAction('Excluir processo', 'Excluir este processo? Esta ação não poderá ser desfeita.'))) return;
        try { await request(`/api/processes/${editingProcessId}`, { method:'DELETE' }); dialog.close(); editingProcessId = null; await refreshData(); toast.success('Processo excluído com sucesso.'); }
        catch (error) { toast.error(error.message); }
      };
      el('usersNav').onclick = async e => {
        e.preventDefault();
        try { users = (await request('/api/users')).map(u => ({ ...u })); renderUsers(); el('usersDialog').showModal(); }
        catch (error) { toast.error(error.message); }
      };
      el('vgmNav').onclick = e => {
        e.preventDefault();
        if (!['admin', 'analyst', 'vgm'].includes(currentUser?.role)) return;
        showVgmPage();
      };
      el('vgmReportNav').onclick = e => { e.preventDefault(); showVgmReportPage(); }; el('openVgmReportBtn').onclick = showVgmReportPage;
      el('closeVgmReportBtn').onclick = showVgmPage;
      el('releaseNav').onclick = e => {
        e.preventDefault();
        if (!['admin', 'analyst', 'liberacao'].includes(currentUser?.role)) return;
        showReleasePage();
      };
      el('followupNav').onclick = e => {
        e.preventDefault();
        if (!['admin', 'analyst'].includes(currentUser?.role)) return;
        showFollowupPage();
      };
      const saveVgmRow = async id => {
        const status = el('vgmList').querySelector(`[data-vgm-status="${id}"]`)?.value;
        const vgmSentTo = el('vgmList').querySelector(`[data-vgm-sent-to="${id}"]`)?.value;
        const physicalProcessAnalyst = el('vgmList').querySelector(`[data-vgm-analyst="${id}"]`)?.value;
        const scheduleValue = el('vgmList').querySelector(`[data-vgm-release-schedule="${id}"]`)?.value;
        const deadlineValue = el('vgmList').querySelector(`[data-vgm-release-deadline="${id}"]`)?.value;
        const releaseSchedule = dateForDatabase(scheduleValue, true);
        const releaseDeadline = dateForDatabase(deadlineValue, true);
        if (scheduleValue && !releaseSchedule) throw new Error('Informe o deadline de agendamento no formato dd/mm hh:mm.');
        if (deadlineValue && !releaseDeadline) throw new Error('Informe o deadline de liberação no formato dd/mm hh:mm.');
        const before = data;
        // A tela responde imediatamente. Se o servidor recusar a alteração,
        // restauramos a lista exatamente como estava antes do envio.
        data = data.map(item => item.id === id ? { ...item, vgmStatus:status, vgmEnviadoPara:vgmSentTo || '', analistaFisico:physicalProcessAnalyst || '', agendamentoLiberacao:scheduleValue || '', deadlineLiberacao:deadlineValue || '' } : item);
        render(); renderVgm();
        try {
          const updated = await request(`/api/processes/${id}/vgm`, { method:'PATCH', body:JSON.stringify({ vgmStatus:status, vgmSentTo, physicalProcessAnalyst, releaseSchedule, releaseDeadline }) });
          const current = before.find(item => item.id === id) || {}; const view = toViewProcess({ ...updated, exporter:current.exportador, analyst:current.analista });
          data = data.map(item => item.id === id ? { ...item, ...view } : item); render(); renderVgm(); toast.success('Status de VGM atualizado.');
        } catch (error) {
          data = before; render(); renderVgm(); throw error;
        }
      };
      const saveReleaseRow = async id => {
        let releaseStatus = el('releaseList').querySelector(`[data-release-status="${id}"]`)?.value;
        const releaseChannel = el('releaseList').querySelector(`[data-release-channel="${id}"]`)?.value;
        if (releaseChannel === 'Verde') { releaseStatus = 'Sim'; const statusInput = el('releaseList').querySelector(`[data-release-status="${id}"]`); if (statusInput) statusInput.value = 'Sim'; }
        const vessel = el('releaseList').querySelector(`[data-release-vessel="${id}"]`)?.value;
        const scheduleValue = el('releaseList').querySelector(`[data-release-schedule="${id}"]`)?.value;
        const deadlineValue = el('releaseList').querySelector(`[data-release-deadline="${id}"]`)?.value; const releaseDateValue = el('releaseList').querySelector(`[data-release-date="${id}"]`)?.value;
        const releaseSchedule = dateForDatabase(scheduleValue, true);
        const releaseDeadline = dateForDatabase(deadlineValue, true); const releaseDate = dateForDatabase(releaseDateValue);
        if (scheduleValue && !releaseSchedule) throw new Error('Informe o agendamento no formato dd/mm hh:mm.');
        if (deadlineValue && !releaseDeadline) throw new Error('Informe o deadline de liberação no formato dd/mm hh:mm.'); if (releaseDateValue && !releaseDate) throw new Error('Informe a data de liberação no formato dd/mm.');
        const before = data;
        data = data.map(item => item.id === id ? { ...item, liberacaoStatus:releaseStatus, canalLiberacao:releaseChannel || '', navio:vessel || '', agendamentoLiberacao:scheduleValue || '', deadlineLiberacao:deadlineValue || '', dataLiberacao:releaseDateValue || item.dataLiberacao } : item);
        render(); renderRelease();
        try {
          const updated = await request(`/api/processes/${id}/release`, { method:'PATCH', body:JSON.stringify({ releaseStatus, releaseChannel, vessel, releaseSchedule, releaseDeadline, releaseDate }) });
          const current = before.find(item => item.id === id) || {}; const view = toViewProcess({ ...updated, exporter:current.exportador, analyst:current.analista });
          data = data.map(item => item.id === id ? { ...item, ...view } : item); render(); renderRelease(); toast.success('Status de liberação atualizado.');
        } catch (error) {
          data = before; render(); renderRelease(); throw error;
        }
      };
      el('followupPdfList').onclick = async e => {
        const button = e.target.closest('[data-followup-pdf], [data-followup-history]'); if (!button) return;
        const id = button.dataset.followupPdf || button.dataset.followupHistory;
        const process = data.find(item => item.id === id); if (!process) return;
        try { button.disabled = true; if (button.dataset.followupHistory) await showFollowupHistory(process); else await printFollowupPdf(process); }
        catch (error) { toast.error(error.message); }
        finally { button.disabled = false; }
      };
      el('financialNav').onclick = e => {
        e.preventDefault();
        if (!['admin', 'financeiro'].includes(currentUser?.role)) return;
        renderFinancial(); el('financialDialog').showModal();
      };
      el('processNav').onclick = e => { e.preventDefault(); showProcessesPage(); };
      el('closeVgmBtn').onclick = showProcessesPage;
      el('closeReleaseBtn').onclick = showProcessesPage;
      el('closeFollowupBtn').onclick = showProcessesPage;
      el('closeFinancialBtn').onclick = () => el('financialDialog').close();
      const passwordResetDialog = el('passwordResetDialog');
      const passwordResetForm = el('passwordResetForm');
      const closePasswordReset = () => { passwordResetForm.reset(); passwordResetDialog.close(); };
      el('closePasswordResetBtn').onclick = closePasswordReset;
      el('cancelPasswordResetBtn').onclick = closePasswordReset;
      const openPasswordReset = user => {
        passwordResetForm.reset();
        passwordResetForm.elements.userId.value = user.id;
        el('passwordResetTarget').textContent = `Defina uma nova senha para ${user.username}.`;
        passwordResetDialog.showModal();
        passwordResetForm.elements.password.focus();
      };
      passwordResetForm.onsubmit = async event => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(passwordResetForm));
        if (values.password !== values.confirmPassword) return toast.warning('A confirmação de senha não confere.');
        try {
          await request(`/api/users/${values.userId}`, { method:'PATCH', body:JSON.stringify({ password:values.password }) });
          users = await request('/api/users');
          renderUsers();
          closePasswordReset();
          toast.success('Senha redefinida com sucesso.');
        } catch (error) { toast.error(error.message); }
      };
      el('userForm').onsubmit = async e => {
        e.preventDefault();
        // `currentTarget` pode se tornar null depois de um await. Guarde o
        // formulário antes das requisições para que o reset final não quebre
        // após o usuário ser criado com sucesso.
        const userForm = e.currentTarget;
        const v = Object.fromEntries(new FormData(userForm));
        if (v.password !== v.confirmPassword) return toast.warning('A confirmação de senha não confere.');
        try { await request('/api/users', { method:'POST', body:JSON.stringify({ username:v.username, password:v.password, role:'analyst' }) }); users = await request('/api/users'); renderUsers(); userForm.reset(); toast.success('Usuário criado com sucesso.'); }
        catch (error) { toast.error(error.message); }
      };
      el('userList').onchange = async e => {
        const input = e.target.closest('.user-role'); if (!input) return;
        const user = users.find(u => u.username === input.dataset.user); if (!user) return;
        try { await request(`/api/users/${user.id}`, { method:'PATCH', body:JSON.stringify({ role:input.value }) }); users = await request('/api/users'); renderUsers(); }
        catch (error) { toast.error(error.message); input.value = user.role; }
      };
      el('userList').onclick = async e => {
        const button = e.target.closest('.reset-password, .delete-user'); if (!button) return;
        const user = users.find(u => u.username === button.dataset.user); if (!user) return;
        try {
          if (button.classList.contains('reset-password')) {
            openPasswordReset(user);
            return;
          } else {
            if (!(await confirmAction('Excluir funcionário', `Excluir o funcionário ${user.username}? O acesso ao sistema será removido.`))) return;
            await request(`/api/users/${user.id}`, { method:'DELETE' });
            toast.success(`Funcionário ${user.username} excluído com sucesso.`);
          }
          users = await request('/api/users'); renderUsers();
        } catch (error) { toast.error(error.message); }
      };
      el('settingsLogoutBtn').onclick = async () => { try { await request('/api/auth/logout', { method:'POST' }); sessionStorage.setItem('gport_toast_notice', 'Você saiu do sistema com segurança.'); } finally { location.reload(); } };
      function printCoverFromDocumentModelBase(p) {
        // Pelo botão do formulário, "exportador" é o ID do cadastro; pela
        // lista, ele já é o nome. Aceitar os dois evita exibir o UUID na capa.
        const client = clients.find(c => c.id === p.clientId || c.id === p.exportador || c.nome === p.exportador) || {};
        const exporterName = client.nome || p.exportador || '';
        const balanceCoverName = value => {
          const words = String(value || '').trim().split(/\s+/).filter(Boolean);
          if (words.length < 2 || words.join(' ').length <= 28) return words.join(' ');
          let splitAt = 1, smallestDifference = Number.POSITIVE_INFINITY;
          for (let index = 1; index < words.length; index += 1) {
            const first = words.slice(0, index).join(' '), second = words.slice(index).join(' ');
            const difference = Math.abs(first.length - second.length);
            if (difference < smallestDifference) { splitAt = index; smallestDifference = difference; }
          }
          return `${words.slice(0, splitAt).join(' ')}\n${words.slice(splitAt).join(' ')}`;
        };
        const exporterDisplayName = balanceCoverName(exporterName);
        const containers = containerParts(p.containers), tares = containerParts(p.tara), seals = containerParts(p.lacre), notes = containerParts(p.notasFiscais), newSeals = containerParts(p.lacreNovo);
        const hasMapa = p.vistoriaMapa === 'Sim';
        const rowCount = Math.max(6, containers.length, tares.length, seals.length, notes.length, newSeals.length);
        // A capa recebe valores tanto da API (AAAA-MM-DD...) quanto diretamente
        // do formulário (DD/MM ou DD/MM HH:MM). Interpretar `11/08` com
        // `new Date()` troca dia e mês em alguns navegadores; formate as partes
        // explicitamente para preservar o padrão brasileiro.
        const fmtCoverDate = (value, withTime = false) => {
          const raw = String(value || '').trim();
          const brazilian = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
          if (brazilian) return `${brazilian[1].padStart(2, '0')}/${brazilian[2].padStart(2, '0')}${withTime && brazilian[3] ? ` ${brazilian[3].padStart(2, '0')}:${brazilian[4]}` : ''}`;
          const stored = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
          if (stored) return `${stored[3]}/${stored[2]}${withTime && stored[4] ? ` ${stored[4]}:${stored[5]}` : ''}`;
          return '';
        };
        const deliveryVgm = ['Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT'].includes(p.vgmStatus);
        const released = p.liberacaoStatus === 'Sim' || p.canal === 'Verde';
        const ovacao = (client.ovacao ?? p.ovacao) === true ? 'Sim' : 'Não';
        const cargoValue = p.valor ? `${p.moeda || 'USD'} ${Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '';
        const containerSummary = p.qtdContainers ? `${String(p.qtdContainers).padStart(2, '0')}x${String(p.tipoContainer || '').replace(/[^a-zA-Z0-9]/g, '')}` : '';
        const cell = (label, value = '', cls = '') => `<div class="field ${cls}"><b>${esc(label)}</b><span>${esc(value || '')}</span></div>`;
        const mark = (label, selected) => `<span class="mark">${esc(label)} <i>${selected ? 'X' : ''}</i></span>`;
        const typeBl = [['EXPRESS RELEASE','Express Release'],['ORIGINAL NA ORIGEM','Original na origem'],['ORIGINAL NO DESTINO','Original no destino'],['SEAWAYBILL','Sea Waybill'],['TELEX RELEASE','TELEX Release']];
        const freights = [['COLLECT','Collect'],['PREPAID','Prepaid'],['PREPAID ABROAD','Prepaid Abroad']];
        const rows = Array.from({ length: rowCount }, (_, index) => `<tr><td>${esc(containers[index] || '')}</td><td>${esc(tares[index] || '')}</td><td>${esc(seals[index] || '')}</td><td>${esc(notes[index] || '')}</td>${hasMapa ? `<td>${esc(newSeals[index] || '')}</td>` : ''}</tr>`).join('');
        const dueIssueIso = dateForDatabase(p.dueEmissao);
        const dueExpiry = (() => { if (!dueIssueIso) return ''; const date = new Date(`${dueIssueIso}T12:00:00`); date.setDate(date.getDate() + 14); return dateForField(date.toISOString().slice(0, 10)); })();
        const html = `<!doctype html><html lang="pt-BR"><head><base href="${location.href}"><meta charset="utf-8"><title>Capa ${esc(p.booking || '')}</title><style>
          @page{size:A4;margin:7mm}*{box-sizing:border-box}body{margin:0;color:#000;font:9px "Times New Roman",Times,serif}.sheet{height:282mm;overflow:hidden;border:1.5px solid #000}.port{height:9mm;padding:1.2mm;text-align:center;font:bold 17px "Times New Roman",Times,serif;letter-spacing:.8px}.head{display:grid;grid-template-columns:31% 46% 23%;height:21mm;border-top:1.5px solid #000;border-bottom:1.5px solid #000}.head>div,.head h1{margin:0;padding:2mm;border-right:1px solid #000}.head>div:last-child{border:0}.logo{display:flex;align-items:center;justify-content:center}.logo img{max-width:39mm;max-height:14mm;object-fit:contain;filter:grayscale(1) contrast(300%) brightness(0)}.head h1{text-align:center;font:bold 14px "Times New Roman",Times,serif;line-height:1.08}.process{font:bold 10px "Times New Roman",Times,serif}.process span{display:block;margin-top:.7mm;font-size:9px}.workflow{display:grid;grid-template-columns:31% 34% 35%;height:86mm;border-bottom:1.5px solid #000;overflow:hidden}.workflow section{border-right:1px solid #000}.workflow section:last-child{border:0}.title{height:7mm;padding:1.6mm;text-align:center;border-bottom:1px solid #000;font:bold 10px "Times New Roman",Times,serif}.line{height:7mm;padding:1.45mm 2mm;border-bottom:1px solid #000;font:bold 9px "Times New Roman",Times,serif;line-height:1.15}.stamp-line{height:11.5mm;padding:1.45mm 2mm;border-bottom:1px solid #000;font:bold 9px "Times New Roman",Times,serif;line-height:1.15}.options{padding:2mm;font:bold 8.8px "Times New Roman",Times,serif;line-height:1.35}.options strong{display:block;margin-bottom:.5mm}.option-row{display:grid;grid-template-columns:1fr 1fr;gap:2mm;margin-bottom:1.4mm}.option-row>div{min-width:0}.bl-row{grid-template-columns:58% 42%}.freight-row{grid-template-columns:1fr;gap:1mm}.inline-checks{display:grid;grid-template-columns:1fr;gap:.9mm;margin-top:3.3mm;font-size:8px;line-height:1.1;align-content:start}.freight-row .inline-checks{grid-template-columns:1fr;margin-top:1mm}.freight-row .inline-checks .certificate-title{margin:0}.inline-checks span{white-space:nowrap}.inline-checks i{display:inline-block;width:9px;height:9px;margin-left:.7mm;border:1px solid #000;vertical-align:-1px}.mapa-label{font-size:17px;letter-spacing:.3px;margin-top:2mm}.mark{display:flex;align-items:center;justify-content:flex-start;gap:1mm}.mark i{display:inline-block;flex:0 0 10px;width:10px;height:10px;margin-left:1mm;border:1px solid #000;line-height:9px;text-align:center;font-style:normal}.info{display:grid;grid-template-columns:40% 22% 38%;grid-template-rows:8mm repeat(5,9mm);border-bottom:1px solid #000}.field{min-width:0;padding:1.25mm 1.8mm;border-right:1px solid #000;border-bottom:1px solid #000}.field b{display:block;font-size:8px}.field span{display:block;min-height:3mm;margin-top:.8mm;overflow-wrap:anywhere;font-weight:bold;font-size:9px;line-height:1.1}.booking{grid-column:1/3}.bl{grid-column:3}.exporter{grid-column:1;display:flex;min-height:0;overflow:hidden;flex-direction:column;padding:.5mm 1.4mm}.exporter b{flex:0 0 auto;font-size:7.8px;line-height:1}.exporter span{min-height:0;max-height:none;margin-top:.1mm;overflow:hidden;overflow-wrap:break-word;word-break:normal;white-space:pre-line;font-size:10.8px;line-height:.92}.invoice{grid-column:2}.cnpj{grid-column:3}.importer{grid-column:1/3}.value{grid-column:3}.vessel{grid-column:1/3}.incoterm{grid-column:3}.agency{grid-column:1/3}.due{grid-column:3}.carrier{grid-column:1/3;border-bottom:0}.ruc{grid-column:3;border-bottom:0}.bar{padding:1.2mm;background:#000;color:#fff;text-align:center;font:bold 10px "Times New Roman",Times,serif}.cargo{display:grid;grid-template-columns:2fr 1fr 1.2fr}.cargo .field{height:10mm}.cargo .field:nth-child(3n){border-right:0}.containers{width:100%;border-collapse:collapse}.containers th,.containers td{height:${Math.max(2.8, Math.min(6.2, 48 / rowCount)).toFixed(2)}mm;padding:.8mm 1.4mm;border:1px solid #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:8.5px}.containers th{height:5mm;background:#000;color:#fff;text-align:center;font:bold 8.7px "Times New Roman",Times,serif}.containers th:nth-child(1){width:34%}.containers th:nth-child(2){width:15%}.containers th:nth-child(3){width:22%}.containers th:nth-child(4){width:12%}.containers th:nth-child(5){width:17%}.foot{padding:1.2mm 2mm;text-align:right;font-size:7px}
        </style></head><body><main class="sheet"><div class="port">${esc((p.origem || 'PORTO DE ORIGEM').toUpperCase())}</div><header class="head"><div class="logo"><img src="logo-gport.png" alt="GPORT"></div><h1>PROCESSO DE<br>EXPORTAÇÃO</h1><div class="process">PROCESSO Nº.<span>${esc(p.numeroProcesso || '')}</span></div></header><section class="workflow"><section><div class="title">DEADLINES / PRAZOS</div><div class="line">DRAFT: ${esc(fmtCoverDate(p.prazo, true))}</div><div class="line">AGENDAMENTO:</div><div class="line">LIBERAÇÃO: ${esc(fmtCoverDate(p.liberacaoData))}</div><div class="title">TRANSPORTE</div><div class="line">COLETA: ${esc(fmtCoverDate(p.coleta))}</div><div class="line">TERMINAL: ${esc(p.terminal || '')}</div><div class="line">FREE TIME: ${esc(p.freetime ? `${p.freetime} dias` : '')}</div><div class="title">CARIMBOS</div><div class="stamp-line">LIBERADO: ${released ? 'X' : ''}</div><div class="stamp-line">AVERBADO:</div></section><section><div class="title">CHECK LIST</div><div class="line">ANALISTA: ${esc(p.analista || '')}</div><div class="line">DRAFT: ${esc(fmtCoverDate(p.envio))}</div><div class="line">VGM: ${deliveryVgm ? 'X' : ''}</div><div class="line">EMISSÃO DUE: ${esc(p.due ? fmtCoverDate(p.dueEmissao) : 'RUC MANUAL')}</div><div class="line">VENCIMENTO: ${esc(dueExpiry)}</div><div class="line">ISF/LACEY: ${esc(p.isfLacey || 'Não')}</div><div class="line">OVAÇÃO: ${ovacao}</div><div class="title">CARIMBOS</div><div class="stamp-line">EMBARCADO:</div><div class="stamp-line">FECHADO:</div></section><section class="options"><div class="options-group"><strong class="options-title">TIPO DE BL:</strong><div class="option-row bl-row"><div>${typeBl.map(([label,value]) => mark(label, p.tipoBL === value)).join('')}</div><div class="inline-checks"><span>BL MASTER <i></i></span><span>HBL <i></i></span><span>BL FRETADO <i></i></span></div></div></div><div class="options-group"><strong class="options-title">FRETE:</strong><div class="option-row freight-row"><div>${freights.map(([label,value]) => mark(label, p.tipoFrete === value)).join('')}</div><div class="inline-checks"><strong class="certificate-title">CO:</strong><span>ACII <i></i></span><span>FIEP <i></i></span><span>MERCOSUL <i></i></span></div></div></div><strong class="mapa-label">MAPA ( ${hasMapa ? 'X' : ''} )</strong><br><br><strong>OBS:</strong></section></section><section class="info">${cell('BOOKING:',p.booking,'booking')}${cell('Nº DE BL:','', 'bl')}${cell('EXPORTADOR:',exporterDisplayName,'exporter')}${cell('FATURA:',p.fatura,'invoice')}${cell('CNPJ:',client.cnpj,'cnpj')}${cell('IMPORTADOR:',p.importador,'importer')}${cell('VALOR:',cargoValue,'value')}${cell('NAVIO:',p.navio,'vessel')}${cell('INCOTERM:',p.incoterm,'incoterm')}${cell('AGÊNCIA:',p.agencia,'agency')}${cell('DUE:',p.due,'due')}${cell('ARMADOR:',p.armador,'carrier')}${cell('RUC:',p.ruc,'ruc')}</section><div class="bar">MERCADORIAS A SEREM EMBARCADAS</div><section class="cargo">${cell('QUANTIDADE (PACOTES)',p.volumes)}${cell('M/3',p.metragem)}${cell('DESTINO',p.destino)}${cell('PESO LÍQUIDO',p.pesoLiquido ? `${p.pesoLiquido} kg` : '')}${cell('PESO BRUTO',p.pesoBruto ? `${p.pesoBruto} kg` : '')}${cell('CONTAINER(S)',containerSummary)}</section><table class="containers"><thead><tr><th>CONTAINER</th><th>TARA</th><th>LACRE</th><th>NOTA FISCAL</th>${hasMapa ? '<th>NOVO LACRE</th>' : ''}</tr></thead><tbody>${rows}</tbody></table><div class="foot">Capa gerada em ${new Date().toLocaleString('pt-BR')}</div></main></body></html>`;
        el('previewTitle').textContent = 'Prévia da capa do processo';
        el('pdfFrame').srcdoc = securePrintHtml(html);
        el('previewDialog').showModal();
      }
      function printCoverFromDocumentModel(p) {
        const frame = el('pdfFrame');
        frame.addEventListener('load', () => {
          const doc = frame.contentDocument;
          if (!doc) return;
          const style = doc.createElement('style');
          style.nonce = cspNonce;
          style.textContent = `
            .title,.bar,.containers th,.options-title,.certificate-title,.process-data-title{background:#e8e8e8!important;color:#000!important}
            *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{font-size:11px!important}.title,.bar,.process-data-title{font-size:12px!important;font-weight:bold!important;text-align:center!important;letter-spacing:.25px}
            .line,.stamp-line{font-size:11px!important}.options{font-size:10.4px!important}.inline-checks{font-size:9.8px!important}
            .field{padding:1.6mm 2mm!important}.field b{font-size:9.8px!important}.field span{font-size:11.4px!important;line-height:1.15!important}
            .exporter{display:flex!important;min-height:0!important;overflow:hidden!important;flex-direction:column!important;padding:.5mm 1.4mm!important}.exporter b{flex:0 0 auto!important;font-size:7.8px!important;line-height:1!important}.exporter span{display:block!important;min-height:0!important;max-height:none!important;margin-top:.1mm!important;overflow:hidden!important;overflow-wrap:break-word!important;word-break:normal!important;white-space:pre-line!important;font-size:10.8px!important;line-height:.92!important}
            .info{grid-template-rows:9mm repeat(5,10mm)!important}.cargo .field{height:12mm!important}
            .containers th{height:6mm!important;font-size:10.2px!important}.containers td{font-size:10px!important}
            .workflow{height:91mm!important}.workflow .stamp-line{height:14mm!important;padding:2mm!important;font-size:11px!important}
            .sheet{border:1px solid #000!important}.head{border-top:1px solid #000!important;border-bottom:1px solid #000!important}.head>div,.head h1{border-right:1px solid #000!important}
            .workflow{border-bottom:1px solid #000!important}.workflow section{border-right:1px solid #000!important}.title,.line,.stamp-line,.field,.process-data-title{border-color:#000!important;border-width:1px!important}
            .workflow{grid-template-columns:31% 34% 35%!important}.info{grid-template-columns:40% 22% 38%!important}.cargo{grid-template-columns:31% 34% 35%!important}
            .info{border-bottom:1px solid #000!important}.containers,.containers th,.containers td{border:1px solid #000!important}.stamps-unified{border:1px solid #000!important}
            .head{border-bottom:0!important}.workflow{border-top:1px solid #000!important;border-bottom:0!important}.process-data-title{border-top:1px solid #000!important;border-bottom:0!important}.info{border-top:1px solid #000!important;border-bottom:0!important}.bar{border-top:1px solid #000!important;border-bottom:0!important}.cargo{border-top:1px solid #000!important}
            .workflow .title[data-stamp-title]{border-bottom:0!important}.stamps-unified{border-top:0!important}
            .options-group{margin:0 0 1.3mm!important}.options-title{display:block!important;margin:0 0 .8mm!important;padding:.45mm .7mm!important}.bl-row .inline-checks{margin-top:0!important}.options .mark{justify-content:flex-start!important}.freight-row .inline-checks{grid-template-columns:1fr!important}
            .workflow{position:relative}.workflow .title[data-stamp-title]{color:transparent!important;background:#fff!important}
            .stamps-unified{position:absolute;z-index:3;left:0;top:56mm;width:65%;height:7mm;padding:1.45mm;background:#e8e8e8;border-top:1px solid #000;border-bottom:1px solid #000;text-align:center;font:bold 12px "Times New Roman",Times,serif;letter-spacing:.25px}
            .process-data-title{height:7mm;padding:1.55mm 2mm;border-bottom:1px solid #000;font:bold 12px "Times New Roman",Times,serif}
          `;
          doc.head.append(style);
          const workflow = doc.querySelector('.workflow');
          const stampTitles = [...doc.querySelectorAll('.workflow .title')].filter(node => node.textContent.trim() === 'CARIMBOS');
          stampTitles.forEach(node => node.dataset.stampTitle = 'true');
          if (workflow && stampTitles.length === 2) {
            const stampTitle = doc.createElement('div');
            stampTitle.className = 'stamps-unified';
            stampTitle.textContent = 'CARIMBOS';
            workflow.append(stampTitle);
          }
          const info = doc.querySelector('.info');
          if (info && !doc.querySelector('.process-data-title')) {
            const title = doc.createElement('div');
            title.className = 'process-data-title';
            title.textContent = 'DADOS DO PROCESSO';
            info.before(title);
          }
        }, { once:true });
        printCoverFromDocumentModelBase(p);
      }
      el('printBtn').onclick = () => printCoverFromDocumentModel(Object.fromEntries(new FormData(form)));
      el('rows').onclick = e => { const pdf = e.target.closest('[data-pdf]'); if (pdf) { e.stopPropagation(); printCoverFromDocumentModel(data.find(p => p.id === pdf.dataset.pdf)); return; } const row = e.target.closest('tr'); if (row) open(data.find(p => p.id === row.dataset.id)); };
      restoreSession().finally(() => { if (!currentUser) el('loginDialog').showModal(); });
    })();
  
