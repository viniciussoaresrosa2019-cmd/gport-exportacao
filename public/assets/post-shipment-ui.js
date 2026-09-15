/* Estrutura estática da aba de Pós-embarque, criada antes do runtime. */
(() => {
  const nav = document.querySelector('.side nav');
  const releaseNav = document.getElementById('releaseNav');
  if (nav && !document.getElementById('postShipmentNav')) {
    const link = document.createElement('a');
    link.id = 'postShipmentNav';
    link.href = '#pos-embarque';
    link.hidden = true;
    link.innerHTML = '◷ &nbsp; Pós-embarque';
    nav.insertBefore(link, releaseNav?.nextSibling || null);
  }

  const main = document.querySelector('.shell main');
  const followup = document.getElementById('followupPage');
  if (main && !document.getElementById('postShipmentPage')) {
    const section = document.createElement('section');
    section.id = 'postShipmentPage';
    section.hidden = true;
    section.innerHTML = `<div class="top"><div><p class="eyebrow">Operação de exportação</p><h1>Pós-embarque</h1></div><button class="btn secondary" id="closePostShipmentBtn" type="button">← Processos</button></div><p class="intro">Registre e acompanhe a data de embarque de cada processo.</p><div class="field compact-filter"><label for="postShipmentFilterSelect">Filtrar processos</label><select id="postShipmentFilterSelect"><option value="all">Todos os processos</option><option value="pending">Sem data de embarque</option><option value="shipped">Com data de embarque</option></select></div><div id="postShipmentList" class="panel scrollable-panel"></div>`;
    main.insertBefore(section, followup || null);
  }
})();
