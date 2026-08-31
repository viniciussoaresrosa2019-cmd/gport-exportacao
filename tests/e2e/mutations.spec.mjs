import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

const baseUrl = process.env.E2E_BASE_URL || 'https://gport-exportacao-hml.onrender.com';
const safeTarget = /(^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$)|hml|staging|homolog/i.test(baseUrl);
const enabled = process.env.E2E_MUTATION_ENABLED === 'true' && safeTarget;
const analystCredentials = {
  username:process.env.E2E_ANALYST_USER,
  password:process.env.E2E_ANALYST_PASSWORD
};

const login = async (page, credentials) => {
  await page.goto('/');
  await expect(page.locator('#loginDialog')).toBeVisible();
  await page.locator('#loginForm [name="username"]').fill(credentials.username);
  await page.locator('#loginForm [name="password"]').fill(credentials.password);
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.getByRole('heading', { name:'Planilha de processos' })).toBeVisible();
};

const api = async (page, path, { method = 'GET', data, expected = [200] } = {}) => {
  const cookies = await page.context().cookies();
  const csrf = cookies.find(cookie => cookie.name === 'gport_csrf')?.value || '';
  const response = await page.request.fetch(path, {
    method,
    ...(data === undefined ? {} : { data }),
    headers:{ ...(method === 'GET' ? {} : { 'X-CSRF-Token':csrf }) }
  });
  expect(expected, `${method} ${path}: ${response.status()}`).toContain(response.status());
  return response.status() === 204 ? null : response.json();
};

