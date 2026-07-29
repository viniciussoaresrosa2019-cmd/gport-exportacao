import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('API possui as proteções essenciais de autenticação e processos', async () => {
  const server = await read('src/server.js');
  for (const required of [
    "app.post('/api/processes'", "app.patch('/api/processes/:id'",
    'loginLimit', 'processes_updated_at', 'processChanges',
    'Usuário inativo ou sessão expirada.'
  ]) assert.ok(server.includes(required), `Item obrigatório ausente: ${required}`);
});

test('API normaliza valores numéricos no formato brasileiro para contêineres', async () => {
  const server = await read('src/server.js');
  assert.match(server, /const normalizeBrazilianNumber = value =>/);
  assert.match(server, /text\.replaceAll\('\.', ''\)\.replace\(',', '\.'\)/);
  assert.match(server, /tare: cleanNonNegative\(item\.tare, 999999, 'Tara', \{ integer: true, required: true \}\)/);
  assert.match(await read('public/index.html'), /data-currency-value/);
  assert.match(await read('public/index.html'), /formatCurrencyValue/);
});

test('lançamento exige campos operacionais e dados individuais completos do contêiner', async () => {
  const server = await read('src/server.js');
  const html = await read('public/index.html');
  for (const required of ['isf_lacey', 'cleanRequiredDate', 'invoice_number', '4 letras e 7 dígitos', 'Informe os dados de todos os contêineres', 'cleanCnpj', '/^[.*]+$/']) {
    assert.ok(server.includes(required), `Validação obrigatória ausente: ${required}`);
  }
  for (const required of ['name="isfLacey"', 'name="exportadorCnpj"', 'name="notasFiscais"', 'data-nf', 'pattern="[A-Za-z]{4}[0-9]{7}"', 'Tipo de contêiner *', 'formatCnpj', 'form.checkValidity()']) {
    assert.ok(html.includes(required), `Campo obrigatório ausente: ${required}`);
  }
});

