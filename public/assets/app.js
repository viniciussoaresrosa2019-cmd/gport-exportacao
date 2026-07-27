const apiBaseUrl = window.ATLAS_API_URL || '/api';
const status = document.querySelector('#status');

document.querySelector('#apiStatus').addEventListener('click', async () => {
  status.textContent = 'Verificando conexão com a API…';
  try {
    const response = await fetch(`${apiBaseUrl}/health`);
    if (!response.ok) throw new Error('Resposta inválida');
    const data = await response.json();
    status.textContent = `API conectada: ${data.status || 'ok'}.`;
  } catch {
    status.textContent = 'API ainda não está disponível. A próxima etapa criará o servidor e o banco de dados.';
  }
});
