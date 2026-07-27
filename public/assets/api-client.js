// Cliente da futura interface web. Nenhuma chave secreta deve ser adicionada aqui.
const baseUrl = window.ATLAS_API_URL || '/api';
const csrfToken = () => document.cookie.split('; ').find(value => value.startsWith('gport_csrf='))?.split('=').slice(1).join('') || '';

export async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(['POST', 'PATCH', 'DELETE'].includes(options.method || 'GET') ? { 'X-CSRF-Token': csrfToken() } : {}),
      ...(options.headers || {})
    }
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a operação.');
  return payload;
}
