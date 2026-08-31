/* Navegação visual compartilhada. Não contém regras de autorização ou dados. */
(() => {
  const pages = Object.freeze({
    processes:'processesPage',
    vgm:'vgmPage',
    vgmReport:'vgmReportPage',
    release:'releasePage',
    followup:'followupPage',
    reports:'reportsPage'
  });
  const navigation = Object.freeze({
    processes:'processNav',
    vgm:'vgmNav',
    vgmReport:'vgmReportNav',
    release:'releaseNav',
    followup:'followupNav',
    reports:'reportsNav'
  });

  const activate = name => {
    if (!Object.hasOwn(pages, name)) throw new Error('Página desconhecida.');
    for (const [pageName, id] of Object.entries(pages)) {
      const page = document.getElementById(id);
      if (page) page.hidden = pageName !== name;
    }
    for (const [pageName, id] of Object.entries(navigation)) {
      document.getElementById(id)?.classList.toggle('active', pageName === name);
    }
  };

  window.gportPageNavigation = Object.freeze({ activate, pages, navigation });
})();

