import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const interfaceFiles = [
  'public/index.html',
  'public/assets/login-view.js',
  'public/assets/ui-feedback.js',
  'public/assets/legacy-ui.js',
  'public/assets/app-runtime.js',
  'public/assets/post-shipment-ui.js',
  'public/assets/accessibility.js',
  'public/assets/experience.js',
  'public/assets/login-terminal-animation.js',
  'public/assets/login-water-motion.js',
  'public/assets/login-controls.js'
];
const readInterface = async () => (await Promise.all(interfaceFiles.map(read))).join('\n');

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
  assert.match(await readInterface(), /data-currency-value/);
  assert.match(await readInterface(), /formatCurrencyValue/);
});

test('lançamento exige campos operacionais e dados individuais completos do contêiner', async () => {
  const server = await read('src/server.js');
  const html = await readInterface();
  for (const required of ['isf_lacey', 'cleanRequiredDate', 'invoice_number', '4 letras e 7 dígitos', 'Informe os dados de todos os contêineres', 'cleanCnpj', '/^[.*]+$/']) {
    assert.ok(server.includes(required), `Validação obrigatória ausente: ${required}`);
  }
  for (const required of ['name="isfLacey"', 'name="exportadorCnpj"', 'name="notasFiscais"', 'data-nf', 'pattern="[A-Za-z]{4}[0-9]{7}"', 'Tipo de contêiner *', 'formatCnpj', 'form.checkValidity()']) {
    assert.ok(html.includes(required), `Campo obrigatório ausente: ${required}`);
  }
});

test('coleta, free time e novo lacre MAPA são opcionais no lançamento', async () => {
  const server = await read('src/server.js');
  const index = await read('public/index.html');
  const runtime = await read('public/assets/app-runtime.js');
  assert.match(index, /name="coleta" placeholder="dd\/mm" inputmode="numeric">/);
  assert.match(index, /name="terminal">/);
  assert.match(index, /name="freetime" type="number" min="0">/);
  assert.match(server, /containerCollectionDate: dueOnly \? null : cleanOptionalDate\(raw\.containerCollectionDate, 'Data da coleta'\)/);
  assert.match(server, /collectionTerminal: cleanText\(raw\.collectionTerminal, 160, 'Terminal da coleta'\)/);
  assert.match(server, /freeTimeDays: cleanNonNegative\(raw\.freeTimeDays, 3650, 'Free time', \{ integer: true \}\)/);
  assert.match(server, /new_seal: mapaInspection \? upperText\(cleanText\(item\.new_seal, 80, 'Novo lacre'\)\) : null/);
  assert.match(runtime, /makeMapaSealOptional/);
});

test('deadline de draft exige horário e preserva dia e mês na capa', async () => {
  const index = await read('public/index.html');
  const runtime = await read('public/assets/app-runtime.js');
  const server = await read('src/server.js');
  const migration = await read('database/add-deadline-time.sql');
  assert.match(index, /name="prazo" placeholder="dd\/mm hh:mm"[^>]*maxlength="11"[^>]*required/);
  assert.match(runtime, /attachDateMask\('prazo', true\)/);
  assert.match(runtime, /dateForDatabase\(p\.prazo, true\)/);
  assert.match(runtime, /prazo:dateForField\(p\.deadline, true\)/);
  assert.match(runtime, /DRAFT: \$\{esc\(fmtCoverDate\(p\.prazo, true\)\)\}/);
  assert.match(runtime, /const brazilian = raw\.match/);
  assert.match(await read('public/assets/legacy-ui.js'), /fmtDate\(p\.prazo,true\)/);
  assert.match(server, /const cleanRequiredDateTime = \(value, field\) =>/);
  assert.match(server, /deadline: dueOnly \? null : cleanRequiredDateTime\(raw\.deadline, 'Deadline de draft'\)/);
  assert.match(server, /ALTER COLUMN deadline TYPE TIMESTAMP WITHOUT TIME ZONE USING deadline::timestamp/);
  assert.match(migration, /ALTER COLUMN deadline TYPE TIMESTAMP WITHOUT TIME ZONE/);
});

test('lançamento novo é idempotente contra clique duplo, timeout ou reenvio', async () => {
  const server = await read('src/server.js');
  const html = await readInterface();
  const migration = await read('database/migrations/2026-08-02-process-idempotency.sql');
  assert.match(server, /const idempotencyKey = body\.idempotencyKey/);
  assert.match(server, /WHERE p\.idempotency_key=\$1/);
  assert.match(server, /analyst_id,idempotency_key\) VALUES/);
  assert.match(html, /newProcessIdempotencyKey/);
  assert.match(html, /payload\.idempotencyKey/);
  assert.match(migration, /processes_idempotency_key_unique_idx/);
});

test('embarque LCL oculta contêineres e mantém os dados consolidados da carga', async () => {
  const server = await read('src/server.js');
  const html = await readInterface();
  const css = await read('public/assets/experience.css');
  assert.match(html, /el\('containerFields'\)\.hidden = isLcl/);
  assert.match(html, /querySelectorAll\('input,select'\)\.forEach\(input => \{ input\.disabled = isLcl; \}\)/);
  assert.match(html, /\['qtdContainers', 'tipoContainer', 'containers'\]\.includes\(name\)\) return byId\('containerFields'\)/);
  assert.match(css, /\.container-fields\[hidden\]\{display:none!important\}/);
  assert.match(server, /const containerQuantity = shipmentType === 'LCL' \? null/);
  assert.match(server, /result\.containerDetails = shipmentType === 'LCL' \? \[\]/);
  for (const field of ['name="metragem"', 'name="pesoLiquido"', 'name="pesoBruto"', 'name="volumes"']) assert.ok(html.includes(field));
});

test('novo lançamento não reaproveita o ID de um processo aberto anteriormente', async () => {
  const html = await readInterface();
  assert.match(html, /editingProcessId = null;/);
  assert.match(html, /form\.elements\.id\.value = '';/);
  assert.match(html, /el\('newBtn'\)\.onclick = async \(\) =>/);
  assert.match(html, /ensureSessionActive\(\{ force:true \}\)/);
  assert.match(html, /const processIdFromForm = \(\) => String\(editingProcessId \|\| ''\)\.trim\(\);/);
  assert.match(html, /if \(!processId\) values\.id = '';/);
});

test('novo lançamento limpa completamente os contêineres do processo anterior', async () => {
  const runtime = await read('public/assets/app-runtime.js');
  assert.match(runtime, /const resetNewProcessContainerState = \(\) =>/);
  for (const field of ['qtdContainers', 'tipoContainer', 'containers', 'tara', 'lacre', 'lacreNovo', 'notasFiscais']) {
    assert.match(runtime, new RegExp(`['"]${field}['"]`));
  }
  assert.match(runtime, /if \(input\.type === 'hidden'\) input\.defaultValue = '';/);
  assert.match(runtime, /el\('containerDetails'\)\.replaceChildren\(\);/);
  assert.match(runtime, /resetNewProcessContainerState\(\);/);
});