test('sessão, CSRF, autorização e validação têm proteções regressivas', async () => {
  const server = await read('src/server.js');
  for (const required of [
    "const sessionCookie = 'gport_session'", 'httpOnly', "sameSite: 'strict'",
    'csrfProtection', "X-CSRF-Token", 'token_version', 'processEditorOnly', 'processCreatorOnly',
    'validatedProcess', "limit: '256kb'", 'frame-ancestors', 'isStrongPassword',
    'script-src \'self\' \'nonce-${nonce}\'', 'Access-Control-Allow-Origin'
  ]) assert.ok(server.includes(required), `Proteção ausente: ${required}`);
  assert.match(server, /app\.post\('\/api\/users', authenticate, adminOnly/);
  assert.match(server, /O cadastro é feito somente por administradores/);
  assert.match(server, /verifyTurnstile/);
  assert.match(server, /turnstileAllowedHostnames/);
});

test('configuração do banco não aceita TLS inseguro remotamente', async () => {
  const db = await read('src/db.js');
  assert.match(db, /DB_SSL_REJECT_UNAUTHORIZED=false não é permitido em produção/);
  assert.match(db, /rejectUnauthorized: isProduction \? !allowUnverifiedTls/);
  assert.match(db, /DB_SSL_CA/);
  assert.match(db, /DB_SSL_CA_BASE64/);
  assert.match(db, /ALLOW_UNVERIFIED_DATABASE_TLS/);
  const migration = await read('database/migrations/2026-07-26-session-security.sql');
  assert.match(migration, /token_version/);
  assert.match(migration, /REVOKE ALL/);
});

test('CAPTCHA Turnstile é validado no servidor e não expõe a chave secreta', async () => {
  const server = await read('src/server.js');
  const html = await read('public/index.html');
  const env = await read('.env.example');
  assert.match(server, /turnstile\/v0\/siteverify/);
  assert.match(server, /TURNSTILE_SITE_KEY e TURNSTILE_SECRET_KEY devem ser configuradas juntas/);
  assert.match(html, /__TURNSTILE_SITE_KEY__/);
  assert.match(html, /initializeTurnstile/);
  assert.match(env, /TURNSTILE_SECRET_KEY=/);
});

test('interface mantém a sintaxe JavaScript válida', async () => {
  const html = await read('public/index.html');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).join('\n');
  const result = spawnSync(process.execPath, ['--check'], { input: scripts, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || 'Falha de sintaxe na interface.');
});

test('interface possui notificações toast acessíveis para ações principais', async () => {
  const html = await read('public/index.html');
  const css = await read('public/assets/gport.css');
  const toastCss = await read('public/assets/toasts.css');
  assert.match(html, /id="toastRegion"/);
  assert.match(html, /assets\/toasts\.css/);
  assert.match(html, /const toast = Object\.freeze\(/);
  for (const type of ['success', 'error', 'warning', 'info']) assert.match(html, new RegExp(`${type}: message => createToast`));
  assert.match(html, /toast\.success\('Login realizado com sucesso\.'/);
  assert.match(html, /toast\.success\('Status de VGM atualizado\.'/);
  assert.match(html, /toast\.success\('Status de liberação atualizado\.'/);
  assert.match(html, /toast\.warning\('Selecione qual dado deseja pesquisar\.'/);
  assert.match(css, /\.toast-region\{position:fixed/);
  assert.match(html, /toast__title/);
  assert.match(html, /toast__progress/);
  assert.match(toastCss, /body\.theme-dark #toastRegion \.toast/);
  assert.match(toastCss, /gport-toast-progress/);
  assert.match(toastCss, /#toastRegion\{[\s\S]*position:fixed/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(toastCss, /prefers-reduced-motion:reduce/);
});

test('migração de estabilidade está disponível', async () => {
  const migration = await read('database/migrations/2026-07-25-stability-security.sql');
  assert.match(migration, /processes_updated_at/);
  assert.match(migration, /pg_trgm/);
  assert.match(migration, /release_channel/);
});

test('pipeline de produção bloqueia segredos e dependências inseguras', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  const workflow = await read('.github/workflows/security.yml');
  const secretCheck = await read('scripts/check-secrets.mjs');
  assert.match(packageJson.scripts['security:check'], /npm audit --omit=dev --audit-level=high/);
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /test ! -f \.env/);
  assert.match(secretCheck, /URI PostgreSQL com senha/);
});

test('rotas sensíveis exigem autenticação, CSRF e autorização no servidor', async () => {
  const server = await read('src/server.js');
  for (const route of [
    "app.patch('/api/processes/:id', authenticate, processEditorOnly",
    "app.delete('/api/processes/:id', authenticate",
    "app.patch('/api/processes/:id/vgm', authenticate, vgmManagerOnly",
    "app.patch('/api/processes/:id/release', authenticate, releaseManagerOnly",
    "app.patch('/api/users/:id', authenticate, adminOnly",
    "app.delete('/api/clients/:id', authenticate, clientManagerOnly"
  ]) assert.ok(server.includes(route), `Rota sem proteção esperada: ${route}`);
  assert.match(server, /const processEditorOnly = \(_req, _res, next\) => next\(\)/);
  assert.match(server, /const processCreatorOnly = \(_req, _res, next\) => next\(\)/);
  assert.match(server, /app\.post\('\/api\/processes', authenticate, processCreatorOnly/);
  assert.match(server, /app\.use\('\/api', csrfProtection\)/);
  assert.match(server, /Solicitação muito grande/);
  assert.match(server, /entity\.parse\.failed/);
  assert.match(server, /JSON inválido/);
});

test('exclusão de exportador preserva processos vinculados', async () => {
  const server = await read('src/server.js');
  const html = await read('public/index.html');
  assert.match(server, /UPDATE clients SET active=false/);
  assert.match(server, /client\.deactivated/);
  assert.match(server, /ALTER TABLE clients ADD COLUMN IF NOT EXISTS active BOOLEAN/);
  assert.match(html, /exportador excluído/);
  assert.match(html, /class="btn secondary delete-client"/);
  assert.match(html, /Excluir o exportador/);
});

test('listagem paginada compartilha processos entre usuários autenticados', async () => {
  const server = await read('src/server.js');
  assert.match(server, /const canReadAllProcesses = \(\) => true/);
  assert.match(server, /const scope = ''/);
  assert.ok(server.includes('LIMIT $${next} OFFSET $${next + 1}'));
  assert.match(server, /pagination: \{ limit, offset, total:/);
  assert.match(server, /processSearchFields/);
});

test('atualização em tempo real respeita a autorização de leitura', async () => {
  const server = await read('src/server.js');
  const html = await read('public/index.html');
  assert.match(server, /app\.get\('\/api\/events', authenticate/);
  assert.match(server, /app\.get\('\/api\/processes\/:id', authenticate/);
  assert.match(server, /app\.get\('\/api\/realtime\/metrics', authenticate, adminOnly/);
  assert.match(server, /user => canReadAllProcesses\(user\)/);
  assert.match(server, /publishProcessChange\(result\.rows\[0\], 'vgm-updated'\)/);
  assert.match(server, /publishReferenceChange\('clients', 'updated'\)/);
  assert.match(html, /new EventSource\('\/api\/events'\)/);
  assert.match(html, /addEventListener\('process-changed'/);
  assert.match(html, /addEventListener\('reference-changed'/);
  assert.match(html, /realtimeRefreshTimer = setTimeout\(\(\) => applyProcessRealtimeChange\(event\), 120\)/);
  assert.match(html, /const realtimeFallbackIntervalMs = 60_000/);
  assert.match(html, /setTimeout\(startRealtimeFallback, 10_000\)/);
  assert.match(html, /request\(`\/api\/processes\/\$\{event\.id\}`\)/);
  assert.match(html, /if \(isNewProcess\) processPagination\.total \+= 1/);
  assert.match(html, /data = before; render\(\); renderVgm\(\); throw error;/);
  assert.match(html, /data = before; render\(\); renderRelease\(\); throw error;/);
});

test('VGM em draft ou enviado pelo cliente conta como enviado em todas as telas', async () => {
  const server = await read('src/server.js');
  const html = await read('public/index.html');
  assert.match(server, /IN \('Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT'\)/);
  assert.match(html, /\['Sim','Enviado pelo Cliente','Enviando no DRAFT'\]\.includes\(p\.vgmStatus\)/);
});

test('liberação permite filtrar por porto e ordena pelo deadline crescente', async () => {
  const html = await read('public/index.html');
  assert.match(html, /releasePortFilter='all'/);
  assert.match(html, /releasePortFilters/);
  assert.match(html, /data-release-port/);
  assert.match(html, /deadlineOrder\(a\) - deadlineOrder\(b\)/);
  assert.match(html, /Date\.parse\(p\.releaseDeadlineOrder/);
});

test('processos podem ser filtrados por cliente e ordenados por cliente e lançamento', async () => {
  const server = await read('src/server.js');
  const html = await read('public/index.html');
  assert.match(server, /const clientId = String\(req\.query\.client \|\| ''\)\.trim\(\)/);
  assert.match(server, /ORDER BY c\.name ASC,p\.created_at DESC,p\.id DESC/);
  assert.match(html, /processClientFilter='all'/);
  assert.match(html, /processClientFilters/);
  assert.match(html, /data-process-client/);
  assert.match(html, /searchParams\.set\('client', processClientFilter\)/);
  assert.match(html, /String\(a\.exportador\|\|''\)\.localeCompare/);
});

test('processos históricos não somem quando referências falham e qualquer usuário autenticado pode cadastrar exportador', async () => {
  const server = await read('src/server.js');
  const html = await read('public/index.html');
  assert.match(server, /app\.post\('\/api\/clients', authenticate, clientCreatorOnly/);
  assert.match(server, /FROM processes p LEFT JOIN clients c ON c\.id=p\.client_id LEFT JOIN users u ON u\.id=p\.analyst_id/);
  assert.match(html, /const remoteProcesses = await processRequest/);
  assert.match(html, /Promise\.allSettled\(\[\s*request\('\/api\/clients'\), request\('\/api\/assignees'\)/);
});

test('cadastro de exportador reativa registro excluído e trata duplicidade sem erro interno', async () => {
  const server = await read('src/server.js');
  assert.match(server, /SELECT id,active FROM clients WHERE LOWER\(name\)=LOWER\(\$1\) LIMIT 1/);
  assert.match(server, /client\.reactivated/);
  assert.match(server, /error\?\.code === '23505'/);
});

test('canal verde libera o processo automaticamente no servidor e na interface', async () => {
  const server = await read('src/server.js');
  const html = await read('public/index.html');
  assert.match(server, /const releaseStatus = releaseChannel === 'Verde' \? 'Sim' : requestedReleaseStatus/);
  assert.match(html, /if \(releaseChannel === 'Verde'\) \{ releaseStatus = 'Sim'/);
});

test('edição preserva o identificador técnico único do processo', async () => {
  const server = await read('src/server.js');
  assert.match(server, /body\.processNumber = previous\.process_number/);
  assert.match(server, /identificador técnico, único e não editável/);
});

test('interface reutiliza dados de referência entre paginação e filtros', async () => {
  const html = await read('public/index.html');
  assert.match(html, /const referenceDataTtlMs = 5 \* 60 \* 1000/);
  assert.match(html, /refreshData\(\{ append=false, refreshReferenceData=false \} = \{\}\)/);
  assert.match(html, /const needsReferenceData = refreshReferenceData \|\| Date\.now\(\) >= referenceDataCache\.expiresAt/);
  assert.match(html, /refreshData\(\{ refreshReferenceData:true \}\)/);
});

test('rate limit distribuído tem fallback local e não exige segredo no cliente', async () => {
  const server = await read('src/server.js');
  const env = await read('.env.example');
  assert.match(server, /RATE_LIMIT_REDIS_REST_URL/);
  assert.match(server, /localRateIncrement/);
  assert.match(server, /AbortSignal\.timeout\(1200\)/);
  assert.match(env, /RATE_LIMIT_REDIS_REST_TOKEN=/);
  assert.match(env, /ENTRA_CLIENT_SECRET=/);
});

test('documentação operacional de backup, Entra e menor privilégio existe', async () => {
  assert.match(await read('docs/BACKUP_AND_RESTORE.md'), /Restauração de teste trimestral/);
  assert.match(await read('docs/ENTRA_ID_SETUP.md'), /Authorization Code Flow \+ PKCE/);
  assert.match(await read('database/plans/least-privilege-api-role.sql'), /NÃO EXECUTE DIRETAMENTE EM PRODUÇÃO/);
});

test('capa do processo segue o modelo operacional com checklist e grade de contêineres', async () => {
  const html = await read('public/index.html');
  assert.match(html, /function printCoverFromDocumentModel\(p\)/);
  assert.match(html, /DEADLINES \/ PRAZOS/);
  assert.match(html, /CHECK LIST/);
  assert.match(html, /MERCADORIAS A SEREM EMBARCADAS/);
  assert.match(html, /EMISSÃO DUE:/);
  assert.match(html, /VENCIMENTO:/);
  assert.match(html, /<th>NOTA FISCAL<\/th>/);
  assert.match(html, /const exporterName = client\.nome \|\| p\.exportador \|\| ''/);
  assert.match(html, /cell\('EXPORTADOR:',exporterName,'exporter'\)/);
  assert.match(html, /NOVO LACRE/);
});
