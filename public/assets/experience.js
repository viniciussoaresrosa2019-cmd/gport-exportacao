/* Melhorias de experiência independentes da API: responsividade, navegação e feedback. */
(() => {
  const byId = id => document.getElementById(id);
  const labelsFor = table => [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
  const labelResponsiveTables = () => {
    // As tabelas são recriadas após filtros e atualizações em tempo real. A
    // semântica é aplicada aqui para que leitores de tela mantenham a relação
    // entre cada célula e o respectivo cabeçalho, inclusive no layout móvel.
    document.querySelectorAll('table').forEach((table, tableIndex) => {
      const headers = [...table.querySelectorAll('thead th')];
      headers.forEach((header, index) => {
        header.scope = 'col';
        if (!header.id) header.id = `gport-table-${tableIndex}-column-${index}`;
      });
      table.querySelectorAll('tbody tr').forEach(row => {
        if (row.classList.contains('client-group')) return;
        [...row.children].forEach((cell, index) => {
          if (headers[index]) cell.setAttribute('headers', headers[index].id);
        });
      });
    });
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
    // O formulário antigo foi mantido para preservar todos os nomes de campo e
    // validações. Esta camada só reorganiza seus elementos em seis etapas reais.
    const flow = [
      ['Processo', ['booking', 'fatura', 'analista', 'due', 'dueEmissao', 'ruc']],
      ['Exportador', ['exportador', 'exportadorCnpj', 'importador']],
      ['Rota', ['origem', 'destino', 'tipoEmbarque', 'navio', 'armador', 'agencia', 'prazo', 'envio', 'coleta', 'terminal', 'freetime', 'incoterm']],
      ['Documentos', ['tipoBL', 'tipoFrete', 'vistoriaMapa', 'isfLacey']],
      ['Carga', ['qtdContainers', 'tipoContainer', 'containers', 'metragem', 'pesoLiquido', 'pesoBruto', 'volumes', 'valor', 'moeda']],
      ['Revisão', []]
    ];
    const actions = form.querySelector(':scope > .actions');
    const anchor = form.querySelector(':scope > .section-title') || actions;
    if (!anchor) return;
    const progress = document.createElement('div');
    progress.className = 'form-progress';
    progress.innerHTML = `<div><strong>Lançamento de processo</strong><small id="processFlowStatus">Etapa 1 de ${flow.length}</small></div><div class="form-progress__bar" aria-hidden="true">${flow.map((_, index) => `<i class="form-progress__step ${index === 0 ? 'is-active' : ''}"></i>`).join('')}</div><button class="form-flow-mode" type="button" aria-pressed="false">Modo rápido</button>`;
    form.insertBefore(progress, anchor);
    const steps = flow.map(([title], index) => {
      const section = document.createElement('section');
      section.className = 'form-flow-section'; section.dataset.flowStep = String(index);
      section.setAttribute('aria-label', title);
      section.innerHTML = `<div class="form-flow-section__head"><div class="section-title" data-step="${index + 1}">${title}</div><button type="button" class="form-flow-toggle" aria-expanded="${index === 0 ? 'true' : 'false'}">${index === 0 ? 'Ocultar' : 'Mostrar'}</button></div><div class="grid form-flow-section__content"></div>`;
      form.insertBefore(section, actions);
      return section;
    });
    const findField = name => {
      const input = form.elements[name];
      if (!input) return null;
      // Quantidade, tipo e dados individuais formam uma única unidade. Manter
      // esse agrupamento permite ocultar toda a área quando o embarque for LCL.
      if (['qtdContainers', 'tipoContainer', 'containers'].includes(name)) return byId('containerFields');
      return input.closest('.field');
    };
    flow.forEach(([, names], index) => names.forEach(name => {
      const field = findField(name);
      if (field && !field.closest('[data-flow-step]')) steps[index].querySelector('.form-flow-section__content').appendChild(field);
    }));
    // Remove apenas os contêineres de seção esvaziados pela reorganização.
    form.querySelectorAll(':scope > .section-title, :scope > .grid').forEach(node => { if (!node.querySelector('.field, #containerFields, input:not([type="hidden"])')) node.remove(); });
    const review = steps.at(-1).querySelector('.form-flow-section__content');
    review.classList.add('form-review');
    review.innerHTML = '<p class="intro">Revise os campos obrigatórios e salve o processo. Nenhum dado é enviado antes de selecionar <strong>Salvar processo</strong>.</p><dl class="form-review__summary" id="processReviewSummary"></dl>';
    let activeStep = 0; let quickMode = false;
    const sectionInputs = section => [...section.querySelectorAll('input,select,textarea')].filter(input => !input.disabled && input.type !== 'hidden');
    const reviewValue = name => {
      const input = form.elements[name];
      const raw = String(input?.value || '').trim();
      if (!raw) return 'Não informado';
      if (input instanceof HTMLSelectElement) return input.selectedOptions[0]?.textContent?.trim() || raw;
      return raw;
    };
    const updateReview = () => {
      const pairs = [['BOOKING','booking'],['EXPORTADOR','exportador'],['ORIGEM','origem'],['NAVIO','navio'],['DEADLINE','prazo'],['FATURA','fatura']];
      const summary = byId('processReviewSummary'); if (!summary) return;
      summary.replaceChildren(...pairs.map(([label, name]) => { const group=document.createElement('div'); const term=document.createElement('dt'); const value=document.createElement('dd'); term.textContent=label; value.textContent=reviewValue(name); group.append(term,value); return group; }));
    };
    form.addEventListener('gport:review-update', updateReview);
    const updateFlow = () => {
      let invalid = 0;
      steps.forEach((section, index) => {
        const isActive = quickMode || index === activeStep;
        section.hidden = !isActive;
        sectionInputs(section).forEach(input => { if (input.required && !input.checkValidity()) invalid += 1; });
      });
      progress.querySelectorAll('.form-progress__step').forEach((item, index) => item.classList.toggle('is-active', quickMode || index <= activeStep));
      const status = byId('processFlowStatus'); if (status) status.textContent = quickMode ? `${flow.length} seções visíveis · ${invalid} pendência(s)` : `Etapa ${activeStep + 1} de ${flow.length} · ${invalid} pendência(s)`;
      updateReview();
    };
    const validateStep = index => {
      const invalid = sectionInputs(steps[index]).find(input => input.required && !input.checkValidity());
      if (!invalid) return true;
      invalid.focus({ preventScroll:true }); invalid.scrollIntoView({ behavior:'smooth', block:'center' }); invalid.reportValidity();
      return false;
    };
    steps.forEach((section, index) => {
      const toggle = section.querySelector('.form-flow-toggle');
      toggle.onclick = () => { if (quickMode) return; activeStep = index; updateFlow(); };
      const controls = document.createElement('div'); controls.className='form-flow-controls';
      if (index > 0) { const previous=document.createElement('button'); previous.type='button'; previous.className='btn secondary'; previous.textContent='← Anterior'; previous.onclick=()=>{activeStep=index-1;updateFlow();}; controls.append(previous); }
      if (index < steps.length-1) { const next=document.createElement('button'); next.type='button'; next.className='btn secondary'; next.textContent='Próxima →'; next.onclick=()=>{if(validateStep(index)){activeStep=index+1;updateFlow();}}; controls.append(next); }
      section.append(controls);
    });
    progress.querySelector('.form-flow-mode').onclick = event => { quickMode=!quickMode; event.currentTarget.setAttribute('aria-pressed',String(quickMode)); event.currentTarget.textContent=quickMode?'Usar etapas':'Modo rápido'; updateFlow(); };
    const status = document.createElement('p');
    status.className = 'save-state'; status.dataset.state = 'saved'; status.textContent = 'Pronto para salvar';
    form.querySelector('.actions')?.before(status);
    form.addEventListener('input', () => { status.dataset.state = 'changed'; status.textContent = 'Alterações não salvas'; updateFlow(); }, true);
    const saveButton = form.querySelector('button[type="submit"]');
    if (saveButton) new MutationObserver(() => {
      const saving = saveButton.disabled || /salvando/i.test(saveButton.textContent);
      status.dataset.state = saving ? 'saving' : 'saved';
      status.textContent = saving ? 'Salvando…' : 'Salvo';
    }).observe(saveButton, { attributes:true, childList:true, subtree:true, characterData:true });
    updateFlow();
  };

  const createMobileNav = () => {
    const original = document.querySelector('.side nav, .side');
    if (!original) return;
    // Recria o menu depois que o perfil for carregado: links ocultos para o
    // perfil atual e links auxiliares sem texto não podem virar botões móveis.
    const entries = [...original.querySelectorAll('a,button')].filter(item => item.id && /Nav$/.test(item.id) && !item.hidden && item.textContent.trim());
    if (!entries.length) return;
    const nav = byId('mobileNav') || document.createElement('nav');
    nav.id = 'mobileNav'; nav.className = 'mobile-nav'; nav.setAttribute('aria-label', 'Navegação principal'); nav.replaceChildren();
    entries.forEach(item => {
      const label = item.textContent.trim();
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.setAttribute('aria-label', label);
      button.addEventListener('click', () => { item.click(); nav.querySelectorAll('button').forEach(b => b.classList.remove('is-active')); button.classList.add('is-active'); });
      nav.appendChild(button);
    });
    if (!nav.isConnected) document.body.appendChild(nav);
  };

  const observer = new MutationObserver(labelResponsiveTables);
  document.addEventListener('DOMContentLoaded', () => {
    localStorage.removeItem('gport:process-draft:v2');
    enhanceProcessForm(); createMobileNav(); labelResponsiveTables();
    window.addEventListener('gport:role-tabs-updated', createMobileNav);
    observer.observe(document.body, { childList:true, subtree:true });
  });
})();
