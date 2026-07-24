// Cliente da futura interface web. Nenhuma chave secreta deve ser adicionada aqui.
const baseUrl = window.ATLAS_API_URL || 'http://localhost:3000/api';

export async function api(path, options = {}) {
  const token = sessionStorage.getItem('atlas_export_token');
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a operação.');
  return payload;
}
