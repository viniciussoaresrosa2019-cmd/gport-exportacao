/* Cliente HTTP compartilhado da interface GPORT. */
(() => {
  const csrfToken = () => document.cookie
    .split('; ')
    .find(value => value.startsWith('gport_csrf='))
    ?.split('=')
    .slice(1)
    .join('') || '';

  const mutationMethods = new Set(['POST', 'PATCH', 'DELETE']);
  const transientStatuses = new Set([502, 503, 504]);
  const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

  const create = ({ isAuthenticated = () => false, onUnauthorized = () => {} } = {}) => async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    let response;
    const attempts = method === 'GET' ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        response = await fetch(url, {
          ...options,
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            ...(mutationMethods.has(method) ? { 'X-CSRF-Token': csrfToken() } : {}),
            ...(options.headers || {})
          }
        });
        if (!transientStatuses.has(response.status) || attempt === attempts - 1) break;
      } catch (cause) {
        if (attempt === attempts - 1) {
          const error = new Error('Não foi possível comunicar com o sistema. Verifique a conexão e tente novamente.');
          error.status = 0;
          error.cause = cause;
          throw error;
        }
      }
      await wait(350 * (attempt + 1));
    }
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || 'Não foi possível concluir a operação.');
      error.status = response.status;
      if (response.status === 401 && isAuthenticated() && !String(url).startsWith('/api/auth/')) onUnauthorized();
      throw error;
    }
    return body;
  };

  window.gportApi = { create };
})();