test('RUC manual dispensa DU-E somente para o exportador marcado', async () => {
  const server = await read('src/server.js');
  const html = await readInterface();
  assert.match(server, /ruc_manual BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(server, /required: !rucManual/);
  assert.match(server, /processClientSettings/);
  assert.match(html, /name="rucManual" type="checkbox"/);
  assert.match(html, /rucManual: c\.ruc_manual === true/);
  assert.match(html, /data-due-label/);
});

test('cadastro do exportador controla Sim ou Não no campo Ovação da capa', async () => {
  const server = await read('src/server.js');
  const index = await read('public/index.html');
  const runtime = await read('public/assets/app-runtime.js');
  const projections = await read('src/process-projections.js');
  const migration = await read('database/migrations/2026-08-12-client-ovacao.sql');
  assert.match(index, /id="clientOvacao" name="ovacao" type="checkbox"/);
  assert.match(index, /class="client-options-row"/);
  assert.match(await read('public/assets/experience.css'), /\.client-options-row\{grid-column:span 2;display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(server, /ovacao: body\.ovacao === true/);
  assert.match(server, /ADD COLUMN IF NOT EXISTS ovacao BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(projections, /COALESCE\(c\.ovacao,false\) AS client_ovacao/);
  assert.match(runtime, /ovacao: c\.ovacao === true/);
  assert.match(runtime, /ovacao:v\.ovacao === 'on'/);
  assert.match(runtime, /const ovacao = \(client\.ovacao \?\? p\.ovacao\) === true \? 'Sim' : 'Não'/);
  assert.match(runtime, /OVAÇÃO: \$\{ovacao\}/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS ovacao BOOLEAN NOT NULL DEFAULT FALSE/);
});

test('exportador Apenas DU-E restringe o lançamento ao conjunto operacional mínimo', async () => {
  const server = await read('src/server.js');
  const html = await readInterface();
  const migration = await read('database/migrations/2026-08-02-apenas-due.sql');
  assert.match(server, /due_only/);
  assert.match(server, /RUC manual e Apenas DU-E não podem ser usados juntos/);
  assert.match(server, /\{ rucManual = false, dueOnly = false \}/);
  assert.match(html, /Apenas DU-E/);
  assert.match(html, /syncDueOnlyLaunchFields/);
  assert.match(html, /const dueOnlyFieldNames = \['importador', 'ruc', 'tipoEmbarque'/);
  assert.doesNotMatch(html, /const dueOnlyFieldNames = \[[^\]]*'origem'[^\]]*\]/);
  assert.doesNotMatch(html, /const dueOnlyFieldNames = \[[^\]]*'destino'[^\]]*\]/);
  assert.match(server, /originPort: cleanText\(raw\.originPort, 120, 'Porto de origem', \{ required: true \}\), destinationPort: cleanText\(raw\.destinationPort, 120, 'Porto de destino', \{ required: true \}\)/);
  assert.match(html, /containerType:dueOnly \? 'NÃO INFORMADO'/);
  assert.match(migration, /ALTER COLUMN deadline DROP NOT NULL/);
});

test('dados operacionais são padronizados em maiúsculas sem alterar e-mail', async () => {
  const server = await read('src/server.js');
  const html = await readInterface();
  assert.match(server, /const upperText = value => typeof value === 'string' \? value\.toLocaleUpperCase\('pt-BR'\) : value/);
  assert.match(server, /email: cleanText\(body\.email, 160, 'E-mail'\)/);
  assert.match(html, /const normalizeUppercaseInput = input => \{ input\.value = input\.value\.toLocaleUpperCase\('pt-BR'\); \}/);
});

test('edição restaura o porto de origem mesmo quando o banco o normaliza em maiúsculas', async () => {
  const html = await readInterface();
  assert.match(html, /const normalizedPort = value => String\(value \|\| ''\)/);
  assert.match(html, /normalize\('NFD'\)/);
  assert.match(html, /const restoreOriginPort = value =>/);
  assert.match(html, /else \{\s*restoreOriginPort\(p\.origem\);/);
  assert.match(html, /const legacyOption = new Option\(origin, origin, false, true\)/);
});

test('sessão, CSRF, autorização e validação têm proteções regressivas', async () => {
  const server = await read('src/server.js');
  for (const required of [
    "const sessionCookie = 'gport_session'", 'httpOnly', "sameSite: 'strict'",
    'csrfProtection', "X-CSRF-Token", 'token_version', 'processEditorOnly', 'processCreatorOnly',
    'validatedProcess', "limit: '6mb'", 'frame-ancestors', 'isStrongPassword',
    'script-src \'self\' \'nonce-${nonce}\'', 'Access-Control-Allow-Origin'
  ]) assert.ok(server.includes(required), `Proteção ausente: ${required}`);
  assert.match(server, /app\.post\('\/api\/users', authenticate, adminOnly/);
  assert.match(server, /O cadastro é feito somente por administradores/);
  assert.match(server, /verifyTurnstile/);
  assert.match(server, /turnstileAllowedHostnames/);
});

test('administrador redefine senha por formulário confirmado e rota protegida', async () => {
  const server = await read('src/server.js');
  const html = await readInterface();
  assert.match(server, /app\.patch\('\/api\/users\/:id', authenticate, adminOnly/);
  assert.match(server, /password_hash=COALESCE/);
  assert.match(server, /token_version=token_version \+ CASE WHEN \$4 IS NULL AND \$2 IS NULL THEN 0 ELSE 1 END/);
  assert.match(html, /id="passwordResetDialog"/);
  assert.match(html, /id="passwordResetForm"/);
  assert.match(html, /const openPasswordReset = user =>/);
  assert.match(html, /values\.password !== values\.confirmPassword/);
  assert.match(html, /api\/users\/\$\{values\.userId\}/);
});

test('usuário pode acumular no máximo duas funções sem perder a função principal legada', async () => {
  const server = await read('src/server.js');
  const migration = await read('database/migrations/2026-09-14-001-user-multiple-roles.sql');
  const runtime = await read('public/assets/app-runtime.js');
  const legacy = await read('public/assets/legacy-ui.js');
  assert.match(server, /const normalizeRoles = \(value, fallback = 'analyst'\)/);
  assert.match(server, /roles\.length > 2/);
  assert.match(server, /roles && \$1::varchar\[\]/);
  assert.match(server, /roles @> ARRAY\['analyst'\]::varchar\[\]/);
  assert.match(migration, /cardinality\(roles\) BETWEEN 1 AND 2/);
  assert.match(migration, /sync_user_primary_role/);
  assert.match(runtime, /currentHasRole/);
  assert.match(runtime, /JSON\.stringify\(\{ roles \}\)/);
  assert.match(legacy, /Até 2 funções/);
});

test('criação de usuário mantém referência ao formulário após requisições assíncronas', async () => {
  const html = await readInterface();
  assert.match(html, /const userForm = e\.currentTarget;/);
  assert.match(html, /new FormData\(userForm\)/);
  assert.match(html, /userForm\.reset\(\); toast\.success\('Usuário criado com sucesso\.'/);
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
  const html = await readInterface();
  const env = await read('.env.example');
  assert.match(server, /turnstile\/v0\/siteverify/);
  assert.match(server, /TURNSTILE_SITE_KEY e TURNSTILE_SECRET_KEY devem ser configuradas juntas/);
  assert.match(html, /__TURNSTILE_SITE_KEY__/);
  assert.match(html, /initializeTurnstile/);
  assert.match(env, /TURNSTILE_SECRET_KEY=/);
});

test('interface mantém a sintaxe JavaScript válida', async () => {
  for (const file of interfaceFiles.filter(item => item.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check'], { input: await read(file), encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr || 'Falha de sintaxe na interface.'}`);
  }
});

test('interface possui notificações toast acessíveis para ações principais', async () => {
  const html = await readInterface();
  const css = await read('public/assets/gport.css');
  const toastCss = await read('public/assets/toasts.css');
  assert.match(html, /id="toastRegion"/);
  assert.match(html, /assets\/toasts\.css/);
  assert.match(html, /const toast = Object\.freeze\(/);
  for (const type of ['success', 'error', 'warning', 'info']) assert.match(html, new RegExp(`${type}: message => createToast`));
  assert.match(html, /toast\.success\('Login realizado com sucesso\.'/);
  assert.match(html, /toast\.success\('Status de VGM atualizado\.'/);
  assert.match(html, /toast\.success\('Status de liberação atualizado\.'/);
  assert.match(html, /toast\.warning\('Selecione um campo para buscar\.'/);
  assert.match(toastCss, /#toastRegion\{[\s\S]*position:fixed/);
  assert.match(toastCss, /#toastRegion \.toast\{[\s\S]*pointer-events:none/);
  assert.match(toastCss, /\.toast__close\{[\s\S]*pointer-events:auto/);
  assert.match(html, /toast__title/);
  assert.match(html, /toast__progress/);
  assert.match(toastCss, /body\.theme-dark #toastRegion \.toast/);
  assert.match(toastCss, /gport-toast-progress/);
  assert.match(toastCss, /#toastRegion\{[\s\S]*position:fixed/);
  assert.match(toastCss, /prefers-reduced-motion:reduce/);
});

test('VGM e Liberação refletem alterações imediatamente sem depender da troca de aba', async () => {
  const html = await readInterface();
  assert.match(html, /const updateVisibleProcess = \(name, id, patch/);
  assert.match(html, /state\.items = state\.items\.map\(item => item\.id === id \? \{ \.\.\.item, \.\.\.patch \} : item\)/);
  assert.match(html, /updateVisibleProcess\('vgm', id, \{ vgmStatus:status/);
  assert.match(html, /updateVisibleProcess\('release', id, \{ liberacaoStatus:releaseStatus/);
  assert.match(html, /enqueueProcessMutation\(id, \(\) => request\(`\/api\/processes\/\$\{id\}\/vgm`/);
  assert.match(html, /enqueueProcessMutation\(id, \(\) => request\(`\/api\/processes\/\$\{id\}\/release`/);
  assert.match(html, /saveReleaseRow\(id, \{ renderView:false \}\)/);
  assert.match(html, /localProcessMutationQuietUntil\.get\(event\.id\)/);
});

test('HTML inicial referencia scripts externos e não mantém estilos ou eventos inline', async () => {
  const html = await read('public/index.html');
  assert.match(html, /<link rel="icon" type="image\/png" sizes="256x256" href="favicon-gport-black-256\.png\?v=[0-9.]+">/);
  assert.match(html, /assets\/ui-feedback\.js\?v=[0-9.]+" defer/);
  assert.match(html, /assets\/legacy-ui\.js\?v=[0-9.]+" defer/);
  assert.match(html, /assets\/app-runtime\.js\?v=[0-9.]+" defer/);
  assert.match(html, /assets\/accessibility\.js\?v=[0-9.]+" defer/);
  assert.match(html, /assets\/experience\.js\?v=[0-9.]+" defer/);
  assert.doesNotMatch(html, /\sstyle="/i);
  assert.doesNotMatch(html, /\son(?:click|change|input|submit)="/i);
  assert.ok(Buffer.byteLength(html, 'utf8') < 31_000, 'HTML inicial voltou a crescer acima do limite de 31 KB.');
});

test('interface disponibiliza busca global, ajuda rápida e calendário semanal', async () => {
  const html = await read('public/index.html');
  const runtime = await read('public/assets/app-runtime.js');
  assert.match(html, /id="globalSearchBtn"/);
  assert.match(html, /id="helpDialog"/);
  assert.match(html, /id="calendarView"/);
  assert.match(runtime, /calendarWeekValue/);
  assert.match(runtime, /globalSearchForm/);
  assert.match(runtime, /searchField'\)\.value = 'todos'/);
});

test('interface associa labels, nomeia controles e permite abrir processos pelo teclado', async () => {
  const accessibility = await read('public/assets/accessibility.js');
  const css = await read('public/assets/gport.css');
  assert.match(accessibility, /label\.htmlFor = control\.id/);
  const html = await read('public/index.html');
  assert.match(html, /role="group" aria-labelledby="visibleColumnsLabel"/);
  assert.doesNotMatch(html, /<label>Colunas visíveis<\/label>/);
  const runtime = await read('public/assets/app-runtime.js');
  assert.match(runtime, /label\.htmlFor = 'clientDueOnly'/);
  assert.match(runtime, /id="clientDueOnly" name="dueOnly"/);
  assert.match(accessibility, /row\.tabIndex = 0/);
  assert.match(accessibility, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(accessibility, /\.indicator-cell[\s\S]*status-text/);
  assert.match(css, /\.indicator-cell \.status-text/);
  assert.match(css, /\.clickable:focus-visible/);
});

test('indicadores de VGM usam o mesmo alinhamento horizontal da Liberação', async () => {
  const css = await read('public/assets/gport.css');
  assert.match(css, /\.indicator-cell\{min-width:108px;white-space:nowrap\}/);
  assert.match(css, /\.indicator-cell \.status-text\{display:inline-block;margin-left:7px/);
  assert.doesNotMatch(css, /#rows td\.indicator-cell:nth-child\(6\)/);
});

test('destino do VGM permite digitação contínua e salva somente ao concluir o campo', async () => {
  const runtime = await read('public/assets/app-runtime.js');
  const server = await read('src/server.js');
  assert.doesNotMatch(runtime, /\[data-vgm-sent-to\][\s\S]{0,240}addEventListener\('input'/);
  assert.match(runtime, /\[data-vgm-sent-to\][\s\S]{0,420}addEventListener\('change'/);
  assert.match(runtime, /event\.key === 'Enter'[\s\S]{0,100}input\.blur\(\)/);
  assert.match(runtime, /editingVgmDestination = document\.activeElement\?\.matches\?\.\('\[data-vgm-sent-to\]'\)/);
  assert.match(runtime, /data-vgm-release-schedule/);
  assert.match(runtime, /data-vgm-release-deadline/);
  assert.match(runtime, /class="vgm-board" role="list"/);
  assert.match(runtime, /class="vgm-card process-status-row/);
  assert.match(runtime, /<label for="vgm-status-\$\{key\}">STATUS VGM<\/label>/);
  assert.match(runtime, /aria-label="Deadline de agendamento do booking/);
  assert.doesNotMatch(runtime, /<th>ROTA<\/th><th>VGM ENVIADO\?<\/th>/);
  assert.match(await read('public/assets/gport.css'), /\.vgm-card\{display:grid;grid-template-columns/);
  assert.match(await read('public/assets/gport.css'), /\.vgm-card-deadline\{padding-left:8px/);
  assert.match(runtime, /Informe o deadline de agendamento no formato dd\/mm hh:mm/);
  assert.match(server, /release_schedule=\$4/);
  assert.match(server, /release_deadline=\$5/);
});

test('CSP da página usa nonce e não depende de unsafe-inline', async () => {
  const server = await read('src/server.js');
  const runtime = await read('public/assets/app-runtime.js');
  const apiClient = await read('public/assets/api-client.js');
  assert.doesNotMatch(server, /style-src 'self' 'unsafe-inline'/);
  assert.match(server, /style-src 'self' 'nonce-\$\{nonce\}'/);
  assert.match(runtime, /securePrintHtml/);
  assert.match(runtime, /style\.nonce = cspNonce/);
});

test('login sempre abre Processos sem painel ou preferência de redirecionamento', async () => {
  const html = await read('public/index.html');
  const legacy = await read('public/assets/legacy-ui.js');
  const experience = await read('public/assets/experience.js');
  assert.doesNotMatch(html, /name="startPage"|Página após login/);
  assert.doesNotMatch(legacy, /savedAccessibility\?\.startPage|startPage:v\.startPage|startPage:'processos'/);
  assert.match(legacy, /delete savedAccessibility\.startPage/);
  assert.match(html, /<section id="processesPage">/);
  assert.doesNotMatch(experience, /showDashboard\(\);|Painel inicial/);
});

test('página inicial declara contexto e tabelas mantêm semântica acessível', async () => {
  const html = await readInterface();
  const experience = await read('public/assets/experience.js');
  assert.match(html, /<meta name="description" content="GPORT: gestão interna de processos de exportação/);
  assert.match(html, /id="toastRegion" class="toast-region" role="status"/);
  assert.match(experience, /header\.scope = 'col'/);
  assert.match(experience, /cell\.setAttribute\('headers', headers\[index\]\.id\)/);
  assert.match(experience, /item\.textContent\.trim\(\)/);
});

test('migração de estabilidade está disponível', async () => {
  const migration = await read('database/migrations/2026-07-25-stability-security.sql');
  assert.match(migration, /processes_updated_at/);
  assert.match(migration, /pg_trgm/);
  assert.match(migration, /release_channel/);
});

test('DDL versionado não é executado durante o boot da aplicação', async () => {
  const server = await read('src/server.js');
  const migrations = await read('src/migrations.js');
  const sql = await read('database/migrations/2026-08-28-001-runtime-schema-baseline.sql');
  const pkg = JSON.parse(await read('package.json'));
  assert.match(server, /verifySchemaCompatibility\(\{ query \}\)/);
  assert.doesNotMatch(server, /ensureProcessFields\(\)\s*\n\s*\.then/);
  assert.match(migrations, /app_schema_migrations/);
  assert.match(migrations, /checksum/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS process_attachments/);
  assert.equal(pkg.scripts.migrate, 'node scripts/migrate.mjs');
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
  const errorHandler = await read('src/error-handler.js');
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
  assert.match(errorHandler, /Solicitação muito grande/);
  assert.match(errorHandler, /entity\.parse\.failed/);
  assert.match(errorHandler, /JSON inválido/);
});

test('exclusão de exportador preserva processos vinculados', async () => {
  const server = await read('src/server.js');
  const html = await readInterface();
  assert.match(server, /UPDATE clients SET active=false/);
  assert.match(server, /client\.deactivated/);
  assert.match(server, /ALTER TABLE clients ADD COLUMN IF NOT EXISTS active BOOLEAN/);
  assert.match(html, /exportador excluído/);
  assert.match(html, /class="btn secondary delete-client"/);
  assert.match(html, /Excluir o exportador/);
});

test('listagem paginada compartilha processos entre usuários autenticados', async () => {
  const server = await read('src/server.js');
  const search = await read('src/process-search.js');
  assert.match(server, /const canReadAllProcesses = \(\) => true/);
  assert.ok(search.includes('LIMIT $${next} OFFSET $${next + 1}'));
  assert.match(server, /pagination:\{ limit:search\.limit, offset:search\.offset, total:/);
  assert.match(search, /processSearchFields/);
});

test('planilha usa projeção resumida e detalhes continuam no endpoint individual', async () => {
  const server = await read('src/server.js');
  const runtime = await read('public/assets/app-runtime.js');
  const projections = await read('src/process-projections.js');
  const search = await read('src/process-search.js');
  assert.match(runtime, /projection:'summary'/);
  assert.match(runtime, /loadPersistedProcess = async id => \{[\s\S]*?persisted = await request\(`\/api\/processes\/\$\{id\}`\)[\s\S]*?toViewProcess\(persisted\)[\s\S]*?updatedAt:persisted\.updated_at[\s\S]*?__persistedDetails:true/);
  assert.equal((runtime.match(/el\('rows'\)\.onclick\s*=/g) || []).length, 1, 'a tabela deve possuir somente um manipulador final de abertura');
  assert.match(runtime, /const process = await loadPersistedProcess\(id\)/);
  assert.match(runtime, /if \(pdfButton\) printCoverFromDocumentModel\(process\)/);
  assert.doesNotMatch(runtime, /printCoverFromDocumentModel\(data\.find\(/);
  assert.match(runtime, /const openCalendarProcess = async id => \{\s*try \{ const item = await loadPersistedProcess\(id\)/);
  assert.match(runtime, /processFormHasPersistedDetails/);
  assert.match(runtime, /values\.updatedAt = editingProcessUpdatedAt \|\| data\.find/);
  assert.match(server, /buildProcessSearchQuery\(req\.query\)/);
  assert.match(search, /processProjection\(projection\)/);
  assert.match(search, /supportedProcessProjections\.has\(projection\)/);
  assert.match(projections, /processDetailSelect = `SELECT p\.\*/);
  assert.doesNotMatch(projections.match(/processSummarySelect[\s\S]*?`;\n/)[0], /container_details/);
});

test('camadas de entrada impedem undefined de virar dado do processo', async () => {
  const server = await read('src/server.js');
  const runtime = await read('public/assets/app-runtime.js');
  const legacy = await read('public/assets/legacy-ui.js');
  assert.match(server, /\^\(\?:undefined\|null\)\$\/i\.test\(result\)/);
  assert.match(runtime, /view\[key\] === null \|\| view\[key\] === undefined/);
  assert.match(legacy, /form\.elements\[k\]\.value=v\?\?''/);
});

test('atualização em tempo real respeita a autorização de leitura', async () => {
  const server = await read('src/server.js');
  const html = await readInterface();
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
  assert.match(html, /restoreVisibleProcess\('vgm', id, snapshot\)/);
  assert.match(html, /restoreVisibleProcess\('release', id, snapshot\)/);
  assert.match(html, /if \(Number\(localProcessMutationQuietUntil\.get\(event\.id\) \|\| 0\) > Date\.now\(\)\) return/);
});

test('painel inicial e notificações permanecem removidos da interface operacional', async () => {
  const index = await read('public/index.html');
  const server = await read('src/server.js');
  const legacy = await read('public/assets/legacy-ui.js');
  const experience = await read('public/assets/experience.js');
  const css = await read('public/assets/experience.css');
  assert.match(server, /app\.get\('\/api\/dashboard', authenticate/);
  assert.match(server, /LIMIT 6/);
  assert.match(server, /app\.get\('\/api\/notifications', authenticate/);
  assert.match(server, /app\.patch\('\/api\/notifications\/:id\/read', authenticate/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS user_notifications/);
  assert.match(server, /UNIQUE\(user_id,dedupe_key\)/);
  assert.doesNotMatch(experience, /Painel inicial|makeDashboard|loadDashboard|showDashboard/);
  assert.match(css, /\.dashboard-kpis/);
  assert.doesNotMatch(index, /deadlineAlerts|Planilha e alertas|Alertar sobre prazos próximos/);
  assert.match(legacy, /delete savedAccessibility\.deadlineAlerts/);
  assert.doesNotMatch(legacy, /atlas-export-notification-prompted|Notification\.requestPermission|elements\.deadlineAlerts|p\.deadlineAlerts|v\.deadlineAlerts/);
  assert.doesNotMatch(experience, /loadNotifications|makeNotifications|notificationToggle|\/api\/notifications/);
  assert.doesNotMatch(css, /\.notification-panel|\.notification-toggle|\.notification-item/);
});

test('interface progressiva mantém confirmações internas, skeleton e cartões móveis', async () => {
  const html = await readInterface();
  const experience = await read('public/assets/experience.js');
  assert.match(html, /id="confirmDialog"/);
  assert.match(html, /const confirmAction =/);
  assert.match(html, /await confirmAction\('Excluir processo'/);
  assert.match(html, /classList\.add\('is-skeleton'\)/);
  assert.match(html, /assets\/experience\.css/);
  assert.match(html, /assets\/experience\.js/);
  assert.match(experience, /labelResponsiveTables/);
  assert.match(experience, /enhanceProcessForm/);
  assert.match(experience, /mobile-nav/);
});

test('lançamento progressivo possui seis etapas e modo rápido sem oferecer rascunho local', async () => {
  const html = await readInterface();
  const experience = await read('public/assets/experience.js');
  const runtime = await read('public/assets/app-runtime.js');
  const css = await read('public/assets/experience.css');
  for (const title of ['Processo', 'Exportador', 'Rota', 'Documentos', 'Carga', 'Revisão']) assert.match(experience, new RegExp(`\\['${title}'`));
  assert.ok(experience.indexOf("['Exportador'") < experience.indexOf("['Processo'"), 'Exportador deve ser a primeira etapa do lançamento');
  assert.match(experience, /addEventListener\('gport:process-form-opened'/);
  assert.match(experience, /activeStep = 0;/);
  assert.match(experience, /form\.elements\.exportador\.focus/);
  assert.match(experience, /Modo rápido/);
  assert.match(experience, /controls\.hidden = quickMode/);
  assert.match(experience, /form\.dataset\.formFlowMode = quickMode \? 'quick' : 'steps'/);
  assert.match(css, /#form\[data-form-flow-mode="quick"\] \.form-flow-controls\{display:none!important\}/);
  assert.match(html, /id="printBtn" hidden/);
  assert.match(runtime, /el\('printBtn'\)\.hidden = !p/);
  assert.match(experience, /localStorage\.removeItem\('gport:process-draft:v2'\)/);
  assert.doesNotMatch(experience, /installProcessDraft|draft-notice|data-draft-restore|localStorage\.setItem\('gport:process-draft/);
  assert.doesNotMatch(html, /gport:process-open|gport:process-saved/);
  assert.doesNotMatch(css, /\.draft-notice/);
  assert.match(experience, /input instanceof HTMLSelectElement/);
  assert.match(experience, /selectedOptions\[0\]\?\.textContent/);
  assert.match(experience, /addEventListener\('gport:review-update', updateReview\)/);
  assert.match(html, /dispatchEvent\(new Event\('gport:review-update'\)\)/);
  assert.match(css, /\.form-review__summary/);
});

test('filtro de processos é persistido somente durante a sessão do navegador', async () => {
  const html = await readInterface();
  assert.match(html, /const processFilterSessionKey = 'gport:process-filter:v1'/);
  assert.match(html, /sessionStorage\.setItem\(processFilterSessionKey/);
  assert.match(html, /sessionStorage\.removeItem\(processFilterSessionKey\)/);
});

test('processos permitem filtrar pelo período em que foram lançados', async () => {
  const search = await read('src/process-search.js');
  const html = await readInterface();
  const css = await read('public/assets/gport.css');
  assert.match(search, /const launchedFrom = String\(query\.launchedFrom \|\| ''\)\.trim\(\)/);
  assert.match(search, /const launchedTo = String\(query\.launchedTo \|\| ''\)\.trim\(\)/);
  assert.match(search, /p\.created_at >= \$5::date/);
  assert.match(search, /p\.created_at < \(\$6::date \+ INTERVAL '1 day'\)/);
  assert.match(html, /id="processLaunchedFrom" type="date"/);
  assert.match(html, /id="processLaunchedTo" type="date"/);
  assert.match(html, /searchParams\.set\('launchedFrom', requestedFilter\.launchedFrom\)/);
  assert.match(html, /el\('processLaunchedFrom'\)\.onchange = scheduleServerProcessSearch/);
  assert.match(css, /\.process-period-filter\{display:flex/);
});

test('relatórios consideram processos lançados no período, e não deadlines ou data de envio', async () => {
  const server = await read('src/server.js');
  const legacy = await read('public/assets/legacy-ui.js');
  const html = await readInterface();

  assert.match(server, /EXTRACT\(YEAR FROM p\.created_at AT TIME ZONE 'America\/Sao_Paulo'\)=\$1/);
  assert.match(server, /EXTRACT\(MONTH FROM p\.created_at AT TIME ZONE 'America\/Sao_Paulo'\)=\$2/);
  assert.doesNotMatch(server, /p\.shipping_date IS NOT NULL AND EXTRACT\(YEAR FROM p\.shipping_date\)/);
  assert.match(legacy, /window\.gportRequest\(`\/api\/reports\?\$\{params\}`\)/);
  assert.match(legacy, /params\.set\('all','true'\)/);
  assert.match(legacy, /Processos lançados no mês/);
  assert.match(html, /Processos cadastrados no período selecionado\./);
});

test('relatórios possuem módulo próprio sem alterar o contrato da interface atual', async () => {
  const html = await readInterface();
  const index = await read('public/index.html');
  const reports = await read('public/assets/reports.js');
  const loader = await read('public/assets/module-loader.js');

  assert.match(index, /name="gport-reports-asset" content="assets\/reports\.js\?v=[0-9.]+"/);
  assert.doesNotMatch(index, /<script src="assets\/reports\.js/);
  assert.match(loader, /loadReports/);
  assert.match(loader, /pending = new Map\(\)/);
  assert.match(html, /await window\.gportModules\.loadReports\(\)/);
  assert.match(html, /reportsPage'\)\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(reports, /window\.gportRequest\(`\/api\/reports\?\$\{params\}`\)/);
  assert.match(reports, /window\.gportReports = \{ render: renderReports, syncView: syncReportView \}/);
  assert.match(reports, /window\.renderReports = renderReports/);
});

test('ativos versionados usam cache imutável sem tornar o HTML persistente', async () => {
  const server = await read('src/server.js');

  assert.match(server, /filePath\.endsWith\('\.html'\)/);
  assert.match(server, /'no-cache'/);
  assert.match(server, /\[\?&\]v=\[A-Za-z0-9\._-\]\+/);
  assert.match(server, /public, max-age=31536000, immutable/);
  assert.match(server, /public, max-age=86400/);
});

test('cliente de API centraliza CSRF, credenciais e expiração de sessão', async () => {
  const html = await readInterface();
  const apiClient = await read('public/assets/api-client.js');
  const runtime = await read('public/assets/app-runtime.js');

  assert.match(html, /assets\/api-client\.js\?v=[0-9.]+" defer/);
  assert.match(apiClient, /credentials: 'same-origin'/);
  assert.match(apiClient, /'X-CSRF-Token': csrfToken\(\)/);
  assert.match(apiClient, /response\.status === 401/);
  assert.match(apiClient, /window\.gportApi = \{ create \}/);
  assert.match(runtime, /window\.gportApi\.create\(\{/);
  assert.match(runtime, /onUnauthorized: requireSessionLogin/);
});

test('Prazos e Financeiro permanecem reversíveis, mas fora da navegação operacional atual', async () => {
  const html = await readInterface();
  assert.match(html, /id="deadlineNav" href="#" hidden aria-hidden="true"/);
  assert.match(html, /id="financialNav" href="#financeiro" hidden aria-hidden="true"/);
  assert.match(html, /el\('financialNav'\)\.hidden = true/);
});

test('roteiro de homologação cobre painel e notificações sem usar produção', async () => {
  const script = await read('scripts/qa-process-launch-hml.ps1');
  assert.match(script, /gport-exportacao-hml\.onrender\.com/);
  assert.match(script, /gport-exportacao\\\.onrender\\\.com/);
  assert.match(script, /dashboard_\$\(\$account\.Name\)/);
  assert.match(script, /notificacoes_\$\(\$account\.Name\)/);
  assert.match(script, /notificacao_marcada_como_lida/);
  assert.match(script, /limpeza_processo_teste/);
});

test('VGM em draft ou enviado pelo cliente conta como enviado em todas as telas', async () => {
  const server = await read('src/server.js');
  const html = await readInterface();
  assert.match(server, /IN \('Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT'\)/);
  assert.match(html, /\['Sim','Enviado pelo Cliente','Enviando no DRAFT'\]\.includes\(p\.vgmStatus\)/);
});

test('relatório de VGM permite abrir os processos enviados em cada dia', async () => {
  const html = await readInterface();
  assert.match(html, /selectedVgmReportDay/);
  assert.match(html, /data-vgm-report-day/);
  assert.match(html, /VGMs enviados em \$\{esc\(selectedDay\.name\)\}/);
  assert.match(html, /clearVgmReportDay/);
  assert.match(html, /selectedDay\.processes\.map/);
  assert.match(html, /class="vgm-report-day-card/);
  assert.match(html, /class="vgm-day-process process-status-row/);
  assert.match(html, /class="process-status-row \$\{p\.canalLiberacao/);
  assert.match(html, /const releaseGroups = new Map\(\)/);
  assert.match(html, /class="release-port-group"/);
  assert.match(html, /followupProcesses\.map\(p => `<article class="followup-card process-status-row/);
  assert.match(await read('public/assets/gport.css'), /\.process-status-row\.process-channel-verde td:first-child\{box-shadow:inset 4px 0 #16a34a/);
  assert.match(await read('public/assets/gport.css'), /\.vgm-report-panel\{display:grid;grid-template-columns/);
  assert.match(await read('public/assets/legacy-ui.js'), /class="report-rank-list" role="list"/);
});

test('liberação permite filtrar por porto e ordena pelo deadline crescente', async () => {
  const html = await readInterface();
  assert.match(html, /releasePortFilter='all'/);
  assert.match(html, /releasePortFilters/);
  assert.match(html, /data-release-port/);
  assert.match(html, /deadlineOrder\(a\) - deadlineOrder\(b\)/);
  assert.match(html, /const releaseLabels = \['BOOKING','EXPORTADOR \/ IMPORTADOR'/);
  assert.match(html, /cell\.dataset\.label = releaseLabels\[index\]/);
  assert.match(await read('public/assets/gport.css'), /\.release-table tbody tr\{display:grid;grid-template-columns:repeat\(4/);
  assert.match(html, /Date\.parse\(p\.releaseDeadlineOrder/);
  assert.match(html, /const knownPortMap = new Map\(\)/);
  assert.match(html, /if\(key&&!knownPortMap\.has\(key\)\)knownPortMap\.set\(key,port\)/);
  assert.match(html, /releaseGroups\.get\(key\)\.processes\.push\(process\)/);
  assert.match(await read('public/assets/gport.css'), /\.release-port-group\{overflow:hidden/);
  assert.match(await read('public/assets/gport.css'), /\.followup-card\{display:grid/);
  assert.doesNotMatch(html, /new Set\(\[\.\.\.standardPorts/);
});

test('processos podem ser filtrados por cliente e ordenados por cliente e lançamento', async () => {
  const search = await read('src/process-search.js');
  const html = await readInterface();
  const css = await read('public/assets/gport.css');
  assert.match(search, /const clientId = String\(query\.client \|\| ''\)\.trim\(\)/);
  assert.match(search, /const clientName = String\(query\.clientName \|\| ''\)\.trim\(\)/);
  assert.match(search, /LOWER\(COALESCE\(c\.name,''\)\)=LOWER\(\$4\)/);
  assert.match(search, /processes:'c\.name ASC,p\.created_at DESC,p\.id DESC'/);
  assert.match(html, /processClientFilter='all'/);
  assert.match(html, /processClientFilters/);
  assert.match(html, /client-filter-popover/);
  assert.match(html, /processClientFilterSearch/);
  assert.match(html, /clientControls\.open=false/);
  assert.match(html, /data-process-client/);
  assert.match(html, /searchParams\.set\('client', processClientFilter\)/);
  assert.match(html, /searchParams\.set\('clientName', selectedClient\.nome\)/);
  assert.match(html, /function matchesClientFilter\(process\)/);
  assert.match(html, /if \(clientResult\.status === 'fulfilled'\) render\(\)/);
  assert.match(html, /class="client-group"/);
  assert.match(css, /#processesPage \.table-wrap thead th\{background:#fff;color:#155b91/);
  assert.match(css, /\.client-filter-options \.btn\{[^}]*text-transform:uppercase/);
  assert.match(css, /\.client-group td\{[^}]*background:#fff!important;color:#155b91/);
  assert.match(css, /#rows tr\.clickable td\{background:#fff!important\}/);
  assert.match(html, /String\(a\.exportador\|\|''\)\.localeCompare/);
});

test('pesquisas atualizam automaticamente sem exigir clique no botão Filtrar', async () => {
  const html = await readInterface();
  const index = await read('public/index.html');
  assert.match(index, /<option value="booking" selected>BOOKING<\/option>/);
  assert.match(html, /const sectionSearchOptions = '<option value="booking" selected>BOOKING<\/option>/);
  assert.match(html, /value\.oninput = scheduleAutomaticSearch/);
  assert.match(html, /field\.onchange = scheduleAutomaticSearch/);
  assert.match(html, /setTimeout\(runAutomaticSearch, 300\)/);
  assert.match(html, /el\('search'\)\.oninput = scheduleServerProcessSearch/);
  assert.match(html, /el\('searchField'\)\.onchange = scheduleServerProcessSearch/);
  assert.match(html, /let processRefreshVersion = 0/);
  assert.match(html, /if \(refreshVersion !== processRefreshVersion\) return false/);
  assert.match(html, /const requestedFilter = serverProcessFilter \? \{ \.\.\.serverProcessFilter \} : null/);
  assert.match(html, /summary\.textContent = 'Buscando processos…'/);
  assert.match(html, /setTimeout\(\(\) => \{ void applyServerProcessSearch\(\); \}, 250\)/);
});

test('busca operacional é normalizada, paginada no servidor e cancela consultas antigas', async () => {
  const server = await read('src/server.js');
  const search = await read('src/process-search.js');
  const html = await readInterface();
  assert.match(search, /normalizeSearchTerm/);
  assert.match(search, /escapeLikeTerm/);
  assert.match(search, /p\.due_number,p\.ruc_number/);
  assert.match(search, /p\.container_details::text/);
  assert.match(search, /vgmStatus/);
  assert.match(search, /releaseStatus/);
  assert.match(search, /postShipmentStatus/);
  assert.match(search, /originPort/);
  assert.match(server, /processes_vgm_sent_date_idx/);
  assert.match(server, /processes_release_origin_deadline_idx/);
  assert.match(search, /query\.view \|\| 'processes'/);
  assert.match(search, /ESCAPE E'\\\\\\\\'/);
  assert.match(html, /processSearchController\?\.abort\(\)/);
  assert.match(html, /new AbortController\(\)/);
  assert.match(html, /const sectionSearchStates/);
  assert.match(html, /apiView = name === 'postShipment'/);
  assert.match(html, /sectionSearchStates\.vgm\.filter = filter/);
  assert.match(html, /sectionSearchStates\.release\.filter = filter/);
  assert.match(html, /sectionSearchStates\.postShipment\.filter = filter/);
  assert.match(html, /sectionSearchStates\.followup\.filter = followupSearchFilter/);
  assert.match(html, /Nenhum resultado encontrado\./);
  assert.match(html, /normalizeSearchText/);
});

test('processos históricos não somem quando referências falham e qualquer usuário autenticado pode cadastrar exportador', async () => {
  const server = await read('src/server.js');
  const search = await read('src/process-search.js');
  const html = await readInterface();
  assert.match(server, /app\.post\('\/api\/clients', authenticate, clientCreatorOnly/);
  assert.match(search, /FROM processes p LEFT JOIN clients c ON c\.id=p\.client_id LEFT JOIN users u ON u\.id=p\.analyst_id/);
  assert.match(html, /remoteProcesses = await processRequest/);
  assert.match(html, /Promise\.allSettled\(\[\s*request\('\/api\/clients'\), request\('\/api\/assignees'\)/);
});

test('cadastro de exportador reativa registro excluído e trata duplicidade sem erro interno', async () => {
  const server = await read('src/server.js');
  const errorHandler = await read('src/error-handler.js');
  assert.match(server, /SELECT id,active FROM clients WHERE LOWER\(name\)=LOWER\(\$1\) LIMIT 1/);
  assert.match(server, /client\.reactivated/);
  assert.match(errorHandler, /error\?\.code === '23505'/);
});

test('canal verde libera o processo automaticamente no servidor e na interface', async () => {
  const server = await read('src/server.js');
  const html = await readInterface();
  assert.match(server, /const releaseStatus = releaseChannel === 'Verde' \? 'Sim' : requestedReleaseStatus/);
  assert.match(html, /if \(releaseChannel === 'Verde'\) \{ releaseStatus = 'Sim'/);
});

test('edição preserva o identificador técnico único do processo', async () => {
  const server = await read('src/server.js');
  assert.match(server, /body\.processNumber = previous\.process_number/);
  assert.match(server, /identificador técnico, único e não editável/);
});

test('interface reutiliza dados de referência entre paginação e filtros', async () => {
  const html = await readInterface();
  assert.match(html, /const referenceDataTtlMs = 5 \* 60 \* 1000/);
  assert.match(html, /refreshData\(\{ page=null, refreshReferenceData=false \} = \{\}\)/);
  assert.match(html, /const needsReferenceData = refreshReferenceData \|\| Date\.now\(\) >= referenceDataCache\.expiresAt/);
  assert.match(html, /refreshData\(\{ refreshReferenceData:true \}\)/);
  assert.match(html, /Página \$\{current\} de \$\{totalPages\}/);
  assert.match(html, /refreshData\(\{ page \}\)/);
});

test('login e carregamento inicial não aguardam dados auxiliares para exibir processos', async () => {
  const server = await read('src/server.js');
  const html = await readInterface();
  assert.match(server, /void clearLoginFailures\(req\)/);
  assert.match(html, /const referenceRequests = needsReferenceData/);
  assert.match(html, /Promise\.allSettled\(\[request\('\/api\/clients'\), request\('\/api\/assignees'\)\]\)/);
  assert.match(html, /remoteProcesses = await processRequest/);
  assert.match(html, /applyProcessPage\(remoteProcesses, requestedPage\)/);
  assert.match(html, /showProcessLoading\(\)/);
  assert.match(html, /void referenceRequests\.then/);
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
  const html = await readInterface();
  const runtime = await read('public/assets/app-runtime.js');
  assert.match(html, /function printCoverFromDocumentModel\(p\)/);
  assert.match(runtime, /function printCoverFromDocumentModelBase\(p\)/);
  assert.doesNotMatch(runtime, /function printOperationalCover\(p\)/);
  assert.match(html, /DEADLINES \/ PRAZOS/);
  assert.match(html, /CHECK LIST/);
  assert.match(html, /MERCADORIAS A SEREM EMBARCADAS/);
  assert.match(html, /EMISSÃO DUE:/);
  assert.match(html, /VENCIMENTO:/);
  assert.match(html, /<th>NOTA FISCAL<\/th>/);
  assert.match(html, /const exporterName = client\.nome \|\| p\.exportador \|\| ''/);
  assert.match(html, /const balanceCoverName = value =>/);
  assert.match(html, /cell\('EXPORTADOR:',exporterDisplayName,'exporter'\)/);
  assert.match(html, /\.exporter\{display:flex!important/);
  assert.match(html, /white-space:pre-line!important;font-size:10\.8px!important/);
  assert.doesNotMatch(html, /exporter-very-long|exporter-long/);
  assert.match(html, /NOVO LACRE/);
});

test('notificações de prazo são deduplicadas, configuráveis e respeitam o perfil operacional', async () => {
  const server = await read('src/server.js');
  const env = await read('.env.example');
  assert.match(server, /DEADLINE_NOTIFICATIONS_ENABLED/);
  assert.match(server, /createDeadlineNotificationsFor/);
  assert.match(server, /deadline:.*item\.id.*item\.deadline_date/);
  assert.match(server, /CURRENT_DATE \+ 1/);
  assert.match(server, /CURRENT_DATE \+ 2/);
  assert.match(server, /p\.analyst_id=\$1/);
  assert.match(server, /COALESCE\(p\.vgm_status,'Não'\)/);
  assert.match(server, /COALESCE\(p\.release_status,'Não'\)/);
  assert.match(env, /DEADLINE_NOTIFICATIONS_ENABLED=true/);
});

test('histórico de edição apresenta campos e valores anterior e novo sem inserir HTML', async () => {
  const html = await readInterface();
  assert.match(html, /due_issue_date:'Data de emissão da DUE'/);
  assert.match(html, /container_details:'Dados dos contêineres'/);
  assert.match(html, /field==='client_id'/);
  assert.match(html, /field==='container_details'/);
  assert.match(html, /value\?\.before/);
  assert.match(html, /value\?\.after/);
  assert.match(html, /filter\(change=>change\.before!==change\.after\)/);
  assert.match(html, /Registro técnico sem alteração visível nos dados do processo/);
  assert.match(html, /return visible\.join\('\\n'\)/);
  assert.doesNotMatch(html, /labels\[field\]\|\|field/);
  assert.match(html, /details\.textContent=historyDetails\(item\)/);
  assert.match(html, /esc\(historyDetails\(item\)\)\.replace\(\/\\n\/g,'<br>'\)/);
});

test('observabilidade agrega somente métricas técnicas e protege o endpoint para administradores', async () => {
  const server = await read('src/server.js');
  const observability = await read('src/observability.js');
  const env = await read('.env.example');
  assert.match(server, /createObservability\(\{[\s\S]*slowRequestMs,[\s\S]*onThreshold/);
  assert.match(server, /createResourceMonitor\(\{ alerts \}\)/);
  assert.match(server, /createErrorHandler\(\{[\s\S]*logger, alerts/);
  assert.match(observability, /state = \{ startedAt/);
  assert.match(observability, /correlationId/);
  assert.match(server, /app\.get\('\/api\/observability\/metrics', authenticate, adminOnly/);
  assert.match(observability, /averageMs/);
  assert.match(server, /OBSERVABILITY_SLOW_REQUEST_MS/);
  assert.match(env, /OBSERVABILITY_SLOW_REQUEST_MS=1000/);
});

test('relatórios mostram uso real do PostgreSQL sem expor credenciais', async () => {
  const server = await read('src/server.js');
  const runtime = await read('public/assets/app-runtime.js');
  const html = await read('public/index.html');
  const env = await read('.env.example');
  assert.match(server, /app\.get\('\/api\/reports\/database-usage', authenticate, adminOnly/);
  assert.match(server, /pg_database_size\(current_database\(\)\)/);
  assert.match(server, /databaseUsageCacheMs = 10 \* 60 \* 1000/);
  assert.match(server, /availableBytes: Math\.max\(0, databaseCapacityBytes - usedBytes\)/);
  assert.doesNotMatch(server, /database-usage[\s\S]{0,1000}DATABASE_URL/);
  assert.match(env, /DATABASE_CAPACITY_MB=500/);
  assert.match(html, /id="databaseUsageProgress"[\s\S]*role="progressbar"/);
  assert.match(runtime, /request\('\/api\/reports\/database-usage'\)/);
  assert.match(runtime, /void loadDatabaseUsage\(\)/);
  assert.match(runtime, /Próximo do limite/);
});

test('roteiro de medição de homologação é passivo e não transmite credenciais', async () => {
  const script = await read('scripts/measure-homologation.ps1');
  assert.match(script, /Não faz login, não envia cookies e não altera dados/);
  assert.match(script, /api\/health/);
  assert.match(script, /experience\.js/);
  assert.doesNotMatch(script, /-Headers|Authorization\s*=|WebSession|Credential|Password\s*=/i);
});

test('sessão ativa é renovada e expiração permite novo login sem recarregar o formulário', async () => {
  const server = await read('src/server.js');
  const runtime = await read('public/assets/app-runtime.js');
  const apiClient = await read('public/assets/api-client.js');
  const env = await read('.env.example');
  assert.match(server, /SESSION_MAX_AGE_HOURS \|\| '8'/);
  assert.match(server, /setSession\(res, user, req\.user\.csrfToken\)/);
  assert.match(server, /csrfToken: claims\.csrf/);
  assert.match(env, /SESSION_MAX_AGE_HOURS=8/);
  assert.match(runtime, /const ensureSessionActive = async/);
  assert.match(runtime, /document\.addEventListener\('visibilitychange'/);
  assert.match(runtime, /setInterval\(\(\) => \{/);
  assert.match(apiClient, /response\.status === 401/);
  assert.match(apiClient, /onUnauthorized\(\)/);
  assert.match(runtime, /os dados preenchidos foram mantidos/);
  assert.doesNotMatch(runtime, /requireSessionLogin[\s\S]{0,700}location\.reload/);
});

test('planejamento usa APIs autenticadas e o acompanhamento detalhado não aparece no fluxo', async () => {
  const server = await read('src/server.js');
  const workspaceRoutes = await read('src/routes/process-workspace.js');
  const attachmentValidator = await read('src/attachment-validator.js');
  const runtime = await read('public/assets/app-runtime.js');
  const html = await read('public/index.html');
  assert.match(server, /app\.get\('\/api\/calendar', authenticate/);
  assert.match(server, /AND p\.analyst_id=\$3/);
  assert.match(server, /processCalendarSelect/);
  assert.match(server, /limit > 500/);
  assert.match(server, /pagination:\{ limit, offset, total:totalCount/);
  assert.doesNotMatch(server, /ORDER BY COALESCE\(p\.release_deadline,p\.deadline,p\.container_collection_date\) ASC LIMIT 500/);
  assert.match(server, /process_prelaunches/);
  assert.match(server, /app\.post\('\/api\/prelaunches', authenticate, processCreatorOnly/);
  assert.match(server, /registerProcessWorkspaceRoutes/);
  assert.match(workspaceRoutes, /process_checklist_items/);
  assert.match(workspaceRoutes, /process_comments/);
  assert.match(workspaceRoutes, /process_attachments/);
  assert.match(workspaceRoutes, /validateAttachmentInput/);
  assert.match(workspaceRoutes, /scan_status !== 'approved'/);
  assert.match(attachmentValidator, /maxBytes = 4 \* 1024 \* 1024/);
  assert.match(attachmentValidator, /application\/pdf/);
  assert.match(attachmentValidator, /basic-signature/);
  assert.match(html, /id="calendarDialog"/);
  assert.match(html, /id="prelaunchForm"/);
  assert.match(html, /id="prelaunchClient"/);
  assert.match(html, /id="calendarDayDetails"/);
  assert.doesNotMatch(html, /id="processWorkspaceDialog"|id="processWorkspaceBtn"/);
  assert.match(runtime, /const openCalendar/);
  assert.match(runtime, /data-calendar-prelaunch/);
  assert.match(runtime, /if \(Array\.isArray\(calendar\)\)/);
  assert.match(runtime, /calendarPageSize = 200/);
  assert.match(runtime, /Refine o período para visualizar todos os itens/);
  assert.match(runtime, /form\.dataset\.prelaunchId/);
  assert.match(runtime, /openPrelaunchForm/);
  assert.match(runtime, /const refreshPersonalDeadlineStat = async/);
  assert.match(runtime, /prelaunchDeadlines/);
  assert.doesNotMatch(runtime, /const processDeadlines/);
  assert.match(runtime, /label:prelaunch\.exporter \|\| 'Exportador não informado'/);
  assert.match(runtime, /void refreshPersonalDeadlineStat\(\)/);
  assert.match(runtime, /if \(!returning\) \{ el\('prelaunchForm'\)\.reset\(\); openPrelaunchForm\(\); \}/);
  assert.match(await read('public/assets/gport.css'), /\.calendar-controls #openPrelaunchBtn\{display:none!important\}/);
  assert.match(runtime, /selectedCalendarDay/);
  assert.match(runtime, /data-calendar-day/);
  assert.match(runtime, /Botão direito para excluir/);
  assert.match(runtime, /deleteCalendarPrelaunch/);
  assert.match(runtime, /returnToCalendarAfterProcess/);
  assert.match(runtime, /dialog\.addEventListener\('close'/);
  assert.match(runtime, /openCalendar\(\{ returning:true \}\)/);
  assert.match(runtime, /const prelaunchForm = event\.currentTarget/);
  assert.match(runtime, /prelaunchForm\.reset\(\)/);
  assert.match(runtime, /processWorkspaceBtn'\)\?\.setAttribute\('hidden', ''\)/);
});

test('interface de VGM e Liberação usa somente ações individuais', async () => {
  const runtime = await read('public/assets/app-runtime.js');
  assert.doesNotMatch(runtime, /vgmBulkApply|releaseBulkApply|data-vgm-bulk-id|data-release-bulk-id/);
  assert.match(runtime, /saveVgmRow/);
  assert.match(runtime, /saveReleaseRow/);
});

test('Pós-embarque registra uma data independente do envio do draft', async () => {
  const server = await read('src/server.js');
  const runtime = await read('public/assets/app-runtime.js');
  const ui = await read('public/assets/post-shipment-ui.js');
  assert.match(server, /app\.patch\('\/api\/processes\/:id\/post-shipment', authenticate, processEditorOnly/);
  assert.match(server, /SET post_shipment_date=\$1/);
  assert.match(server, /process\.post_shipment_updated/);
  assert.match(runtime, /savePostShipmentRow/);
  assert.match(runtime, /data-post-shipment-date/);
  assert.match(ui, /Pós-embarque/);
  assert.match(ui, /data de embarque/);
  assert.doesNotMatch(server.match(/app\.patch\('\/api\/processes\/:id\/post-shipment[\s\S]*?\}\)\);/)?.[0] || '', /shipping_date/);
});
