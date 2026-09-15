import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';
import { verifySchemaCompatibility } from './schema-compatibility.js';
import { createObservability } from './observability.js';
import { createErrorHandler } from './error-handler.js';
import { validateAttachmentInput } from './attachment-validator.js';
import { processCalendarSelect, processDetailSelect } from './process-projections.js';
import { buildProcessSearchQuery } from './process-search.js';
import { createStructuredLogger } from './structured-logger.js';
import { createAlertDispatcher } from './alerts.js';
import { createResourceMonitor } from './resource-monitor.js';
import { registerProcessWorkspaceRoutes } from './routes/process-workspace.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const logger = createStructuredLogger();
const alerts = createAlertDispatcher({ logger });
// Métricas operacionais sem corpo de requisição, usuário, token ou parâmetros.
// Permanecem em memória por instância; um provedor externo pode coletar o
// endpoint administrativo caso seja configurado posteriormente.
const slowRequestMs = Math.max(100, Number(process.env.OBSERVABILITY_SLOW_REQUEST_MS || 1000));
const observability = createObservability({
  slowRequestMs,
  onThreshold:event => alerts.send(event.type === 'error-rate' ? {
    severity:'critical', category:'http-500-rate', title:'Aumento de erros 500 no GPORT',
    summary:`Foram registrados ${event.errors} erros em ${Math.round(event.windowMs / 60000)} minuto(s).`, correlationId:event.correlationId
  } : {
    severity:'warning', category:'latency', title:'Latência elevada na API do GPORT',
    summary:`${event.route} levou ${event.durationMs} ms.`, correlationId:event.correlationId
  })
});
const resourceMonitor = createResourceMonitor({ alerts });
if (alerts.enabled) resourceMonitor.start();
const configuredDatabaseCapacityMb = Number(process.env.DATABASE_CAPACITY_MB || 500);
const databaseCapacityBytes = (Number.isFinite(configuredDatabaseCapacityMb) && configuredDatabaseCapacityMb > 0
  ? configuredDatabaseCapacityMb
  : 500) * 1024 * 1024;
const databaseUsageCache = { expiresAt: 0, value: null };
const databaseUsageCacheMs = 10 * 60 * 1000;
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('Defina um JWT_SECRET forte com pelo menos 32 caracteres.');
const isProduction = process.env.NODE_ENV === 'production';
const sessionCookie = 'gport_session';
const csrfCookie = 'gport_csrf';
// A sessão acompanha uma jornada de trabalho, mas nunca se torna permanente.
// Cada validação em /api/me renova este prazo; após o limite sem conseguir
// validar a sessão, o usuário precisa entrar novamente.
const sessionHours = Math.min(24, Math.max(1, Number.parseInt(process.env.SESSION_MAX_AGE_HOURS || '8', 10) || 8));
const sessionMaxAge = sessionHours * 60 * 60 * 1000;
const supportedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
const turnstileSiteKey = String(process.env.TURNSTILE_SITE_KEY || '').trim();
const turnstileSecretKey = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
const turnstileEnabled = Boolean(turnstileSiteKey && turnstileSecretKey);
const turnstileAllowedHostnames = new Set((process.env.TURNSTILE_ALLOWED_HOSTNAMES || 'gport-exportacao.onrender.com,localhost').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
if ((turnstileSiteKey || turnstileSecretKey) && !turnstileEnabled) throw new Error('TURNSTILE_SITE_KEY e TURNSTILE_SECRET_KEY devem ser configuradas juntas.');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const usernamePattern = /^[A-Za-z0-9._-]{3,80}$/;
// Hash utilizado apenas para manter tempo de resposta semelhante quando o
// usuário não existe, reduzindo enumeração de contas por tempo de resposta.
const dummyPasswordHash = '$2a$12$D1q0beGaVr2D.FubVPSbWO0SvptUQ3rJ9WXrZHm8YiWZlfQmOzPfe';

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // A página HTML recebe uma CSP específica com nonce logo abaixo. APIs e
  // arquivos estáticos usam esta versão mais restritiva, sem inline.
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'");
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // Dados operacionais e sessões nunca devem ser reaproveitados pelo cache do navegador.
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (!origin) return next();
  let sameOrigin = false;
  try { sameOrigin = origin === `${req.protocol}://${req.get('host')}`; } catch { /* origem inválida será rejeitada */ }
  if (!sameOrigin && !supportedOrigins.includes(origin)) return res.status(403).json({ error: 'Origem não permitida.' });
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
app.use(observability.middleware);
// Anexos operacionais são enviados em base64 pelo navegador e têm limite
// individual estrito na rota. O limite global cobre somente esse caso, sem
// aceitar corpos arbitrariamente grandes.
app.use(express.json({ limit: '6mb', strict: true, type: 'application/json' }));
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceWebRoot = path.resolve(here, '../public');
const productionWebRoot = path.join(sourceWebRoot, 'dist');
const webRoot = isProduction && existsSync(path.join(productionWebRoot, 'index.html')) ? productionWebRoot : sourceWebRoot;
let indexHtmlPromise;
const renderIndex = asyncRoute(async (_req, res) => {
  indexHtmlPromise ||= readFile(path.join(webRoot, 'index.html'), 'utf8');
  const nonce = randomBytes(18).toString('base64');
  res.setHeader('Content-Security-Policy', `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https://challenges.cloudflare.com; style-src 'self' 'nonce-${nonce}'; script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com`);
  res.setHeader('Cache-Control', 'no-store');
  const turnstileScript = turnstileEnabled ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=initializeTurnstile&render=explicit" async defer></script>' : '';
  res.type('html').send((await indexHtmlPromise)
    .replaceAll('__TURNSTILE_SITE_KEY__', turnstileEnabled ? turnstileSiteKey : '')
    .replaceAll('__CSP_NONCE__', nonce)
    .replace('__TURNSTILE_SCRIPT__', turnstileScript)
    .replaceAll('<script>', `<script nonce="${nonce}">`));
});
app.get(['/', '/index.html'], renderIndex);
app.use(express.static(webRoot, {
  etag: true,
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    // O HTML deve sempre ser validado para que uma atualização publicada apareça logo.
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
      return;
    }
    // CSS e JavaScript publicados pelo GPORT usam `?v=...` no HTML. Como a
    // versão muda em cada alteração, o navegador pode mantê-los por mais
    // tempo sem risco de receber uma interface antiga. Arquivos sem revisão
    // explícita, como imagens, preservam a revalidação diária.
    const requestUrl = String(res.req?.originalUrl || '');
    const versionedAsset = /[?&]v=[A-Za-z0-9._-]+(?:&|$)/.test(requestUrl)
      || /-[A-Z0-9]{8,}\.(?:js|css)$/i.test(filePath);
    res.setHeader('Cache-Control', versionedAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
  }
}));

