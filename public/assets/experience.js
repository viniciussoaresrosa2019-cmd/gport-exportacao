/* Melhorias de experiência independentes da API: responsividade, navegação e feedback. */
(() => {
  const byId = id => document.getElementById(id);
  const labelsFor = table => [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
  const labelResponsiveTables = () => {
    document.querySelectorAll('#processesPage table, #vgmList table, #releaseList table, #followupPdfList table').forEach(table => {
      const labels = labelsFor(table);
      table.querySelectorAll('tbody tr').forEach(row => {
        if (row.classList.contains('client-group')) return;
        [...row.children].forEach((cell, index) => { if (labels[index]) cell.dataset.label = labels[index]; });
      });
    });
  };

  const enhanceProcessForm = () => {
    const form = byId('form');
    if (!form || form.dataset.experienceReady) return;
    form.dataset.experienceReady = 'true';
    const titles = [...form.querySelectorAll(':scope > .section-title')];
    if (!titles.length) return;
    const progress = document.createElement('div');
    progress.className = 'form-progress';
    progress.innerHTML = `<span>Preenchimento do processo</span><span class="form-progress__bar" aria-hidden="true">${titles.map((_, index) => `<i class="form-progress__step ${index === 0 ? 'is-active' : ''}"></i>`).join('')}</span><span>${titles.length} seções</span>`;
    form.insertBefore(progress, titles[0]);
    titles.forEach((title, index) => {
      const section = document.createElement('section');
      section.className = 'form-flow-section';
      section.setAttribute('aria-label', title.textContent.trim());
      title.dataset.step = String(index + 1);
      title.parentNode.insertBefore(section, title);
      let node = title;
      const stop = titles[index + 1] || form.querySelector('.actions');
      while (node && node !== stop) { const next = node.nextSibling; section.appendChild(node); node = next; }
    });
    const status = document.createElement('p');
    status.className = 'save-state'; status.dataset.state = 'saved'; status.textContent = 'Pronto para salvar';
    form.querySelector('.actions')?.before(status);
    form.addEventListener('input', () => { status.dataset.state = 'changed'; status.textContent = 'Alterações não salvas'; }, true);
    const saveButton = form.querySelector('button[type="submit"]');
    if (saveButton) new MutationObserver(() => {
      const saving = saveButton.disabled || /salvando/i.test(saveButton.textContent);
      status.dataset.state = saving ? 'saving' : 'saved';
      status.textContent = saving ? 'Salvando…' : 'Salvo';
    }).observe(saveButton, { attributes:true, childList:true, subtree:true, characterData:true });
  };

  const createMobileNav = () => {
    if (byId('mobileNav')) return;
    const original = document.querySelector('.side nav, .side');
    if (!original) return;
    const entries = [...original.querySelectorAll('a,button')].filter(item => item.id && /Nav$/.test(item.id));
    if (!entries.length) return;
    const nav = document.createElement('nav'); nav.id = 'mobileNav'; nav.className = 'mobile-nav'; nav.setAttribute('aria-label', 'Navegação principal');
    entries.forEach(item => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = item.textContent.trim();
      button.addEventListener('click', () => { item.click(); nav.querySelectorAll('button').forEach(b => b.classList.remove('is-active')); button.classList.add('is-active'); });
      nav.appendChild(button);
    });
    document.body.appendChild(nav);
  };

  const api = async (url, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (['POST', 'PATCH', 'DELETE'].includes(options.method)) {
      const csrf = document.cookie.split('; ').find(item => item.startsWith('gport_csrf='))?.split('=').slice(1).join('');
      if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf);
    }
    const response = await fetch(url, { credentials:'same-origin', ...options, headers });
    if (!response.ok) throw new Error('request-failed');
    return response.status === 204 ? null : response.json();
  };
  let dashboardLoaded = false;
  const dashboard = () => byId('dashboardPage');
  const formatDate = value => value ? new Date(value).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : 'Sem prazo';
  const makeDashboard = () => {
    if (dashboard()) return;
    const page = document.createElement('section');
    page.id = 'dashboardPage'; page.className = 'dashboard-page'; page.hidden = true;
    page.innerHTML = `<div class="top"><div><p class="eyebrow">Visão operacional</p><h1>Painel inicial</h1></div><button id="dashboardRefresh" type="button" class="btn secondary">Atualizar</button></div><p class="intro" id="dashboardIntro">Resumo das pendências mais relevantes para o seu perfil.</p><div id="dashboardKpis" class="dashboard-kpis" aria-busy="true"></div><div class="dashboard-grid"><article class="dashboard-card"><h2>Processos recentes</h2><p>Os últimos processos atualizados na sua visão.</p><div id="dashboardRecent" class="dashboard-list"></div></article><article class="dashboard-card"><h2>Status e atalhos</h2><p>Use os atalhos para continuar a operação.</p><div id="dashboardChannels" class="dashboard-list"></div><div class="dashboard-shortcuts"><button class="btn" type="button" data-dashboard-action="new">Novo processo</button><button class="btn secondary" type="button" data-dashboard-action="processes">Ver processos</button></div></article></div>`;
    document.querySelector('main')?.prepend(page);
    page.querySelector('#dashboardRefresh').onclick = loadDashboard;
    page.querySelectorAll('[data-dashboard-action]').forEach(button => button.onclick = () => {
      if (button.dataset.dashboardAction === 'new') byId('newBtn')?.click(); else byId('processNav')?.click();
    });
    const sideNav = document.querySelector('.side nav');
    if (sideNav && !byId('dashboardNav')) {
      const link = document.createElement('a'); link.id='dashboardNav'; link.href='#painel'; link.textContent='◫   Painel inicial';
      link.addEventListener('click', event => { event.preventDefault(); showDashboard(); }); sideNav.prepend(link);
    }
  };
  const loadDashboard = async () => {
    makeDashboard();
    const page = dashboard(); if (!page) return;
    const kpis = byId('dashboardKpis'); kpis.setAttribute('aria-busy','true');
    kpis.innerHTML = '<article class="dashboard-kpi"><span>Atualizando…</span><strong>—</strong></article>'.repeat(4);
    try {
      const payload = await api('/api/dashboard');
      const summary = payload.summary || {};
      const roleNames = { admin:'Administrador', analyst:'Analista', vgm:'VGM', liberacao:'Liberação', financeiro:'Financeiro' };
      byId('dashboardIntro').textContent = `Painel de ${roleNames[payload.role] || 'operação'} · dados carregados sob suas permissões.`;
      const cards = [
        ['Prazos hoje', summary.due_today || 0], ['Prazos próximos', summary.due_next_7_days || 0],
        ['VGM pendentes', summary.vgm_pending || 0], ['Liberações pendentes', summary.release_pending || 0]
      ];
      kpis.innerHTML = cards.map(([label, value]) => `<article class="dashboard-kpi"><span>${label}</span><strong>${value}</strong></article>`).join('');
      byId('dashboardRecent').replaceChildren(...(payload.recent || []).map(item => {
        const row = document.createElement('button'); row.type='button'; row.className='dashboard-row';
        row.innerHTML = `<strong></strong><span></span>`; row.querySelector('strong').textContent = item.booking || 'Sem booking'; row.querySelector('span').textContent = formatDate(item.deadline);
        row.onclick = () => { byId('processNav')?.click(); window.setTimeout(() => document.querySelector(`[data-id="${CSS.escape(item.id)}"]`)?.click(), 120); };
        return row;
      }));
      if (!(payload.recent || []).length) byId('dashboardRecent').innerHTML = '<p class="notification-empty">Nenhum processo recente.</p>';
      byId('dashboardChannels').replaceChildren(...(payload.channels || []).map(item => {
        const row = document.createElement('div'); row.className='dashboard-row'; row.innerHTML='<strong></strong><span></span>'; row.querySelector('strong').textContent=item.name; row.querySelector('span').textContent=`${item.total} processo(s)`; return row;
      }));
      if (!(payload.channels || []).length) byId('dashboardChannels').innerHTML = '<p class="notification-empty">Sem canais classificados.</p>';
      dashboardLoaded = true;
    } catch { kpis.innerHTML = '<article class="dashboard-kpi"><span>Não foi possível carregar o painel agora.</span><strong>—</strong></article>'; }
    finally { kpis.removeAttribute('aria-busy'); }
  };
  const showDashboard = () => {
    makeDashboard();
    const page = dashboard(); if (!page) return;
    document.querySelectorAll('main > section').forEach(section => { section.hidden = section !== page; });
    loadDashboard();
  };
  const makeNotifications = () => {
    if (byId('notificationToggle')) return;
    const button = document.createElement('button'); button.id='notificationToggle'; button.className='notification-toggle'; button.type='button'; button.setAttribute('aria-label','Abrir notificações'); button.innerHTML='◉<span id="notificationCount" class="notification-count"></span>';
    const panel = document.createElement('section'); panel.id='notificationPanel'; panel.className='notification-panel'; panel.hidden=true; panel.setAttribute('aria-label','Notificações'); panel.innerHTML='<div class="notification-panel__head"><h2>Notificações</h2><button class="close" type="button" aria-label="Fechar notificações">×</button></div><div id="notificationItems"></div>';
    button.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)loadNotifications();}; panel.querySelector('.close').onclick=()=>{panel.hidden=true;}; document.body.append(button,panel);
  };
  const loadNotifications = async () => {
    makeNotifications();
    try {
      const items = await api('/api/notifications'); const list = byId('notificationItems'); const unread = items.filter(item => !item.read_at).length;
      const count=byId('notificationCount'); count.textContent=unread>9?'9+':String(unread); count.classList.toggle('has-items',unread>0);
      list.replaceChildren(...items.map(item => {
        const element=document.createElement('button'); element.type='button'; element.className=`notification-item${item.read_at?' is-read':''}`;
        element.innerHTML='<strong></strong><span></span>'; element.querySelector('strong').textContent=item.title; element.querySelector('span').textContent=item.message;
        element.onclick=async()=>{ if(!item.read_at) { try{await api(`/api/notifications/${item.id}/read`,{method:'PATCH'});}catch{} } byId('notificationPanel').hidden=true; byId('processNav')?.click(); if(item.process_id) window.setTimeout(()=>document.querySelector(`[data-id="${CSS.escape(item.process_id)}"]`)?.click(),120); loadNotifications(); };
        return element;
      }));
      if(!items.length) list.innerHTML='<p class="notification-empty">Nenhuma notificação nova.</p>';
    } catch { /* migração indisponível ou sessão não autenticada: não exibir erro técnico */ }
  };
  const observer = new MutationObserver(labelResponsiveTables);
  document.addEventListener('DOMContentLoaded', () => {
    enhanceProcessForm(); createMobileNav(); makeDashboard(); makeNotifications(); labelResponsiveTables();
    const loginDialog = byId('loginDialog');
    if (loginDialog) new MutationObserver(() => {
      if (!loginDialog.open && !dashboardLoaded && byId('currentUserName')?.textContent !== 'Aguardando login') { showDashboard(); loadNotifications(); }
    }).observe(loginDialog, { attributes:true, attributeFilter:['open'] });
    byId('processNav')?.addEventListener('click', () => { if (dashboard()) dashboard().hidden = true; });
    window.addEventListener('gport:process-changed', () => { loadDashboard(); loadNotifications(); });
    window.setInterval(() => { if (!document.hidden) loadNotifications(); }, 90_000);
    observer.observe(document.body, { childList:true, subtree:true });
  });
})();
