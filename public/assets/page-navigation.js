/* Navegação visual compartilhada. Não contém regras de autorização ou dados. */
(() => {
  const pages = Object.freeze({
    processes:'processesPage',
    braspine:'braspinePage',
    vgm:'vgmPage',
    vgmReport:'vgmReportPage',
    release:'releasePage',
    postShipment:'postShipmentPage',
    followup:'followupPage',
    reports:'reportsPage'
  });
  const navigation = Object.freeze({
    processes:'processNav',
    braspine:'braspineNav',
    vgm:'vgmNav',
    vgmReport:'vgmReportNav',
    release:'releaseNav',
    postShipment:'postShipmentNav',
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