const parseCookies = request => Object.fromEntries((request.headers.cookie || '').split(';').map(value => {
  const index = value.indexOf('=');
  return index < 0 ? [] : [value.slice(0, index).trim(), decodeURIComponent(value.slice(index + 1))];
}).filter(pair => pair.length));
const cookieOptions = (httpOnly = true) => ({ httpOnly, secure: isProduction, sameSite: 'strict', path: '/', maxAge: sessionMaxAge });
const secureEqual = (left, right) => {
  if (!left || !right) return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const validRoles = ['admin', 'analyst', 'vgm', 'financeiro', 'liberacao', 'pos_embarque'];
const normalizeRoles = (value, fallback = 'analyst') => {
  const entries = Array.isArray(value) ? value : value == null ? [fallback] : [value];
  const roles = [...new Set(entries.map(item => String(item || '').trim()).filter(Boolean))];
  if (!roles.length || roles.length > 2 || roles.some(role => !validRoles.includes(role))) return null;
  return roles;
};
const rolesFor = user => normalizeRoles(user?.roles, user?.role || 'analyst') || [user?.role || 'analyst'];
const primaryRoleFor = user => rolesFor(user)[0];
const hasRole = (user, ...allowedRoles) => {
  const roles = rolesFor(user);
  return roles.includes('admin') || allowedRoles.some(role => roles.includes(role));
};
const tokenFor = (user, csrfToken) => {
  const roles = rolesFor(user);
  return jwt.sign({ sub: user.id, username: user.username, role: roles[0], roles, ver: user.token_version || 0, csrf: csrfToken }, jwtSecret, { expiresIn: Math.floor(sessionMaxAge / 1000), issuer: 'gport-export', audience: 'gport-web' });
};
const publicUser = user => {
  const roles = rolesFor(user);
  return { id: user.id, username: user.username, role: roles[0], roles, active: user.active, createdAt: user.created_at };
};
const isStrongPassword = password => typeof password === 'string' && password.length >= 12 && password.length <= 200 && /[A-Za-z]/.test(password) && /\d/.test(password);
const validId = value => typeof value === 'string' && uuidPattern.test(value);
const attachmentScanMode = process.env.ATTACHMENT_SCAN_MODE === 'external' ? 'external' : 'basic';
const setSession = (res, user, csrfToken = randomBytes(32).toString('base64url')) => {
  res.cookie(sessionCookie, tokenFor(user, csrfToken), cookieOptions(true));
  res.cookie(csrfCookie, csrfToken, cookieOptions(false));
};
const clearSession = res => {
  const options = { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' };
  res.clearCookie(sessionCookie, options);
  res.clearCookie(csrfCookie, { ...options, httpOnly: false });
};

// Limitação distribuída opcional. Em produção com mais de uma instância,
// configure um Redis compatível com a API REST do Upstash. Sem Redis o
// fallback local continua seguro para uma instância, mas não compartilha
// contadores entre réplicas.
const localRateLimits = new Map();
const redisRateUrl = process.env.RATE_LIMIT_REDIS_REST_URL;
const redisRateToken = process.env.RATE_LIMIT_REDIS_REST_TOKEN;
let redisRateEnabled = false;
try {
  const candidate = redisRateUrl && new URL(redisRateUrl);
  redisRateEnabled = Boolean(candidate && candidate.protocol === 'https:' && redisRateToken);
} catch { /* configuração inválida usa fallback local */ }
const localRateIncrement = (key, windowMs) => {
  const now = Date.now();
  const entry = localRateLimits.get(key);
  if (!entry || now >= entry.resetAt) {
    localRateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return { count: 1, resetAt: now + windowMs };
  }
  entry.count += 1;
  return entry;
};
const localRateRead = key => {
  const entry = localRateLimits.get(key);
  if (!entry || Date.now() >= entry.resetAt) { localRateLimits.delete(key); return 0; }
  return entry.count;
};
const redisRateCommand = async command => {
  if (!redisRateEnabled) return null;
  try {
    const response = await fetch(redisRateUrl, {
      method: 'POST', headers: { Authorization: `Bearer ${redisRateToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command), signal: AbortSignal.timeout(1200)
    });
    if (!response.ok) throw new Error('Redis indisponível');
    return (await response.json()).result;
  } catch {
    // Uma falha do Redis não derruba o sistema; o limite local permanece ativo.
    return null;
  }
};
const distributedRateIncrement = async (key, windowMs) => {
  const script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n";
  const count = await redisRateCommand(['EVAL', script, 1, key, String(windowMs)]);
  return Number.isInteger(Number(count)) ? Number(count) : localRateIncrement(key, windowMs).count;
};
const distributedRateRead = async key => {
  const count = await redisRateCommand(['GET', key]);
  return count === null ? localRateRead(key) : Number(count || 0);
};
const distributedRateClear = async key => {
  localRateLimits.delete(key);
  await redisRateCommand(['DEL', key]);
};
const loginAttemptKey = req => `${req.ip}:${req.path}`;
const loginLimit = asyncRoute(async (req, res, next) => {
  const key = loginAttemptKey(req);
  if (await distributedRateRead(`gport:login:${key}`) >= 10) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' });
  next();
});
const registerLoginFailure = req => distributedRateIncrement(`gport:login:${loginAttemptKey(req)}`, 15 * 60_000);
const clearLoginFailures = req => distributedRateClear(`gport:login:${loginAttemptKey(req)}`);
const verifyTurnstile = async (token, remoteIp) => {
  if (!turnstileEnabled) return true;
  if (typeof token !== 'string' || !token || token.length > 4096) return false;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: turnstileSecretKey, response: token, remoteip: String(remoteIp || '') }),
      signal: AbortSignal.timeout(4_000)
    });
    if (!response.ok) return false;
    const result = await response.json();
    const hostname = String(result.hostname || '').toLowerCase();
    return result.success === true && turnstileAllowedHostnames.has(hostname);
  } catch { return false; }
};
const apiLimit = asyncRoute(async (req, res, next) => {
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method) || req.path.startsWith('/api/auth/')) return next();
  const count = await distributedRateIncrement(`gport:mutation:${req.ip}`, 15 * 60_000);
  if (count > 180) return res.status(429).json({ error: 'Muitas solicitações. Aguarde alguns minutos e tente novamente.' });
  next();
});
app.use('/api', apiLimit);

function authenticate(req, res, next) {
  const token = parseCookies(req)[sessionCookie];
  if (!token) return res.status(401).json({ error: 'Autenticação obrigatória.' });
  let claims;
  try { claims = jwt.verify(token, jwtSecret, { issuer: 'gport-export', audience: 'gport-web' }); }
  catch { return res.status(401).json({ error: 'Sessão inválida ou expirada.' }); }
  query('SELECT id,username,role,roles,active,token_version FROM users WHERE id=$1', [claims.sub])
    .then(result => {
      const user = result.rows[0];
      if (!user?.active || user.token_version !== claims.ver) return res.status(401).json({ error: 'Usuário inativo ou sessão expirada.' });
      // O cargo vem do banco, não apenas do token antigo. Assim exclusões e
      // mudanças de função passam a valer imediatamente.
      const roles = rolesFor(user);
      req.user = { sub: user.id, username: user.username, role: roles[0], roles, csrfToken: claims.csrf };
      next();
    })
    .catch(next);
}
function csrfProtection(req, res, next) {
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method) || req.path === '/api/auth/login') return next();
  const cookies = parseCookies(req);
  const token = cookies[sessionCookie];
  if (!token) return next(); // login público e bloqueio de criação de conta serão tratados pelas próprias rotas.
  try {
    const claims = jwt.verify(token, jwtSecret, { issuer: 'gport-export', audience: 'gport-web' });
    if (!secureEqual(req.get('X-CSRF-Token'), cookies[csrfCookie]) || !secureEqual(cookies[csrfCookie], claims.csrf)) {
      return res.status(403).json({ error: 'Solicitação inválida. Atualize a página e tente novamente.' });
    }
  } catch { return res.status(401).json({ error: 'Sessão inválida ou expirada.' }); }
  next();
}
app.use('/api', csrfProtection);
const adminOnly = (req, res, next) => hasRole(req.user, 'admin') ? next() : res.status(403).json({ error: 'Acesso restrito a administradores.' });
// Regra operacional confirmada: qualquer usuário autenticado pode consultar,
// criar, editar e excluir processos. Controles especializados de VGM e
// liberação continuam restritos aos respectivos perfis.
const processEditorOnly = (_req, _res, next) => next();
const processCreatorOnly = (_req, _res, next) => next();
// Qualquer colaborador autenticado pode cadastrar um exportador necessário
// para lançar um processo. Alterações e exclusões continuam restritas.
const clientCreatorOnly = (_req, _res, next) => next();
const clientManagerOnly = (req, res, next) => hasRole(req.user, 'analyst') ? next() : res.status(403).json({ error: 'Apenas Analista ou Administrador podem administrar exportadores.' });
const vgmManagerOnly = (req, res, next) => hasRole(req.user, 'vgm') ? next() : res.status(403).json({ error: 'Apenas VGM ou Administrador podem atualizar este controle.' });
const releaseManagerOnly = (req, res, next) => hasRole(req.user, 'liberacao') ? next() : res.status(403).json({ error: 'Apenas Liberação ou Administrador podem atualizar este controle.' });
const followupManagerOnly = (req, res, next) => hasRole(req.user, 'analyst') ? next() : res.status(403).json({ error: 'Apenas Analista ou Administrador podem atualizar o follow up.' });
const postShipmentManagerOnly = (req, res, next) => hasRole(req.user, 'pos_embarque') ? next() : res.status(403).json({ error: 'Apenas Pós-embarque ou Administrador podem atualizar este controle.' });
const audit = (userId, action, entity, entityId, details = {}) => query('INSERT INTO audit_log(user_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)', [userId, action, entity, entityId, details]);

app.get('/api/health', asyncRoute(async (_req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok' });
}));

app.post('/api/auth/register', loginLimit, asyncRoute(async (req, res) => {
  // Cadastro público foi removido: contas são provisionadas somente por admins.
  // A rota permanece por compatibilidade com a interface administrativa.
  return res.status(403).json({ error: 'O cadastro é feito somente por administradores.' });
}));

app.post('/api/users', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const roles = normalizeRoles(req.body.roles ?? req.body.role ?? 'analyst');
  if (!usernamePattern.test(username)) return res.status(400).json({ error: 'Usuário deve ter 3 a 80 caracteres: letras, números, ponto, hífen ou sublinhado.' });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'A senha deve ter ao menos 12 caracteres, com letras e números.' });
  if (!roles) return res.status(400).json({ error: 'Selecione uma ou duas funções válidas.' });
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await query('INSERT INTO users(username,password_hash,role,roles) VALUES($1,$2,$3,$4) RETURNING id,username,role,roles,active,created_at', [username, passwordHash, roles[0], roles]);
    const user = result.rows[0];
    await audit(req.user.sub, 'user.created', 'user', user.id, { roles });
    publishReferenceChange('users', 'created');
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
    throw error;
  }
}));

app.post('/api/auth/login', loginLimit, asyncRoute(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password || username.length > 80 || password.length > 200) { await registerLoginFailure(req); return res.status(401).json({ error: 'Usuário ou senha inválidos.' }); }
  if (!(await verifyTurnstile(req.body.turnstileToken, req.ip))) { await registerLoginFailure(req); return res.status(403).json({ error: 'Verificação de segurança inválida. Tente novamente.' }); }
  const user = (await query('SELECT * FROM users WHERE LOWER(username)=LOWER($1)', [username])).rows[0];
  const verified = await bcrypt.compare(password, user?.password_hash || dummyPasswordHash);
  if (!user || !user.active || !verified) { await registerLoginFailure(req); return res.status(401).json({ error: 'Usuário ou senha inválidos.' }); }
  // A limpeza do contador distribuído não precisa atrasar a resposta de uma
  // autenticação válida. Caso a infraestrutura de rate limit esteja lenta,
  // o contador expira normalmente e a proteção continua ativa.
  void clearLoginFailures(req);
  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', authenticate, asyncRoute(async (req, res) => {
  // Invalida também uma cópia de cookie eventualmente roubada.
  await query('UPDATE users SET token_version=token_version+1 WHERE id=$1', [req.user.sub]);
  clearSession(res);
  res.status(204).end();
}));

app.get('/api/me', authenticate, asyncRoute(async (req, res) => {
  const user = (await query('SELECT id,username,role,roles,active,created_at,token_version FROM users WHERE id=$1', [req.user.sub])).rows[0];
  if (!user?.active) return res.status(401).json({ error: 'Usuário inativo.' });
  // Expiração deslizante: uma aba realmente em uso renova a sessão sem trocar
  // o CSRF em andamento e sem obrigar o usuário a atualizar a página.
  setSession(res, user, req.user.csrfToken);
  res.json({ user: publicUser(user) });
}));

app.get('/api/users', authenticate, adminOnly, asyncRoute(async (_req, res) => {
  const result = await query('SELECT id,username,role,roles,active,created_at FROM users ORDER BY username');
  res.json(result.rows.map(publicUser));
}));
app.get('/api/analysts', authenticate, asyncRoute(async (_req, res) => {
  const result = await query("SELECT id,username FROM users WHERE active=true AND roles @> ARRAY['analyst']::varchar[] ORDER BY username");
  res.json(result.rows);
}));
app.get('/api/assignees', authenticate, asyncRoute(async (_req, res) => {
  const result = await query('SELECT id,username FROM users WHERE active=true ORDER BY username');
  res.json(result.rows);
}));
app.patch('/api/users/:id', authenticate, adminOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de usuário inválido.' });
  const { active, password } = req.body;
  const hasRolesUpdate = Object.hasOwn(req.body, 'roles') || Object.hasOwn(req.body, 'role');
  const roles = hasRolesUpdate ? normalizeRoles(req.body.roles ?? req.body.role) : null;
  if (hasRolesUpdate && !roles) return res.status(400).json({ error: 'Selecione uma ou duas funções válidas.' });
  if (password && !isStrongPassword(String(password))) return res.status(400).json({ error: 'A senha deve ter ao menos 12 caracteres, com letras e números.' });
  if ((hasRolesUpdate && !roles.includes('admin')) || active === false) {
    const target = (await query('SELECT role,roles,active FROM users WHERE id=$1', [req.params.id])).rows[0];
    const admins = (await query("SELECT COUNT(*)::int AS total FROM users WHERE active=true AND roles @> ARRAY['admin']::varchar[]")).rows[0].total;
    if (target?.active && hasRole(target, 'admin') && admins === 1) return res.status(400).json({ error: 'O sistema precisa manter um administrador ativo.' });
  }
  const result = await query('UPDATE users SET role=COALESCE($1,role), roles=COALESCE($2,roles), active=COALESCE($3,active), password_hash=COALESCE($4,password_hash), token_version=token_version + CASE WHEN $4 IS NULL AND $2 IS NULL THEN 0 ELSE 1 END WHERE id=$5 RETURNING id,username,role,roles,active,created_at', [roles?.[0] || null, roles, typeof active === 'boolean' ? active : null, password ? await bcrypt.hash(String(password), 12) : null, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Usuário não encontrado.' });
  await audit(req.user.sub, 'user.updated', 'user', req.params.id, { roles, active, passwordReset: !!password });
  publishReferenceChange('users', 'updated');
  res.json({ user: publicUser(result.rows[0]) });
}));
app.delete('/api/users/:id', authenticate, adminOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de usuário inválido.' });
  const target = (await query('SELECT id,role,roles,active FROM users WHERE id=$1', [req.params.id])).rows[0];
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (!target.active) return res.status(400).json({ error: 'Este funcionário já foi excluído.' });
  const admins = (await query("SELECT COUNT(*)::int AS total FROM users WHERE active=true AND roles @> ARRAY['admin']::varchar[]")).rows[0].total;
  if (hasRole(target, 'admin') && admins === 1) return res.status(400).json({ error: 'O sistema precisa manter um administrador ativo.' });
  await query('UPDATE users SET active=false WHERE id=$1', [target.id]);
  await audit(req.user.sub, 'user.deactivated', 'user', target.id);
  publishReferenceChange('users', 'deactivated');
  res.status(204).end();
}));

const cleanText = (value, max, field, { required = false } = {}) => {
  if (value === null || value === undefined) {
    if (required) throw Object.assign(new Error(`${field} é obrigatório.`), { status: 400 });
    return null;
  }
  const result = String(value).trim().replace(/\s+/g, ' ');
  // Valores sentinela produzidos por JavaScript nunca são dados válidos. Sem
  // esta barreira, um formulário incompleto poderia gravar a palavra
  // "undefined" no banco durante uma edição automática.
  if (/^(?:undefined|null)$/i.test(result)) throw Object.assign(new Error(`${field} contém um valor inválido.`), { status: 400 });
  // Impede que marcadores visuais ("." ou "*") passem pela validação como dados.
  if (required && (!result || /^[.*]+$/.test(result))) throw Object.assign(new Error(`${field} é obrigatório.`), { status: 400 });
  if (!result) return null;
  if (result.length > max) throw Object.assign(new Error(`${field} ultrapassa o limite permitido.`), { status: 400 });
  return result;
};
const cleanOptionalDate = (value, field) => {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) throw Object.assign(new Error(`${field} inválida.`), { status: 400 });
  const [year, month, day, hour = '0', minute = '0', second = '0'] = match.slice(1);
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    throw Object.assign(new Error(`${field} inválida.`), { status: 400 });
  }
  return text;
};
const normalizeBrazilianNumber = value => {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  // A interface usa ponto como separador de milhar e vírgula para decimais.
  // Ex.: 1.000,125. O PostgreSQL recebe o número normalizado com ponto.
  return Number(text.includes(',') ? text.replaceAll('.', '').replace(',', '.') : text.replaceAll('.', ''));
};
const cleanNonNegative = (value, max, field, { integer = false, required = false } = {}) => {
  if (value === null || value === undefined || value === '') {
    if (required) throw Object.assign(new Error(`${field} é obrigatório.`), { status: 400 });
    return null;
  }
  const number = normalizeBrazilianNumber(value);
  if (!Number.isFinite(number) || number < 0 || number > max || (integer && !Number.isInteger(number))) throw Object.assign(new Error(`${field} inválido.`), { status: 400 });
  return number;
};
const cleanRequiredDate = (value, field) => {
  const date = cleanOptionalDate(value, field);
  if (!date) throw Object.assign(new Error(`${field} é obrigatória.`), { status: 400 });
  return date;
};
const cleanRequiredDateTime = (value, field) => {
  const date = cleanRequiredDate(value, field);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(date)) {
    throw Object.assign(new Error(`${field} deve incluir data e horário.`), { status: 400 });
  }
  return date;
};
const cleanCnpj = value => {
  const raw = cleanText(value, 40, 'CNPJ');
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14) throw Object.assign(new Error('CNPJ inválido.'), { status: 400 });
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

app.get('/api/clients', authenticate, asyncRoute(async (_req, res) => {
  const result = await query('SELECT * FROM clients ORDER BY active DESC, name');
  res.json(result.rows);
}));
const upperText = value => typeof value === 'string' ? value.toLocaleUpperCase('pt-BR') : value;
const validatedClient = body => ({
  name: upperText(cleanText(body.name, 180, 'Nome do exportador', { required: true })), taxId: cleanCnpj(body.taxId),
  contact: upperText(cleanText(body.contact, 120, 'Contato')), phone: cleanText(body.phone, 50, 'Telefone'),
  // E-mail não é convertido: embora normalmente não diferencie maiúsculas,
  // preservamos o formato informado para compatibilidade com provedores.
  email: cleanText(body.email, 160, 'E-mail'), country: upperText(cleanText(body.country, 80, 'País')), address: upperText(cleanText(body.address, 500, 'Endereço')), rucManual: body.rucManual === true, dueOnly: body.dueOnly === true, ovacao: body.ovacao === true
});
app.post('/api/clients', authenticate, clientCreatorOnly, asyncRoute(async (req, res) => {
  const c = validatedClient(req.body);
  // A exclusão de exportador é lógica para preservar o histórico. Se o mesmo
  // nome for cadastrado novamente, reativamos o registro existente em vez de
  // devolver uma violação de chave única como erro interno.
  const existing = (await query('SELECT id,active FROM clients WHERE LOWER(name)=LOWER($1) LIMIT 1', [c.name])).rows[0];
  if (c.rucManual && c.dueOnly) return res.status(400).json({ error: 'RUC manual e Apenas DU-E não podem ser usados juntos.' });
  if (existing) {
    if (existing.active) return res.status(409).json({ error: 'Este exportador já está cadastrado.' });
    const restored = await query('UPDATE clients SET name=$1,tax_id=$2,contact=$3,phone=$4,email=$5,country=$6,address=$7,ruc_manual=$8,due_only=$9,ovacao=$10,active=true WHERE id=$11 RETURNING *', [c.name, c.taxId, c.contact, c.phone, c.email, c.country, c.address, c.rucManual, c.dueOnly, c.ovacao, existing.id]);
    await audit(req.user.sub, 'client.reactivated', 'client', existing.id);
    publishReferenceChange('clients', 'reactivated');
    return res.status(200).json(restored.rows[0]);
  }
  const result = await query('INSERT INTO clients(name,tax_id,contact,phone,email,country,address,ruc_manual,due_only,ovacao) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [c.name, c.taxId, c.contact, c.phone, c.email, c.country, c.address, c.rucManual, c.dueOnly, c.ovacao]);
  await audit(req.user.sub, 'client.created', 'client', result.rows[0].id);
  publishReferenceChange('clients', 'created');
  res.status(201).json(result.rows[0]);
}));
app.patch('/api/clients/:id', authenticate, clientManagerOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de exportador inválido.' });
  const c = validatedClient(req.body);
  if (c.rucManual && c.dueOnly) return res.status(400).json({ error: 'RUC manual e Apenas DU-E não podem ser usados juntos.' });
  const result = await query('UPDATE clients SET name=$1,tax_id=$2,contact=$3,phone=$4,email=$5,country=$6,address=$7,ruc_manual=$8,due_only=$9,ovacao=$10 WHERE id=$11 RETURNING *', [c.name, c.taxId, c.contact, c.phone, c.email, c.country, c.address, c.rucManual, c.dueOnly, c.ovacao, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Exportador não encontrado.' });
  await audit(req.user.sub, 'client.updated', 'client', req.params.id);
  publishReferenceChange('clients', 'updated');
  res.json(result.rows[0]);
}));
app.delete('/api/clients/:id', authenticate, clientManagerOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de exportador inválido.' });
  // Exclusão lógica: o exportador deixa de aparecer nos novos lançamentos,
  // mas processos já registrados continuam íntegros e exibem seu histórico.
  const result = await query('UPDATE clients SET active=false WHERE id=$1 AND active=true RETURNING id', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Exportador não encontrado ou já excluído.' });
  await audit(req.user.sub, 'client.deactivated', 'client', req.params.id);
  publishReferenceChange('clients', 'deactivated');
  res.status(204).end();
}));

const processColumns = ['process_number','display_process_number','status','client_id','importer','invoice','booking','due_number','due_issue_date','ruc_number','origin_port','destination_port','vessel','agency','carrier','deadline','shipping_date','container_collection_date','collection_terminal','free_time_days','incoterm','shipment_type','bl_type','freight_type','mapa_inspection','isf_lacey','container_quantity','container_type','container_details','cubic_meters','net_weight_kg','gross_weight_kg','packages_quantity','cargo_value','currency'];
const validIncoterms = new Set(['CFR','CIF','CIP','CPT','DAP','DDP','DPU','EXW','FAS','FCA','FOB']);
const validCurrencies = new Set(['BRL','EUR','USD']);
const validateContainerDetails = (value, quantity, mapaInspection) => {
  if (!Array.isArray(value) || value.length > 100) throw Object.assign(new Error('Dados dos contêineres inválidos.'), { status: 400 });
  if (quantity !== null && value.length !== quantity) throw Object.assign(new Error('Informe os dados de todos os contêineres.'), { status: 400 });
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Object.assign(new Error(`Contêiner ${index + 1} inválido.`), { status: 400 });
    const number = cleanText(item.number, 11, 'Número do contêiner', { required: true })?.toUpperCase();
    if (!/^[A-Z]{4}\d{7}$/.test(number)) throw Object.assign(new Error(`Contêiner ${index + 1} deve ter 4 letras e 7 dígitos.`), { status: 400 });
    return {
      number,
      tare: cleanNonNegative(item.tare, 999999, 'Tara', { integer: true, required: true }),
      seal: upperText(cleanText(item.seal, 80, 'Lacre', { required: true })),
      invoice_number: upperText(cleanText(item.invoiceNumber ?? item.invoice_number, 120, 'Nota fiscal')),
      new_seal: mapaInspection ? upperText(cleanText(item.new_seal, 80, 'Novo lacre')) : null
    };
  });
};
const toDbProcess = body => ({
  process_number: body.processNumber, display_process_number: body.displayProcessNumber, status: body.status || 'Em andamento', client_id: body.clientId, importer: body.importer, invoice: body.invoice, booking: body.booking, due_number: body.dueNumber, due_issue_date: body.dueIssueDate, ruc_number: body.rucNumber, origin_port: body.originPort, destination_port: body.destinationPort, vessel: body.vessel, agency: body.agency, carrier: body.carrier, deadline: body.deadline, shipping_date: body.shippingDate, container_collection_date: body.containerCollectionDate, collection_terminal: body.collectionTerminal, free_time_days: body.freeTimeDays, incoterm: body.incoterm, shipment_type: body.shipmentType, bl_type: body.blType, freight_type: body.freightType, mapa_inspection: body.mapaInspection === true, isf_lacey: body.isfLacey === true, container_quantity: body.containerQuantity, container_type: body.containerType, container_details: JSON.stringify(body.containerDetails || []), cubic_meters: body.cubicMeters, net_weight_kg: body.netWeightKg, gross_weight_kg: body.grossWeightKg, packages_quantity: body.packagesQuantity, cargo_value: body.cargoValue, currency: body.currency || 'USD'
});
const validatedProcess = (raw, { rucManual = false, dueOnly = false } = {}) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Object.assign(new Error('Dados do processo inválidos.'), { status: 400 });
  const shipmentType = dueOnly ? 'FCL' : cleanText(raw.shipmentType, 3, 'Tipo de embarque', { required: true });
  if (!['FCL', 'LCL'].includes(shipmentType)) throw Object.assign(new Error('Tipo de embarque inválido.'), { status: 400 });
  if (!dueOnly && typeof raw.mapaInspection !== 'boolean') throw Object.assign(new Error('MAPA é obrigatório.'), { status: 400 });
  if (!dueOnly && typeof raw.isfLacey !== 'boolean') throw Object.assign(new Error('ISF/LACEY é obrigatório.'), { status: 400 });
  const mapaInspection = dueOnly ? false : raw.mapaInspection;
  const isfLacey = dueOnly ? false : raw.isfLacey;
  const containerQuantity = shipmentType === 'LCL' ? null : cleanNonNegative(raw.containerQuantity, 100, 'Quantidade de contêineres', { integer: true, required: true });
  const incoterm = dueOnly ? '' : cleanText(raw.incoterm, 10, 'Incoterm', { required: true }).toUpperCase();
  const currency = dueOnly ? 'USD' : cleanText(raw.currency, 3, 'Moeda', { required: true }).toUpperCase();
  if (!dueOnly && !validIncoterms.has(incoterm)) throw Object.assign(new Error('Incoterm inválido.'), { status: 400 });
  if (!validCurrencies.has(currency)) throw Object.assign(new Error('Moeda inválida.'), { status: 400 });
  const result = {
    processNumber: cleanText(raw.processNumber, 80, 'Número técnico do processo'), displayProcessNumber: cleanText(raw.displayProcessNumber, 80, 'Número do processo'),
    status: cleanText(raw.status || 'Em andamento', 40, 'Status', { required: true }), clientId: cleanText(raw.clientId, 36, 'Exportador', { required: true }),
    importer: cleanText(raw.importer, 200, 'Importador', { required: !dueOnly }), invoice: cleanText(raw.invoice, 120, 'Fatura', { required: true }), booking: cleanText(raw.booking, 120, 'Booking', { required: true }),
    dueNumber: cleanText(raw.dueNumber, 120, 'DUE', { required: !rucManual }), dueIssueDate: (rucManual || dueOnly) ? cleanOptionalDate(raw.dueIssueDate, 'Data da DUE') : cleanRequiredDate(raw.dueIssueDate, 'Data da DUE'), rucNumber: cleanText(raw.rucNumber, 120, 'RUC', { required: !dueOnly }),
    originPort: cleanText(raw.originPort, 120, 'Porto de origem', { required: true }), destinationPort: cleanText(raw.destinationPort, 120, 'Porto de destino', { required: true }),
    vessel: cleanText(raw.vessel, 160, 'Navio', { required: true }), agency: cleanText(raw.agency, 160, 'Agência', { required: !dueOnly }), carrier: cleanText(raw.carrier, 160, 'Armador', { required: !dueOnly }),
    deadline: dueOnly ? null : cleanRequiredDateTime(raw.deadline, 'Deadline de draft'), shippingDate: dueOnly ? null : cleanRequiredDate(raw.shippingDate, 'Data de envio do Draft'), containerCollectionDate: dueOnly ? null : cleanOptionalDate(raw.containerCollectionDate, 'Data da coleta'),
    collectionTerminal: cleanText(raw.collectionTerminal, 160, 'Terminal da coleta'), freeTimeDays: cleanNonNegative(raw.freeTimeDays, 3650, 'Free time', { integer: true }), incoterm, shipmentType,
    blType: cleanText(raw.blType, 80, 'Tipo de BL', { required: !dueOnly }), freightType: cleanText(raw.freightType, 80, 'Tipo de frete', { required: !dueOnly }), mapaInspection, isfLacey, containerQuantity,
    containerType: shipmentType === 'LCL' ? null : cleanText(raw.containerType || (dueOnly ? 'NÃO INFORMADO' : ''), 80, 'Tipo de contêiner', { required: true }), cubicMeters: cleanNonNegative(raw.cubicMeters, 999999999, 'Metragem cúbica', { required: !dueOnly }),
    netWeightKg: cleanNonNegative(raw.netWeightKg, 999999999, 'Peso líquido', { required: !dueOnly }), grossWeightKg: cleanNonNegative(raw.grossWeightKg, 999999999, 'Peso bruto', { required: !dueOnly }),
    packagesQuantity: cleanNonNegative(raw.packagesQuantity, 99999999, 'Quantidade de pacotes', { integer: true, required: !dueOnly }), cargoValue: cleanNonNegative(raw.cargoValue, 999999999999, 'Valor da carga', { required: !dueOnly }), currency
  };
  ['processNumber','displayProcessNumber','importer','invoice','booking','dueNumber','rucNumber','originPort','destinationPort','vessel','agency','carrier','collectionTerminal'].forEach(key => {
    result[key] = upperText(result[key]);
  });
  if (!validId(result.clientId)) throw Object.assign(new Error('Exportador inválido.'), { status: 400 });
  result.containerDetails = shipmentType === 'LCL' ? [] : validateContainerDetails(raw.containerDetails || [], containerQuantity, mapaInspection);
  return result;
};
const processClientSettings = async clientId => {
  if (!validId(clientId)) throw Object.assign(new Error('Exportador inválido.'), { status: 400 });
  const result = await query('SELECT ruc_manual,due_only FROM clients WHERE id=$1', [clientId]);
  if (!result.rowCount) throw Object.assign(new Error('Exportador inválido.'), { status: 400 });
  return { rucManual: result.rows[0].ruc_manual === true, dueOnly: result.rows[0].due_only === true };
};
const auditValue = value => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};
const processChanges = (previous, next) => Object.fromEntries(
  processColumns.filter(column => auditValue(previous[column]) !== auditValue(next[column]))
    .map(column => [column, { before: auditValue(previous[column]), after: auditValue(next[column]) }])
);
// LEFT JOIN preserva a visualização de processos históricos mesmo se um
// exportador ou usuário associado tiver sido desativado/removido no passado.
const processSelect = processDetailSelect;
const canReadAllProcesses = () => true;
// Atualização em tempo quase real para a instância atual do serviço. Os
// eventos carregam somente o tipo da mudança e o id do processo; os dados
// continuam sendo buscados pela API com as regras normais de autorização.
const realtimeSubscribers = new Map();
const realtimeMetrics = { startedAt: new Date().toISOString(), connections: 0, eventsPublished: 0, eventsDelivered: 0, lastEventAt: null };
const writeRealtimeEvent = (res, event, payload) => res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
const publishRealtimeEvent = (event, payload, canReceive = () => true) => {
  realtimeMetrics.eventsPublished += 1;
  realtimeMetrics.lastEventAt = payload.occurredAt || new Date().toISOString();
  for (const { user, res } of realtimeSubscribers.values()) {
    if (!canReceive(user)) continue;
    try { writeRealtimeEvent(res, event, payload); realtimeMetrics.eventsDelivered += 1; } catch { /* conexão encerrada */ }
  }
};
const publishProcessChange = (process, change) => {
  if (!process?.id || !process?.analyst_id) return;
  publishRealtimeEvent('process-changed', { id: process.id, change, occurredAt: new Date().toISOString() }, user => canReadAllProcesses(user));
};
// Clientes e lista de responsáveis já são disponíveis aos usuários autenticados
// pela API. O evento não leva dados pessoais, apenas avisa para renovar o cache.
const publishReferenceChange = (entity, change) => publishRealtimeEvent('reference-changed', { entity, change, occurredAt: new Date().toISOString() });
app.get('/api/events', authenticate, (req, res) => {
  const subscriberId = randomBytes(12).toString('hex');
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  writeRealtimeEvent(res, 'connected', { ok: true });
  const heartbeat = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch { /* conexão encerrada */ } }, 25_000);
  realtimeSubscribers.set(subscriberId, { user: req.user, res });
  realtimeMetrics.connections += 1;
  const cleanup = () => { clearInterval(heartbeat); realtimeSubscribers.delete(subscriberId); };
  req.on('close', cleanup);
});
app.get('/api/realtime/metrics', authenticate, adminOnly, (_req, res) => {
  res.json({ ...realtimeMetrics, activeConnections: realtimeSubscribers.size });
});
app.get('/api/observability/metrics', authenticate, adminOnly, (_req, res) => {
  res.json(observability.snapshot());
});
app.get('/api/reports/database-usage', authenticate, adminOnly, asyncRoute(async (_req, res) => {
  const now = Date.now();
  if (databaseUsageCache.value && databaseUsageCache.expiresAt > now) return res.json(databaseUsageCache.value);
  const result = await query('SELECT pg_database_size(current_database())::bigint AS used_bytes');
  const usedBytes = Math.max(0, Number(result.rows[0]?.used_bytes || 0));
  const usagePercent = Math.round((usedBytes / databaseCapacityBytes) * 1000) / 10;
  const value = {
    usedBytes,
    capacityBytes: databaseCapacityBytes,
    availableBytes: Math.max(0, databaseCapacityBytes - usedBytes),
    usagePercent,
    measuredAt: new Date().toISOString()
  };
  databaseUsageCache.value = value;
  databaseUsageCache.expiresAt = now + databaseUsageCacheMs;
  res.json(value);
}));
// Resumo operacional enxuto: evita que o painel inicial carregue a lista
// inteira de processos. As regras de leitura continuam centralizadas na API.
app.get('/api/dashboard', authenticate, asyncRoute(async (req, res) => {
  const role = primaryRoleFor(req.user);
  // Analistas mantêm a visão própria; ao acumular uma função operacional, a
  // pessoa passa a ter a mesma visão ampla exigida pela segunda responsabilidade.
  const analystOnly = hasRole(req.user, 'analyst') && !['admin','vgm','liberacao','financeiro'].some(item => rolesFor(req.user).includes(item));
  const analystScope = analystOnly ? ' AND p.analyst_id=$1' : '';
  const params = analystOnly ? [req.user.sub] : [];
  const [summary, recent, channels] = await Promise.all([
    query(`SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE p.deadline IS NOT NULL AND p.deadline::date=CURRENT_DATE)::int AS due_today,
      COUNT(*) FILTER (WHERE p.deadline IS NOT NULL AND p.deadline::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::int AS due_next_7_days,
      COUNT(*) FILTER (WHERE p.deadline IS NOT NULL AND p.deadline < NOW())::int AS overdue,
      COUNT(*) FILTER (WHERE p.vgm_status NOT IN ('Sim','Enviado pelo Cliente','Enviando no DRAFT'))::int AS vgm_pending,
      COUNT(*) FILTER (WHERE p.release_status <> 'Sim')::int AS release_pending
      FROM processes p WHERE TRUE${analystScope}`, params),
    query(`${processSelect} WHERE TRUE${analystScope} ORDER BY p.updated_at DESC,p.id DESC LIMIT 6`, params),
    query(`SELECT COALESCE(p.release_channel,'Sem canal') AS name,COUNT(*)::int AS total
      FROM processes p WHERE TRUE${analystScope} GROUP BY p.release_channel ORDER BY total DESC,name`, params)
  ]);
  const values = summary.rows[0] || {};
  // Cada perfil recebe os indicadores mais relevantes; todos continuam sob as
  // mesmas permissões de processos já definidas para o produto.
  const priorities = role === 'vgm' ? ['vgm_pending','due_next_7_days']
    : role === 'liberacao' ? ['release_pending','overdue']
      : role === 'financeiro' ? ['due_next_7_days','total']
        : ['due_today','overdue','vgm_pending','release_pending'];
  res.json({ role, roles: rolesFor(req.user), priorities, summary: values, recent: recent.rows, channels: channels.rows });
}));

const notificationTargetsFor = async ({ type, process, actorId }) => {
  if (!process?.id) return [];
  const roles = type === 'vgm' ? ['admin','vgm'] : type === 'release' ? ['admin','liberacao'] : ['admin','analyst'];
  const recipients = await query('SELECT id,role,roles FROM users WHERE active=TRUE AND roles && $1::varchar[]', [roles]);
  return recipients.rows.filter(user => user.id !== actorId || type !== 'process').map(user => user.id);
};
const createNotification = async ({ userId, processId, type, title, message, dedupeKey }) => {
  await query(`INSERT INTO user_notifications(user_id,process_id,type,title,message,dedupe_key)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id,dedupe_key) DO UPDATE
    SET title=EXCLUDED.title,message=EXCLUDED.message,created_at=NOW(),read_at=NULL`, [userId, processId, type, title, message, dedupeKey]);
};
const notifyProcessChange = async (process, change, actorId = null) => {
  const context = change === 'vgm-updated'
    ? { type:'vgm', title:'Atualização de VGM', message:`VGM atualizado no processo ${process.booking || 'sem booking'}.` }
    : change === 'release-updated'
      ? { type:'release', title:'Atualização de liberação', message:`Liberação atualizada no processo ${process.booking || 'sem booking'}.` }
      : { type:'process', title:'Processo atualizado', message:`O processo ${process.booking || 'sem booking'} recebeu uma atualização.` };
  const recipients = await notificationTargetsFor({ type:context.type, process, actorId });
  await Promise.all(recipients.map(userId => createNotification({ userId, processId:process.id, ...context, dedupeKey:`${context.type}:${process.id}` })));
};
// Os lembretes são calculados quando a central de notificações é consultada.
// Isso evita um worker sempre ativo no plano atual e mantém o envio limitado a
// processos que o perfil já pode consultar. Um cron pode chamar essa mesma
// rotina no futuro, caso seja necessário avisar usuários desconectados.
const deadlineNotificationsEnabled = process.env.DEADLINE_NOTIFICATIONS_ENABLED !== 'false';
const createDeadlineNotificationsFor = async user => {
  if (!deadlineNotificationsEnabled) return;
  let scope = '';
  const params = [];
  const roles = rolesFor(user);
  if (!roles.includes('admin')) {
    const scopes = [];
    if (roles.includes('analyst')) { scopes.push('p.analyst_id=$1'); params.push(user.sub); }
    if (roles.includes('vgm')) scopes.push("COALESCE(p.vgm_status,'Não') NOT IN ('Sim','Enviado pelo Cliente','Enviando no DRAFT')");
    if (roles.includes('liberacao')) scopes.push("COALESCE(p.release_status,'Não') <> 'Sim'");
    if (!scopes.length) return;
    scope = ` AND (${scopes.join(' OR ')})`;
  }
  const result = await query(`SELECT p.id,p.booking,p.deadline::date AS deadline_date,
      CASE
        WHEN p.deadline::date < CURRENT_DATE THEN 'overdue'
        WHEN p.deadline::date = CURRENT_DATE + 1 THEN '24h'
        WHEN p.deadline::date = CURRENT_DATE + 2 THEN '48h'
      END AS stage
    FROM processes p
    WHERE p.deadline IS NOT NULL
      AND (p.deadline::date < CURRENT_DATE OR p.deadline::date IN (CURRENT_DATE + 1,CURRENT_DATE + 2))${scope}
    ORDER BY p.deadline::date ASC,p.id ASC LIMIT 60`, params);
  await Promise.all(result.rows.map(item => {
    const booking = item.booking || 'sem booking';
    const title = item.stage === 'overdue' ? 'Prazo vencido'
      : item.stage === '24h' ? 'Prazo em 24 horas' : 'Prazo em 48 horas';
    return createNotification({
      userId: user.sub, processId: item.id, type: 'deadline', title,
      message: `O deadline de draft do processo ${booking} requer atenção.`,
      dedupeKey: `deadline:${item.stage}:${item.id}:${item.deadline_date}`
    });
  }));
};
app.get('/api/notifications', authenticate, asyncRoute(async (req, res) => {
  await createDeadlineNotificationsFor(req.user);
  const result = await query(`SELECT id,process_id,type,title,message,read_at,created_at
    FROM user_notifications WHERE user_id=$1 ORDER BY read_at NULLS FIRST,created_at DESC LIMIT 30`, [req.user.sub]);
  res.json(result.rows);
}));
app.patch('/api/notifications/:id/read', authenticate, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error:'Notificação inválida.' });
  const result = await query('UPDATE user_notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING id', [req.params.id, req.user.sub]);
  if (!result.rowCount) return res.status(404).json({ error:'Notificação não encontrada.' });
  res.status(204).end();
}));
app.get('/api/processes', authenticate, asyncRoute(async (req, res) => {
  const search = buildProcessSearchQuery(req.query);
  const [items, total] = await Promise.all([
    query(search.itemsSql, search.pageParams),
    query(search.countSql, search.params)
  ]);
  res.json({ items:items.rows, pagination:{ limit:search.limit, offset:search.offset, total:total.rows[0].total, hasMore:search.offset + items.rowCount < total.rows[0].total } });
}));
app.get('/api/calendar', authenticate, asyncRoute(async (req, res) => {
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const limit = Number(req.query.limit || 200);
  const offset = Number(req.query.offset || 0);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(from) || !datePattern.test(to) || from > to || !Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isInteger(offset) || offset < 0 || offset > 5_000) return res.status(400).json({ error:'Período do calendário inválido.' });
  const rangeDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (!Number.isFinite(rangeDays) || rangeDays > 93) return res.status(400).json({ error:'Selecione no máximo três meses no calendário.' });
  // O calendário é pessoal mesmo que a planilha seja compartilhada: evita
  // misturar a agenda operacional de analistas diferentes.
  const calendarWhere = `WHERE (p.deadline::date BETWEEN $1::date AND $2::date
      OR p.container_collection_date BETWEEN $1::date AND $2::date
      OR p.release_schedule::date BETWEEN $1::date AND $2::date
      OR p.release_deadline::date BETWEEN $1::date AND $2::date)
      AND p.analyst_id=$3`;
  const [result, total, prelaunches] = await Promise.all([
    query(`${processCalendarSelect} ${calendarWhere}
      ORDER BY COALESCE(p.release_deadline,p.deadline,p.container_collection_date) ASC,p.id ASC
      LIMIT $4 OFFSET $5`, [from, to, req.user.sub, limit, offset]),
    query(`SELECT COUNT(*)::int AS total FROM processes p ${calendarWhere}`, [from, to, req.user.sub]),
    offset === 0 ? query(`SELECT pl.id,pl.client_id,pl.booking,pl.deadline,c.name AS exporter,pl.created_at
    FROM process_prelaunches pl JOIN clients c ON c.id=pl.client_id
    WHERE pl.analyst_id=$1 AND pl.deadline::date BETWEEN $2::date AND $3::date
    ORDER BY pl.deadline ASC`, [req.user.sub, from, to]) : Promise.resolve({ rows:[] })
  ]);
  const totalCount = total.rows[0].total;
  res.json({
    processes:result.rows,
    prelaunches:prelaunches.rows,
    pagination:{ limit, offset, total:totalCount, hasMore:offset + result.rowCount < totalCount },
    interval:{ from, to }
  });
}));
app.get('/api/prelaunches', authenticate, asyncRoute(async (req, res) => {
  const result = await query(`SELECT pl.id,pl.client_id,pl.booking,pl.deadline,c.name AS exporter,pl.created_at
    FROM process_prelaunches pl JOIN clients c ON c.id=pl.client_id
    WHERE pl.analyst_id=$1 ORDER BY pl.deadline ASC`, [req.user.sub]);
  res.json(result.rows);
}));
app.post('/api/prelaunches', authenticate, processCreatorOnly, asyncRoute(async (req, res) => {
  const clientId = String(req.body.clientId || '').trim();
  const booking = cleanText(req.body.booking, 160, 'Booking', { required:true });
  const deadline = cleanOptionalDate(req.body.deadline, 'Deadline de draft');
  if (!validId(clientId)) return res.status(400).json({ error:'Selecione um exportador válido.' });
  if (!deadline) return res.status(400).json({ error:'Informe o deadline de draft.' });
  const client = await query('SELECT id FROM clients WHERE id=$1 AND active=true', [clientId]);
  if (!client.rowCount) return res.status(400).json({ error:'O exportador selecionado não está disponível.' });
  const result = await query(`INSERT INTO process_prelaunches(analyst_id,client_id,booking,deadline)
    VALUES($1,$2,$3,$4) RETURNING *`, [req.user.sub, clientId, booking, deadline]);
  await audit(req.user.sub, 'process.prelaunch_created', 'process_prelaunch', result.rows[0].id, { clientId, booking, deadline });
  res.status(201).json(result.rows[0]);
}));
app.delete('/api/prelaunches/:id', authenticate, processCreatorOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error:'Identificador de pré-lançamento inválido.' });
  const result = await query('DELETE FROM process_prelaunches WHERE id=$1 AND analyst_id=$2 RETURNING id', [req.params.id, req.user.sub]);
  if (!result.rowCount) return res.status(404).json({ error:'Pré-lançamento não encontrado.' });
  await audit(req.user.sub, 'process.prelaunch_deleted', 'process_prelaunch', req.params.id);
  res.status(204).end();
}));
app.get('/api/processes/:id', authenticate, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const scope = '';
  const params = [req.params.id];
  const result = await query(`${processSelect} WHERE p.id=$1${scope}`, params);
  // Não diferenciar recurso inexistente de recurso sem permissão evita revelar
  // identificadores válidos para usuários sem acesso.
  if (!result.rowCount) return res.status(404).json({ error: 'Processo não encontrado.' });
  res.json(result.rows[0]);
}));
registerProcessWorkspaceRoutes({
  app, authenticate, processEditorOnly, asyncRoute, query, audit, validId,
  upperText, cleanText, validateAttachmentInput, attachmentScanMode
});
app.post('/api/processes', authenticate, processCreatorOnly, asyncRoute(async (req, res) => {
  const body = { ...req.body };
  // A chave é criada pelo navegador uma única vez por lançamento. Repetições
  // por clique duplo, timeout ou reconexão devolvem o mesmo processo, sem
  // proibir processos legítimos que compartilhem o mesmo Booking.
  const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey).trim() : null;
  if (idempotencyKey && !validId(idempotencyKey)) return res.status(400).json({ error: 'Identificador de envio inválido.' });
  if (idempotencyKey) {
    const existing = await query(`${processSelect} WHERE p.idempotency_key=$1`, [idempotencyKey]);
    if (existing.rowCount) return res.status(200).json(existing.rows[0]);
  }
  // A criação não aceita um identificador existente. Essa proteção impede que
  // qualquer falha da interface transforme uma edição em processo duplicado.
  if (String(body.processId || body.id || '').trim()) {
    return res.status(409).json({ error: 'Este processo já existe. Use a edição para salvar alterações.' });
  }
  // A tela usa o Booking como identificação do processo. O banco ainda mantém
  // process_number como campo técnico obrigatório, então ele recebe o Booking.
  // Quando não há Booking informado, é gerado um identificador interno seguro.
  if (!String(body.processNumber || '').trim()) {
    const booking = String(body.booking || '').trim();
    body.processNumber = booking || `SEM-BOOKING-${Date.now()}`;
  }
  const p = toDbProcess(validatedProcess(body, await processClientSettings(body.clientId)));
  const placeholders = processColumns.map((_, i) => `$${i + 1}`).join(',');
  const insertProcess = process => {
    const processValues = processColumns.map(key => process[key] ?? null);
    return query(
      `INSERT INTO processes(${processColumns.join(',')},analyst_id,idempotency_key) VALUES(${placeholders},$${processValues.length + 1},$${processValues.length + 2}) RETURNING *`,
      [...processValues, req.user.sub, idempotencyKey]
    );
  };
  let result;
  try {
    result = await insertProcess(p);
  } catch (error) {
    if (idempotencyKey && error.code === '23505' && String(error.constraint || '').includes('idempotency_key')) {
      const existing = await query(`${processSelect} WHERE p.idempotency_key=$1`, [idempotencyKey]);
      if (existing.rowCount) return res.status(200).json(existing.rows[0]);
    }
    // O booking pode ser usado em mais de um lançamento. process_number é um
    // identificador técnico único, então em caso de repetição mantemos o
    // booking visível e só acrescentamos um sufixo interno invisível ao usuário.
    if (error.code !== '23505' || error.constraint !== 'processes_process_number_key') throw error;
    body.processNumber = `${String(body.processNumber || 'SEM-BOOKING').slice(0, 55)}-${Date.now()}`;
    const retry = toDbProcess(body);
    result = await insertProcess(retry);
  }
  await audit(req.user.sub, 'process.created', 'process', result.rows[0].id);
  notifyProcessChange(result.rows[0], 'created', req.user.sub).catch(() => {});
  publishProcessChange(result.rows[0], 'created');
  res.status(201).json(result.rows[0]);
}));
app.patch('/api/processes/:id', authenticate, processEditorOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const previous = (await query('SELECT * FROM processes WHERE id=$1', [req.params.id])).rows[0];
  if (!previous) return res.status(404).json({ error: 'Processo não encontrado.' });
  const body = { ...req.body };
  if (body.updatedAt && previous.updated_at && new Date(body.updatedAt).getTime() !== new Date(previous.updated_at).getTime()) {
    return res.status(409).json({ error: 'Este processo foi alterado por outro usuário. Feche, abra novamente e confira os dados antes de salvar.' });
  }
  // process_number é um identificador técnico, único e não editável pela
  // interface. Preservá-lo em toda edição evita colisões de unicidade quando
  // o usuário altera booking ou outros campos do processo.
  body.processNumber = previous.process_number;
  const p = toDbProcess(validatedProcess(body, await processClientSettings(body.clientId))); const values = processColumns.map(key => p[key] ?? null);
  const set = processColumns.map((key, i) => `${key}=$${i + 1}`).join(',');
  const result = await query(`UPDATE processes SET ${set} WHERE id=$${values.length + 1} RETURNING *`, [...values, req.params.id]);
  await audit(req.user.sub, 'process.updated', 'process', req.params.id, { changes: processChanges(previous, p) });
  notifyProcessChange(result.rows[0], 'updated', req.user.sub).catch(() => {});
  publishProcessChange(result.rows[0], 'updated');
  res.json(result.rows[0]);
}));
app.delete('/api/processes/:id', authenticate, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const previous = (await query('SELECT analyst_id FROM processes WHERE id=$1', [req.params.id])).rows[0];
  if (!previous) return res.status(404).json({ error: 'Processo não encontrado.' });
  await query('DELETE FROM processes WHERE id=$1', [req.params.id]);
  await audit(req.user.sub, 'process.deleted', 'process', req.params.id);
  publishProcessChange({ id: req.params.id, analyst_id: previous.analyst_id }, 'deleted');
  res.status(204).end();
}));

const validateBulkProcessIds = ids => {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !validId(id))) throw Object.assign(new Error('Selecione entre 1 e 100 processos válidos.'), { status:400 });
  return [...new Set(ids)];
};
// As rotas em lote precisam vir antes de `:id`, pois "bulk" também é um
// valor válido para o parâmetro de rota do Express.
app.patch('/api/processes/bulk/vgm', authenticate, vgmManagerOnly, asyncRoute(async (req, res) => {
  const ids = validateBulkProcessIds(req.body.ids);
  const statuses = ['Não', 'Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT'];
  const vgmStatus = String(req.body.vgmStatus || '');
  if (!statuses.includes(vgmStatus)) return res.status(400).json({ error:'Status de VGM inválido.' });
  const result = await query(`UPDATE processes SET vgm_status=$1,vgm_sent_date=CASE WHEN $1 IN ('Sim','Enviado pelo Cliente','Enviando no DRAFT') THEN COALESCE(vgm_sent_date,NOW()) ELSE NULL END
    WHERE id=ANY($2::uuid[]) RETURNING *`, [vgmStatus, ids]);
  await Promise.all(result.rows.map(process => audit(req.user.sub, 'process.vgm_bulk_updated', 'process', process.id, { vgmStatus })));
  result.rows.forEach(process => publishProcessChange(process, 'vgm-updated'));
  res.json({ updated:result.rowCount });
}));

app.patch('/api/processes/:id/vgm', authenticate, vgmManagerOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const statuses = ['Não', 'Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT'];
  const vgmStatus = String(req.body.vgmStatus || 'Não');
  const physicalProcessAnalyst = String(req.body.physicalProcessAnalyst || '').trim() || null;
  const vgmSentTo = String(req.body.vgmSentTo || '').trim() || null;
  const releaseSchedule = cleanOptionalDate(req.body.releaseSchedule, 'Deadline de agendamento');
  const releaseDeadline = cleanOptionalDate(req.body.releaseDeadline, 'Deadline de liberação');
  if (!statuses.includes(vgmStatus)) return res.status(400).json({ error: 'Status de VGM inválido.' });
  if (vgmSentTo?.length > 160) return res.status(400).json({ error: 'O campo “Enviado para” deve ter no máximo 160 caracteres.' });
  const result = await query(
    `UPDATE processes
        SET vgm_status=$1::varchar(30),
            physical_process_analyst=$2,
            vgm_sent_to=$3,
            release_schedule=$4,
            release_deadline=$5,
            vgm_sent_date=CASE
              WHEN $1::varchar(30) IN ('Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT') AND vgm_sent_date IS NULL THEN NOW()
              WHEN $1::varchar(30) NOT IN ('Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT') THEN NULL
              ELSE vgm_sent_date
            END
      WHERE id=$6
      RETURNING *`,
    [vgmStatus, physicalProcessAnalyst, vgmSentTo, releaseSchedule, releaseDeadline, req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Processo não encontrado.' });
  await audit(req.user.sub, 'process.vgm_updated', 'process', req.params.id, { vgmStatus, physicalProcessAnalyst, vgmSentTo, releaseSchedule, releaseDeadline, vgmSentDate: result.rows[0].vgm_sent_date });
  notifyProcessChange(result.rows[0], 'vgm-updated', req.user.sub).catch(() => {});
  publishProcessChange(result.rows[0], 'vgm-updated');
  res.json(result.rows[0]);
}));

app.patch('/api/processes/bulk/release', authenticate, releaseManagerOnly, asyncRoute(async (req, res) => {
  const ids = validateBulkProcessIds(req.body.ids);
  const releaseStatus = String(req.body.releaseStatus || '');
  if (!['Não','Sim'].includes(releaseStatus)) return res.status(400).json({ error:'Status de liberação inválido.' });
  const result = await query(`UPDATE processes SET release_status=$1,release_date=CASE WHEN $1='Sim' THEN COALESCE(release_date,NOW()) ELSE NULL END
    WHERE id=ANY($2::uuid[]) RETURNING *`, [releaseStatus, ids]);
  await Promise.all(result.rows.map(process => audit(req.user.sub, 'process.release_bulk_updated', 'process', process.id, { releaseStatus })));
  result.rows.forEach(process => publishProcessChange(process, 'release-updated'));
  res.json({ updated:result.rowCount });
}));

app.patch('/api/processes/:id/release', authenticate, releaseManagerOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const requestedReleaseStatus = String(req.body.releaseStatus || 'Não');
  const releaseSchedule = cleanOptionalDate(req.body.releaseSchedule, 'Agendamento de liberação');
  const releaseDeadline = cleanOptionalDate(req.body.releaseDeadline, 'Deadline de liberação');
  const vessel = cleanText(req.body.vessel, 160, 'Navio');
  const releaseChannel = String(req.body.releaseChannel || '').trim() || null;
  const releaseDate = cleanOptionalDate(req.body.releaseDate, 'Data de liberação');
  if (!['Não', 'Sim'].includes(requestedReleaseStatus)) return res.status(400).json({ error: 'Status de liberação inválido.' });
  if (releaseChannel && !['Verde', 'Laranja', 'Vermelho'].includes(releaseChannel)) return res.status(400).json({ error: 'Canal de liberação inválido.' });
  // Canal Verde representa desembaraço concluído. A regra também fica no
  // servidor para evitar que uma requisição manual mantenha o processo como
  // pendente apesar de ter sido classificado no canal verde.
  const releaseStatus = releaseChannel === 'Verde' ? 'Sim' : requestedReleaseStatus;
  const result = await query(`
    UPDATE processes
       SET release_status=$1::varchar(10),
           release_schedule=$2,
           release_deadline=$3,
           vessel=$4,
           release_channel=$5,
           release_date=CASE
             WHEN $1::varchar(10)='Não' THEN NULL
             WHEN $6::timestamp IS NOT NULL THEN $6::timestamp
             WHEN $1::varchar(10)='Sim' AND release_date IS NULL THEN NOW()
             ELSE release_date
           END
     WHERE id=$7
     RETURNING *
  `, [releaseStatus, releaseSchedule, releaseDeadline, vessel, releaseChannel, releaseDate, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Processo não encontrado.' });
  await audit(req.user.sub, 'process.release_updated', 'process', req.params.id, { releaseStatus, releaseSchedule, releaseDeadline, vessel, releaseChannel, releaseDate: result.rows[0].release_date });
  notifyProcessChange(result.rows[0], 'release-updated', req.user.sub).catch(() => {});
  publishProcessChange(result.rows[0], 'release-updated');
  res.json(result.rows[0]);
}));
app.patch('/api/processes/:id/followup', authenticate, followupManagerOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const followupStatus = String(req.body.followupStatus || 'Pendente');
  const followupNote = String(req.body.followupNote || '').trim() || null;
  if (!['Pendente', 'Concluído'].includes(followupStatus)) return res.status(400).json({ error: 'Status de follow up inválido.' });
  if (followupNote?.length > 500) return res.status(400).json({ error: 'A observação pode ter no máximo 500 caracteres.' });
  const result = await query('UPDATE processes SET followup_status=$1, followup_note=$2 WHERE id=$3 RETURNING *', [followupStatus, followupNote, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Processo não encontrado.' });
  await audit(req.user.sub, 'process.followup_updated', 'process', req.params.id, { followupStatus, followupNote });
  publishProcessChange(result.rows[0], 'followup-updated');
  res.json(result.rows[0]);
}));
// Pós-embarque tem data própria: não reutiliza `shipping_date`, que guarda a
// data de envio do draft no lançamento original do processo.
app.patch('/api/processes/:id/post-shipment', authenticate, postShipmentManagerOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const postShipmentDate = cleanOptionalDate(req.body.postShipmentDate, 'Data de embarque');
  const result = await query(`UPDATE processes
    SET post_shipment_date=$1
    WHERE id=$2
    RETURNING *`, [postShipmentDate, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Processo não encontrado.' });
  await audit(req.user.sub, 'process.post_shipment_updated', 'process', req.params.id, { postShipmentDate });
  publishProcessChange(result.rows[0], 'post-shipment-updated');
  res.json(result.rows[0]);
}));

app.get('/api/followup/history', authenticate, followupManagerOnly, asyncRoute(async (req, res) => {
  const ownOnly = hasRole(req.user, 'analyst') && !['admin','vgm','liberacao','financeiro'].some(item => rolesFor(req.user).includes(item));
  const result = await query(`
    SELECT a.id, a.action, a.details, a.created_at, u.username,
           p.id AS process_id, p.booking, c.name AS exporter
      FROM audit_log a
      JOIN users u ON u.id=a.user_id
      JOIN processes p ON p.id=a.entity_id
      JOIN clients c ON c.id=p.client_id
     WHERE a.entity='process'${ownOnly ? ' AND p.analyst_id=$1' : ''}
       AND a.action IN ('process.created','process.updated','process.vgm_updated','process.release_updated','process.followup_updated','process.post_shipment_updated')
     ORDER BY a.created_at DESC
     LIMIT 500
  `, ownOnly ? [req.user.sub] : []);
  res.json(result.rows);
}));

app.get('/api/processes/:id/followup-history', authenticate, followupManagerOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const ownOnly = hasRole(req.user, 'analyst') && !['admin','vgm','liberacao','financeiro'].some(item => rolesFor(req.user).includes(item));
  const result = await query(`
    SELECT a.action, a.details, a.created_at, u.username,
           p.id AS process_id, p.booking, c.name AS exporter
      FROM audit_log a
      JOIN users u ON u.id=a.user_id
      JOIN processes p ON p.id=a.entity_id
      JOIN clients c ON c.id=p.client_id
     WHERE a.entity='process' AND a.entity_id=$1${ownOnly ? ' AND p.analyst_id=$2' : ''}
       AND a.action IN ('process.created','process.updated','process.vgm_updated','process.release_updated','process.followup_updated','process.post_shipment_updated')
     ORDER BY a.created_at ASC
  `, ownOnly ? [req.params.id, req.user.sub] : [req.params.id]);
  res.json(result.rows);
}));

app.get('/api/reports', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  const month = req.query.month ? Number(req.query.month) : null;
  const allPeriods = String(req.query.all || '').toLowerCase() === 'true';
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || (month !== null && (!Number.isInteger(month) || month < 1 || month > 12))) return res.status(400).json({ error: 'Período de relatório inválido.' });
  const params = [year, month];
  // Relatórios operacionais sempre representam o volume de processos
  // lançados/cadastrados no período, e não prazo ou data de embarque.
  const period = allPeriods ? 'TRUE' : `EXTRACT(YEAR FROM p.created_at AT TIME ZONE 'America/Sao_Paulo')=$1 AND ($2::int IS NULL OR EXTRACT(MONTH FROM p.created_at AT TIME ZONE 'America/Sao_Paulo')=$2)`;
  const [total, analysts, exporters] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM processes p WHERE ${period}`, params),
    query(`SELECT u.username AS name,COUNT(*)::int AS total FROM processes p JOIN users u ON u.id=p.analyst_id WHERE ${period} GROUP BY u.username ORDER BY total DESC,name`, params),
    query(`SELECT c.name,COUNT(*)::int AS total FROM processes p JOIN clients c ON c.id=p.client_id WHERE ${period} GROUP BY c.name ORDER BY total DESC,name`, params)
  ]);
  res.json({ year, month, allPeriods, total: total.rows[0].total, analysts: analysts.rows, exporters: exporters.rows });
}));

