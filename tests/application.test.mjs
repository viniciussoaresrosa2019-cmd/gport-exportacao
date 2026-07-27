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

test('sessão, CSRF, autorização e validação têm proteções regressivas', async () => {
  const server = await read('src/server.js');
  for (const required of [
    "const sessionCookie = 'gport_session'", 'httpOnly', "sameSite: 'strict'",
    'csrfProtection', "X-CSRF-Token", 'token_version', 'processEditorOnly',
    'validatedProcess', "limit: '256kb'", 'frame-ancestors', 'isStrongPassword',
    'script-src \'self\' \'nonce-${nonce}\'', 'Access-Control-Allow-Origin'
  ]) assert.ok(server.includes(required), `Proteção ausente: ${required}`);
  assert.match(server, /app\.post\('\/api\/users', authenticate, adminOnly/);
  assert.match(server, /O cadastro é feito somente por administradores/);
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

test('interface mantém a sintaxe JavaScript válida', async () => {
  const html = await read('public/index.html');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).join('\n');
  const result = spawnSync(process.execPath, ['--check'], { input: scripts, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || 'Falha de sintaxe na interface.');
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
    "app.patch('/api/users/:id', authenticate, adminOnly"
  ]) assert.ok(server.includes(route), `Rota sem proteção esperada: ${route}`);
  assert.match(server, /previous\.analyst_id !== req\.user\.sub/);
  assert.match(server, /app\.use\('\/api', csrfProtection\)/);
  assert.match(server, /Solicitação muito grande/);
  assert.match(server, /entity\.parse\.failed/);
  assert.match(server, /JSON inválido/);
});

test('listagem paginada e regra de leitura por função permanecem no servidor', async () => {
  const server = await read('src/server.js');
  assert.match(server, /const processReaderRoles = new Set\(\['admin', 'vgm', 'financeiro', 'liberacao'\]\)/);
  assert.match(server, /p\.analyst_id=\$3/);
  assert.ok(server.includes('LIMIT $${next} OFFSET $${next + 1}'));
  assert.match(server, /pagination: \{ limit, offset, total:/);
  assert.match(server, /processSearchFields/);
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
