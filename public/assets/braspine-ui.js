/* Estrutura estática da área Braspine, criada antes do runtime. */
(() => {
  const nav = document.querySelector('.side nav');
  const processNav = document.getElementById('processNav');
  if (nav && !document.getElementById('braspineNav')) {
    const link = document.createElement('a');
    link.id = 'braspineNav';
    link.href = '#braspine';
    link.hidden = true;
    link.innerHTML = '◫ &nbsp; Braspine';
    nav.insertBefore(link, processNav?.nextSibling || null);
  }

  const main = document.querySelector('.shell main');
  const processes = document.getElementById('processesPage');
  if (main && !document.getElementById('braspinePage')) {
    const section = document.createElement('section');
    section.id = 'braspinePage';
    section.hidden = true;
    section.innerHTML = `<div class="top"><div><p class="eyebrow">Processos Apenas DU-E</p><h1>Braspine</h1></div><button class="btn secondary" id="closeBraspineBtn" type="button">← Processos</button></div><p class="intro">Processos de exportadores classificados como Apenas DU-E.</p><div id="braspineList" class="panel scrollable-panel"></div>`;
    main.insertBefore(section, processes?.nextSibling || null);
  }
})();