app.use(createErrorHandler({ localLogPath:path.resolve(here, '../server-errors.log'), logger, alerts }));
// Fallback histórico preservado temporariamente para conferência da migração.
// Ele não é mais chamado no boot e será removido somente após a homologação da
// migração 2026-08-28-001 em banco limpo e em cópia de banco existente.
const legacyEnsureProcessFields = async () => {
  // Mantém o banco compatível com novos campos de capa, inclusive em projetos
  // que já estavam em uso antes dessas funcionalidades serem adicionadas.
  // A instalação foi evoluindo por etapas; por isso, todos os campos usados no
  // lançamento são garantidos aqui. Assim uma atualização incompleta do banco
  // não bloqueia o cadastro de um novo processo.
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0');
  await query('ALTER TABLE clients ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE');
  await query('ALTER TABLE clients ADD COLUMN IF NOT EXISTS ruc_manual BOOLEAN NOT NULL DEFAULT FALSE');
  await query('ALTER TABLE clients ADD COLUMN IF NOT EXISTS due_only BOOLEAN NOT NULL DEFAULT FALSE');
  await query('ALTER TABLE clients ADD COLUMN IF NOT EXISTS ovacao BOOLEAN NOT NULL DEFAULT FALSE');
  // Exportadores "Apenas DU-E" não fornecem os dados operacionais completos.
  // A API preserva a validação completa para os demais exportadores.
  for (const column of ['importer', 'origin_port', 'destination_port', 'deadline']) {
    await query(`ALTER TABLE processes ALTER COLUMN ${column} DROP NOT NULL`);
  }
  await query("ALTER TABLE processes ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'Em andamento'");
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS client_id UUID');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS importer VARCHAR(200)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS invoice VARCHAR(120)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS booking VARCHAR(120)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS due_number VARCHAR(120)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS ruc_number VARCHAR(120)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS origin_port VARCHAR(120)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS destination_port VARCHAR(120)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS vessel VARCHAR(160)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS agency VARCHAR(160)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS carrier VARCHAR(160)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS deadline TIMESTAMP WITHOUT TIME ZONE');
  await query('ALTER TABLE processes ALTER COLUMN deadline TYPE TIMESTAMP WITHOUT TIME ZONE USING deadline::timestamp');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS shipping_date DATE');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS post_shipment_date DATE');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS container_collection_date DATE');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS collection_terminal VARCHAR(160)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS free_time_days INTEGER');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS incoterm VARCHAR(10)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS shipment_type VARCHAR(10)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS bl_type VARCHAR(80)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS freight_type VARCHAR(80)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS mapa_inspection BOOLEAN NOT NULL DEFAULT FALSE');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS isf_lacey BOOLEAN NOT NULL DEFAULT FALSE');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS container_quantity INTEGER');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS container_type VARCHAR(80)');
  await query("ALTER TABLE processes ADD COLUMN IF NOT EXISTS container_details JSONB NOT NULL DEFAULT '[]'::jsonb");
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS cubic_meters NUMERIC(14,3)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS net_weight_kg NUMERIC(14,3)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS gross_weight_kg NUMERIC(14,3)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS packages_quantity INTEGER');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS cargo_value NUMERIC(14,2)');
  await query("ALTER TABLE processes ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD'");
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS due_issue_date DATE');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS display_process_number VARCHAR(80)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS vgm_sent_to VARCHAR(160)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS vgm_sent_date TIMESTAMP WITHOUT TIME ZONE');
  await query("ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_status VARCHAR(10) NOT NULL DEFAULT 'Não'");
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_schedule TIMESTAMP WITHOUT TIME ZONE');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_deadline TIMESTAMP WITHOUT TIME ZONE');
  await query('ALTER TABLE processes ALTER COLUMN release_deadline TYPE TIMESTAMP WITHOUT TIME ZONE USING release_deadline::timestamp');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_channel VARCHAR(10)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_date TIMESTAMP WITHOUT TIME ZONE');
  await query("ALTER TABLE processes ADD COLUMN IF NOT EXISTS followup_status VARCHAR(15) NOT NULL DEFAULT 'Pendente'");
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS followup_note VARCHAR(500)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS idempotency_key UUID');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS processes_idempotency_key_unique_idx ON processes(idempotency_key) WHERE idempotency_key IS NOT NULL');
  await query(`CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql`);
  await query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='processes_updated_at') THEN
      CREATE TRIGGER processes_updated_at BEFORE UPDATE ON processes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
  END $$`);
  // Permite criar o perfil Liberação também em bancos já existentes.
  await query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
  await query("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'analyst', 'vgm', 'financeiro', 'liberacao', 'pos_embarque'))");
  await query('CREATE INDEX IF NOT EXISTS processes_status_deadline_idx ON processes(status, deadline)');
  await query('CREATE INDEX IF NOT EXISTS processes_created_at_idx ON processes(created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS processes_analyst_created_at_idx ON processes(analyst_id, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS processes_client_created_at_idx ON processes(client_id, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS processes_vgm_status_idx ON processes(vgm_status)');
  await query('CREATE INDEX IF NOT EXISTS processes_vgm_sent_date_idx ON processes(vgm_sent_date DESC)');
  await query('CREATE INDEX IF NOT EXISTS processes_release_origin_deadline_idx ON processes(origin_port, release_deadline ASC)');
  await query('CREATE INDEX IF NOT EXISTS processes_post_shipment_date_idx ON processes(post_shipment_date ASC)');
  await query('CREATE INDEX IF NOT EXISTS processes_updated_at_idx ON processes(updated_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS audit_log_entity_created_at_idx ON audit_log(entity, created_at DESC)');
  // Caixa de notificações persistente e por usuário. A chave de deduplicação
  // impede que o mesmo evento gere alertas repetidos em reconexões/reloads.
  await query(`CREATE TABLE IF NOT EXISTS user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    process_id UUID REFERENCES processes(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,
    title VARCHAR(120) NOT NULL,
    message VARCHAR(280) NOT NULL,
    dedupe_key VARCHAR(180) NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id,dedupe_key)
  )`);
  await query('CREATE INDEX IF NOT EXISTS user_notifications_user_unread_idx ON user_notifications(user_id,read_at,created_at DESC)');
  // Recursos de acompanhamento: pequenos, auditáveis e vinculados ao processo.
  // O conteúdo do anexo fica no banco para não depender do disco efêmero do Render.
  await query(`CREATE TABLE IF NOT EXISTS process_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    label VARCHAR(120) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS process_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    body VARCHAR(1000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS process_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    file_name VARCHAR(160) NOT NULL,
    mime_type VARCHAR(80) NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 4194304),
    content BYTEA NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS process_prelaunches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analyst_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    booking VARCHAR(160) NOT NULL,
    deadline TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query('CREATE INDEX IF NOT EXISTS process_checklist_items_process_idx ON process_checklist_items(process_id,completed,created_at)');
  await query('CREATE INDEX IF NOT EXISTS process_comments_process_idx ON process_comments(process_id,created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS process_attachments_process_idx ON process_attachments(process_id,created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS process_prelaunches_analyst_deadline_idx ON process_prelaunches(analyst_id,deadline)');
};

verifySchemaCompatibility({ query })
  .then(() => app.listen(port, () => console.log(`Atlas Export API em http://localhost:${port}`)))
  .catch(error => {
    const code = error?.code || 'SCHEMA_CHECK_FAILED';
    console.error(`Não foi possível validar o esquema do banco (${code}). Execute npm run migrate antes de iniciar a aplicação.`);
    process.exit(1);
  });
