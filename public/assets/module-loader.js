/* Carregamento sob demanda de áreas secundárias, com cache por sessão. */
(() => {
  const pending = new Map();
  const asset = name => document.querySelector(`meta[name="gport-${name}-asset"]`)?.content || '';

  const loadScript = ({ name, ready }) => {
    if (ready()) return Promise.resolve();
    if (pending.has(name)) return pending.get(name);
    const source = asset(name);
    if (!source) return Promise.reject(new Error(`O módulo ${name} não está configurado.`));
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.async = true;
      script.dataset.gportModule = name;
      script.onload = () => ready()
        ? resolve()
        : reject(new Error(`O módulo ${name} foi carregado, mas não iniciou corretamente.`));
      script.onerror = () => reject(new Error(`Não foi possível carregar o módulo ${name}.`));
      document.head.appendChild(script);
    }).catch(error => {
      pending.delete(name);
      document.querySelector(`script[data-gport-module="${name}"]`)?.remove();
      throw error;
    });
    pending.set(name, promise);
    return promise;
  };

  window.gportModules = {
    loadReports:() => loadScript({ name:'reports', ready:() => Boolean(window.gportReports) }),
    isLoaded:name => name === 'reports' && Boolean(window.gportReports)
  };
})();