test.describe.serial('mutações isoladas — homologação', () => {
  test.skip(!enabled || !analystCredentials.username || !analystCredentials.password,
    'Exige E2E_MUTATION_ENABLED=true, URL de homologação e credenciais isoladas fora do código.');

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const booking = `E2E-${suffix}`.toUpperCase();
  let client;
  let process;
  let processPayload;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page, analystCredentials);
    client = await api(page, '/api/clients', {
      method:'POST', expected:[201],
      data:{ name:`E2E ISOLADO ${suffix}`, country:'Brasil', dueOnly:true, rucManual:false, ovacao:false }
    });
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await login(page, analystCredentials);
      if (process?.id) await api(page, `/api/processes/${process.id}`, { method:'DELETE', expected:[204,404] });
      if (client?.id) await api(page, `/api/clients/${client.id}`, { method:'DELETE', expected:[204,404] });
    } finally {
      await page.close();
    }
  });

  test('criação, SSE, duplicidade, busca, paginação e edição', async ({ page }) => {
    await login(page, analystCredentials);
    await page.evaluate(() => {
      window.__e2eRealtimeEvents = [];
      window.__e2eRealtimeSource = new EventSource('/api/events');
      window.__e2eRealtimeSource.addEventListener('connected', () => window.__e2eRealtimeEvents.push({ type:'connected' }));
      window.__e2eRealtimeSource.addEventListener('process-changed', event => window.__e2eRealtimeEvents.push({ type:'process', ...JSON.parse(event.data) }));
    });
    await page.waitForFunction(() => window.__e2eRealtimeEvents?.some(event => event.type === 'connected'));

    const idempotencyKey = randomUUID();
    processPayload = {
      clientId:client.id,
      invoice:`INV-${suffix}`,
      booking,
      dueNumber:`DUE-${suffix}`,
      originPort:'ITAJAI',
      destinationPort:'HAMBURGO',
      vessel:'NAVIO E2E',
      containerQuantity:0,
      idempotencyKey
    };
    process = await api(page, '/api/processes', { method:'POST', expected:[201], data:processPayload });
    const duplicated = await api(page, '/api/processes', { method:'POST', expected:[200], data:processPayload });
    expect(duplicated.id).toBe(process.id);
    await page.waitForFunction(id => window.__e2eRealtimeEvents?.some(event => event.type === 'process' && event.id === id), process.id);

    const search = await api(page, `/api/processes?projection=summary&field=booking&search=${encodeURIComponent(`  ${booking.toLowerCase()}  `)}&limit=1&offset=0`);
    expect(search.items).toHaveLength(1);
    expect(search.items[0].id).toBe(process.id);
    expect(search.pagination.limit).toBe(1);
    expect(search.pagination.total).toBeGreaterThanOrEqual(1);

    processPayload.invoice = `INV-EDIT-${suffix}`;
    const edited = await api(page, `/api/processes/${process.id}`, {
      method:'PATCH', data:{ ...processPayload, idempotencyKey:undefined, updatedAt:process.updated_at }
    });
    expect(edited.invoice).toBe(processPayload.invoice.toUpperCase());
    process = edited;

    const forbiddenVgm = await page.request.patch(`/api/processes/${process.id}/vgm`, {
      data:{ vgmStatus:'Sim' },
      headers:{ 'X-CSRF-Token':(await page.context().cookies()).find(cookie => cookie.name === 'gport_csrf')?.value || '' }
    });
    expect(forbiddenVgm.status()).toBe(403);
  });

  test('rascunho operacional, follow up, anexo e notificações', async ({ page }) => {
    await login(page, analystCredentials);
    const prelaunch = await api(page, '/api/prelaunches', {
      method:'POST', expected:[201],
      data:{ clientId:client.id, booking:`PRE-${suffix}`, deadline:new Date(Date.now() + 86400000).toISOString().slice(0, 16) }
    });
    const prelaunches = await api(page, '/api/prelaunches');
    expect(prelaunches.some(item => item.id === prelaunch.id)).toBe(true);
    await api(page, `/api/prelaunches/${prelaunch.id}`, { method:'DELETE', expected:[204] });

    const followup = await api(page, `/api/processes/${process.id}/followup`, {
      method:'PATCH', data:{ followupStatus:'Concluído', followupNote:'VALIDAÇÃO E2E ISOLADA' }
    });
    expect(followup.followup_status).toBe('Concluído');

    const safePdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF').toString('base64');
    const attachment = await api(page, `/api/processes/${process.id}/attachments`, {
      method:'POST', expected:[201], data:{ fileName:'evidencia-e2e.pdf', mimeType:'application/pdf', contentBase64:safePdf }
    });
    expect(attachment.scan_status).toMatch(/approved|pending/);
    const attachments = await api(page, `/api/processes/${process.id}/attachments`);
    expect(attachments.some(item => item.id === attachment.id)).toBe(true);
    await api(page, `/api/processes/${process.id}/attachments/${attachment.id}`, { method:'DELETE', expected:[204] });
    expect(Array.isArray(await api(page, '/api/notifications'))).toBe(true);
  });

  test('perfis especializados atualizam somente suas áreas', async ({ page }) => {
    test.skip(!process.env.E2E_VGM_USER || !process.env.E2E_VGM_PASSWORD || !process.env.E2E_RELEASE_USER || !process.env.E2E_RELEASE_PASSWORD,
      'Defina credenciais isoladas de VGM e Liberação para validar permissões cruzadas.');
    await login(page, { username:process.env.E2E_VGM_USER, password:process.env.E2E_VGM_PASSWORD });
    const vgm = await api(page, `/api/processes/${process.id}/vgm`, {
      method:'PATCH', data:{ vgmStatus:'Sim', vgmSentTo:'E2E', physicalProcessAnalyst:'E2E' }
    });
    expect(vgm.vgm_status).toBe('Sim');
    await api(page, '/api/auth/logout', { method:'POST', expected:[204] });

    await login(page, { username:process.env.E2E_RELEASE_USER, password:process.env.E2E_RELEASE_PASSWORD });
    const release = await api(page, `/api/processes/${process.id}/release`, {
      method:'PATCH', data:{ releaseStatus:'Sim', vessel:'NAVIO E2E', releaseChannel:'Verde' }
    });
    expect(release.release_status).toBe('Sim');
  });

  test('falha de rede e sessão expirada mantêm recuperação explícita', async ({ page }) => {
    await login(page, analystCredentials);
    await page.route('**/api/processes?**', route => route.abort('failed'));
    await page.locator('#search').fill(booking);
    await page.locator('#filterBtn').click();
    await expect(page.locator('#toastRegion .toast--error').last()).toContainText(/Não foi possível|Failed to fetch|ação/i, { timeout:15_000 });
    await page.unroute('**/api/processes?**');

    await page.context().clearCookies();
    await page.locator('#filterBtn').click();
    await expect(page.locator('#loginDialog')).toBeVisible({ timeout:15_000 });
  });
});
