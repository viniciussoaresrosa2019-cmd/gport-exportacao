import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import path from 'node:path';
import { appendFile, readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('Defina um JWT_SECRET forte com pelo menos 32 caracteres.');
const isProduction = process.env.NODE_ENV === 'production';
const sessionCookie = 'gport_session';
const csrfCookie = 'gport_csrf';
const sessionMaxAge = 4 * 60 * 60 * 1000;
const supportedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
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
app.use(express.json({ limit: '256kb', strict: true, type: 'application/json' }));
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../public');
let indexHtmlPromise;
const renderIndex = asyncRoute(async (_req, res) => {
  indexHtmlPromise ||= readFile(path.join(webRoot, 'index.html'), 'utf8');
  const nonce = randomBytes(18).toString('base64');
  res.setHeader('Content-Security-Policy', `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-${nonce}'; connect-src 'self'`);
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send((await indexHtmlPromise).replaceAll('<script>', `<script nonce="${nonce}">`));
});
app.get(['/', '/index.html'], renderIndex);
app.use(express.static(webRoot, {
  etag: true,
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    // O HTML deve sempre ser validado para que uma atualização publicada apareça logo.
    res.setHeader('Cache-Control', filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=86400');
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
const tokenFor = (user, csrfToken) => jwt.sign({ sub: user.id, username: user.username, role: user.role, ver: user.token_version || 0, csrf: csrfToken }, jwtSecret, { expiresIn: '4h', issuer: 'gport-export', audience: 'gport-web' });
const publicUser = user => ({ id: user.id, username: user.username, role: user.role, active: user.active, createdAt: user.created_at });
const validRoles = ['admin', 'analyst', 'vgm', 'financeiro', 'liberacao'];
const isStrongPassword = password => typeof password === 'string' && password.length >= 12 && password.length <= 200 && /[A-Za-z]/.test(password) && /\d/.test(password);
const validId = value => typeof value === 'string' && uuidPattern.test(value);
const setSession = (res, user) => {
  const csrfToken = randomBytes(32).toString('base64url');
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
  query('SELECT id,username,role,active,token_version FROM users WHERE id=$1', [claims.sub])
    .then(result => {
      const user = result.rows[0];
      if (!user?.active || user.token_version !== claims.ver) return res.status(401).json({ error: 'Usuário inativo ou sessão expirada.' });
      // O cargo vem do banco, não apenas do token antigo. Assim exclusões e
      // mudanças de função passam a valer imediatamente.
      req.user = { sub: user.id, username: user.username, role: user.role };
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
const adminOnly = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Acesso restrito a administradores.' });
const processEditorOnly = (req, res, next) => ['admin', 'analyst'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Apenas Analista ou Administrador podem alterar processos.' });
const vgmManagerOnly = (req, res, next) => ['admin', 'vgm'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Apenas VGM ou Administrador podem atualizar este controle.' });
const releaseManagerOnly = (req, res, next) => ['admin', 'liberacao'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Apenas Liberação ou Administrador podem atualizar este controle.' });
const followupManagerOnly = (req, res, next) => ['admin', 'analyst'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Apenas Analista ou Administrador podem atualizar o follow up.' });
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
  const role = String(req.body.role || 'analyst');
  if (!usernamePattern.test(username)) return res.status(400).json({ error: 'Usuário deve ter 3 a 80 caracteres: letras, números, ponto, hífen ou sublinhado.' });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'A senha deve ter ao menos 12 caracteres, com letras e números.' });
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Perfil inválido.' });
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await query('INSERT INTO users(username,password_hash,role) VALUES($1,$2,$3) RETURNING id,username,role,active,created_at', [username, passwordHash, role]);
    const user = result.rows[0];
    await audit(req.user.sub, 'user.created', 'user', user.id, { role });
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
  const user = (await query('SELECT * FROM users WHERE LOWER(username)=LOWER($1)', [username])).rows[0];
  const verified = await bcrypt.compare(password, user?.password_hash || dummyPasswordHash);
  if (!user || !user.active || !verified) { await registerLoginFailure(req); return res.status(401).json({ error: 'Usuário ou senha inválidos.' }); }
  await clearLoginFailures(req);
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
  const user = (await query('SELECT id,username,role,active,created_at FROM users WHERE id=$1', [req.user.sub])).rows[0];
  if (!user?.active) return res.status(401).json({ error: 'Usuário inativo.' });
  res.json({ user: publicUser(user) });
}));

app.get('/api/users', authenticate, adminOnly, asyncRoute(async (_req, res) => {
  const result = await query('SELECT id,username,role,active,created_at FROM users ORDER BY username');
  res.json(result.rows.map(publicUser));
}));
app.get('/api/analysts', authenticate, asyncRoute(async (_req, res) => {
  const result = await query("SELECT id,username FROM users WHERE active=true AND role='analyst' ORDER BY username");
  res.json(result.rows);
}));
app.get('/api/assignees', authenticate, asyncRoute(async (_req, res) => {
  const result = await query('SELECT id,username FROM users WHERE active=true ORDER BY username');
  res.json(result.rows);
}));
app.patch('/api/users/:id', authenticate, adminOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de usuário inválido.' });
  const { role, active, password } = req.body;
  if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'Perfil inválido.' });
  if (password && !isStrongPassword(String(password))) return res.status(400).json({ error: 'A senha deve ter ao menos 12 caracteres, com letras e números.' });
  if ((role && role !== 'admin') || active === false) {
    const target = (await query('SELECT role,active FROM users WHERE id=$1', [req.params.id])).rows[0];
    const admins = (await query("SELECT COUNT(*)::int AS total FROM users WHERE role='admin' AND active=true")).rows[0].total;
    if (target?.role === 'admin' && target?.active && admins === 1) return res.status(400).json({ error: 'O sistema precisa manter um administrador ativo.' });
  }
  const result = await query('UPDATE users SET role=COALESCE($1,role), active=COALESCE($2,active), password_hash=COALESCE($3,password_hash), token_version=token_version + CASE WHEN $3 IS NULL THEN 0 ELSE 1 END WHERE id=$4 RETURNING id,username,role,active,created_at', [role || null, typeof active === 'boolean' ? active : null, password ? await bcrypt.hash(String(password), 12) : null, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Usuário não encontrado.' });
  await audit(req.user.sub, 'user.updated', 'user', req.params.id, { role, active, passwordReset: !!password });
  publishReferenceChange('users', 'updated');
  res.json({ user: publicUser(result.rows[0]) });
}));
app.delete('/api/users/:id', authenticate, adminOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de usuário inválido.' });
  const target = (await query('SELECT id,role,active FROM users WHERE id=$1', [req.params.id])).rows[0];
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (!target.active) return res.status(400).json({ error: 'Este funcionário já foi excluído.' });
  const admins = (await query("SELECT COUNT(*)::int AS total FROM users WHERE role='admin' AND active=true")).rows[0].total;
  if (target.role === 'admin' && admins === 1) return res.status(400).json({ error: 'O sistema precisa manter um administrador ativo.' });
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
  if (required && !result) throw Object.assign(new Error(`${field} é obrigatório.`), { status: 400 });
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
const cleanNonNegative = (value, max, field, { integer = false } = {}) => {
  if (value === null || value === undefined || value === '') return null;
  const number = normalizeBrazilianNumber(value);
  if (!Number.isFinite(number) || number < 0 || number > max || (integer && !Number.isInteger(number))) throw Object.assign(new Error(`${field} inválido.`), { status: 400 });
  return number;
};

app.get('/api/clients', authenticate, asyncRoute(async (_req, res) => {
  const result = await query('SELECT * FROM clients ORDER BY active DESC, name');
  res.json(result.rows);
}));
const validatedClient = body => ({
  name: cleanText(body.name, 180, 'Nome do exportador', { required: true }), taxId: cleanText(body.taxId, 40, 'CNPJ'),
  contact: cleanText(body.contact, 120, 'Contato'), phone: cleanText(body.phone, 50, 'Telefone'),
  email: cleanText(body.email, 160, 'E-mail'), country: cleanText(body.country, 80, 'País'), address: cleanText(body.address, 500, 'Endereço')
});
app.post('/api/clients', authenticate, processEditorOnly, asyncRoute(async (req, res) => {
  const c = validatedClient(req.body);
  const result = await query('INSERT INTO clients(name,tax_id,contact,phone,email,country,address) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [c.name, c.taxId, c.contact, c.phone, c.email, c.country, c.address]);
  await audit(req.user.sub, 'client.created', 'client', result.rows[0].id);
  publishReferenceChange('clients', 'created');
  res.status(201).json(result.rows[0]);
}));
app.patch('/api/clients/:id', authenticate, processEditorOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de exportador inválido.' });
  const c = validatedClient(req.body);
  const result = await query('UPDATE clients SET name=$1,tax_id=$2,contact=$3,phone=$4,email=$5,country=$6,address=$7 WHERE id=$8 RETURNING *', [c.name, c.taxId, c.contact, c.phone, c.email, c.country, c.address, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Exportador não encontrado.' });
  await audit(req.user.sub, 'client.updated', 'client', req.params.id);
  publishReferenceChange('clients', 'updated');
  res.json(result.rows[0]);
}));
app.delete('/api/clients/:id', authenticate, processEditorOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de exportador inválido.' });
  // Exclusão lógica: o exportador deixa de aparecer nos novos lançamentos,
  // mas processos já registrados continuam íntegros e exibem seu histórico.
  const result = await query('UPDATE clients SET active=false WHERE id=$1 AND active=true RETURNING id', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Exportador não encontrado ou já excluído.' });
  await audit(req.user.sub, 'client.deactivated', 'client', req.params.id);
  publishReferenceChange('clients', 'deactivated');
  res.status(204).end();
}));

const processColumns = ['process_number','display_process_number','status','client_id','importer','invoice','booking','due_number','due_issue_date','ruc_number','origin_port','destination_port','vessel','agency','carrier','deadline','shipping_date','container_collection_date','collection_terminal','free_time_days','incoterm','shipment_type','bl_type','freight_type','mapa_inspection','container_quantity','container_type','container_details','cubic_meters','net_weight_kg','gross_weight_kg','packages_quantity','cargo_value','currency'];
const validIncoterms = new Set(['CFR','CIF','CIP','CPT','DAP','DDP','DPU','EXW','FAS','FCA','FOB']);
const validCurrencies = new Set(['BRL','EUR','USD']);
const validateContainerDetails = (value, quantity, mapaInspection) => {
  if (!Array.isArray(value) || value.length > 100) throw Object.assign(new Error('Dados dos contêineres inválidos.'), { status: 400 });
  if (quantity !== null && value.length > quantity) throw Object.assign(new Error('A quantidade de contêineres não confere.'), { status: 400 });
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Object.assign(new Error(`Contêiner ${index + 1} inválido.`), { status: 400 });
    return {
      number: cleanText(item.number, 40, 'Número do contêiner'), tare: cleanNonNegative(item.tare, 999999, 'Tara', { integer: true }),
      seal: cleanText(item.seal, 80, 'Lacre'), new_seal: mapaInspection ? cleanText(item.new_seal, 80, 'Novo lacre') : null
    };
  });
};
const toDbProcess = body => ({
  process_number: body.processNumber, display_process_number: body.displayProcessNumber, status: body.status || 'Em andamento', client_id: body.clientId, importer: body.importer, invoice: body.invoice, booking: body.booking, due_number: body.dueNumber, due_issue_date: body.dueIssueDate, ruc_number: body.rucNumber, origin_port: body.originPort, destination_port: body.destinationPort, vessel: body.vessel, agency: body.agency, carrier: body.carrier, deadline: body.deadline, shipping_date: body.shippingDate, container_collection_date: body.containerCollectionDate, collection_terminal: body.collectionTerminal, free_time_days: body.freeTimeDays, incoterm: body.incoterm, shipment_type: body.shipmentType, bl_type: body.blType, freight_type: body.freightType, mapa_inspection: body.mapaInspection === true, container_quantity: body.containerQuantity, container_type: body.containerType, container_details: JSON.stringify(body.containerDetails || []), cubic_meters: body.cubicMeters, net_weight_kg: body.netWeightKg, gross_weight_kg: body.grossWeightKg, packages_quantity: body.packagesQuantity, cargo_value: body.cargoValue, currency: body.currency || 'USD'
});
const validatedProcess = raw => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Object.assign(new Error('Dados do processo inválidos.'), { status: 400 });
  const shipmentType = raw.shipmentType ? cleanText(raw.shipmentType, 3, 'Tipo de embarque') : null;
  if (shipmentType && !['FCL', 'LCL'].includes(shipmentType)) throw Object.assign(new Error('Tipo de embarque inválido.'), { status: 400 });
  const mapaInspection = raw.mapaInspection === true;
  const containerQuantity = shipmentType === 'LCL' ? null : cleanNonNegative(raw.containerQuantity, 100, 'Quantidade de contêineres', { integer: true });
  const incoterm = raw.incoterm ? cleanText(raw.incoterm, 10, 'Incoterm').toUpperCase() : null;
  const currency = raw.currency ? cleanText(raw.currency, 3, 'Moeda').toUpperCase() : 'USD';
  if (incoterm && !validIncoterms.has(incoterm)) throw Object.assign(new Error('Incoterm inválido.'), { status: 400 });
  if (!validCurrencies.has(currency)) throw Object.assign(new Error('Moeda inválida.'), { status: 400 });
  const result = {
    processNumber: cleanText(raw.processNumber, 80, 'Número técnico do processo'), displayProcessNumber: cleanText(raw.displayProcessNumber, 80, 'Número do processo'),
    status: cleanText(raw.status || 'Em andamento', 40, 'Status', { required: true }), clientId: cleanText(raw.clientId, 36, 'Exportador', { required: true }),
    importer: cleanText(raw.importer, 200, 'Importador', { required: true }), invoice: cleanText(raw.invoice, 120, 'Fatura'), booking: cleanText(raw.booking, 120, 'Booking'),
    dueNumber: cleanText(raw.dueNumber, 120, 'DUE'), dueIssueDate: cleanOptionalDate(raw.dueIssueDate, 'Data da DUE'), rucNumber: cleanText(raw.rucNumber, 120, 'RUC'),
    originPort: cleanText(raw.originPort, 120, 'Porto de origem', { required: true }), destinationPort: cleanText(raw.destinationPort, 120, 'Porto de destino', { required: true }),
    vessel: cleanText(raw.vessel, 160, 'Navio'), agency: cleanText(raw.agency, 160, 'Agência'), carrier: cleanText(raw.carrier, 160, 'Armador'),
    deadline: cleanOptionalDate(raw.deadline, 'Deadline de draft'), shippingDate: cleanOptionalDate(raw.shippingDate, 'Data de envio'), containerCollectionDate: cleanOptionalDate(raw.containerCollectionDate, 'Data de coleta'),
    collectionTerminal: cleanText(raw.collectionTerminal, 160, 'Terminal'), freeTimeDays: cleanNonNegative(raw.freeTimeDays, 3650, 'Free time', { integer: true }), incoterm, shipmentType,
    blType: cleanText(raw.blType, 80, 'Tipo de BL'), freightType: cleanText(raw.freightType, 80, 'Tipo de frete'), mapaInspection, containerQuantity,
    containerType: shipmentType === 'LCL' ? null : cleanText(raw.containerType, 80, 'Tipo de contêiner'), cubicMeters: cleanNonNegative(raw.cubicMeters, 999999999, 'Metragem cúbica'),
    netWeightKg: cleanNonNegative(raw.netWeightKg, 999999999, 'Peso líquido'), grossWeightKg: cleanNonNegative(raw.grossWeightKg, 999999999, 'Peso bruto'),
    packagesQuantity: cleanNonNegative(raw.packagesQuantity, 99999999, 'Quantidade de pacotes', { integer: true }), cargoValue: cleanNonNegative(raw.cargoValue, 999999999999, 'Valor da carga'), currency
  };
  if (!validId(result.clientId)) throw Object.assign(new Error('Exportador inválido.'), { status: 400 });
  if (!result.deadline) throw Object.assign(new Error('Deadline de draft é obrigatório.'), { status: 400 });
  result.containerDetails = shipmentType === 'LCL' ? [] : validateContainerDetails(raw.containerDetails || [], containerQuantity, mapaInspection);
  return result;
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
const processSelect = `SELECT p.*,c.name AS exporter,u.username AS analyst FROM processes p JOIN clients c ON c.id=p.client_id JOIN users u ON u.id=p.analyst_id`;
const processReaderRoles = new Set(['admin', 'vgm', 'financeiro', 'liberacao']);
const canReadAllProcesses = user => processReaderRoles.has(user.role);
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
  publishRealtimeEvent('process-changed', { id: process.id, change, occurredAt: new Date().toISOString() }, user => canReadAllProcesses(user) || user.sub === process.analyst_id);
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
const processSearchFields = {
  todos: "CONCAT_WS(' ',p.booking,p.process_number,p.display_process_number,c.name,p.importer,p.invoice,p.origin_port,p.destination_port,p.vessel,u.username)",
  booking: 'p.booking', exportador: 'c.name', importador: 'p.importer', fatura: 'p.invoice',
  origem: 'p.origin_port', destino: 'p.destination_port', navio: 'p.vessel', analista: 'u.username',
  prazo: "TO_CHAR(p.deadline,'DD/MM')", envio: "TO_CHAR(p.shipping_date,'DD/MM')", coleta: "TO_CHAR(p.container_collection_date,'DD/MM')",
  agencia: 'p.agency', armador: 'p.carrier', tipoembarque: 'p.shipment_type', tipobl: 'p.bl_type', tipofrete: 'p.freight_type',
  vistoriomapa: "CASE WHEN p.mapa_inspection THEN 'Sim' ELSE 'Não' END", incoterm: 'p.incoterm', containers: "p.container_details::text",
  qtdcontainers: 'p.container_quantity::text', tipocontainer: 'p.container_type', terminal: 'p.collection_terminal', freetime: 'p.free_time_days::text',
  metragem: 'p.cubic_meters::text', pesoliquido: 'p.net_weight_kg::text', pesobruto: 'p.gross_weight_kg::text', volumes: 'p.packages_quantity::text',
  valor: 'p.cargo_value::text', moeda: 'p.currency', due: 'p.due_number', ruc: 'p.ruc_number'
};

app.get('/api/processes', authenticate, asyncRoute(async (req, res) => {
  const term = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const field = String(req.query.field || 'todos').trim().toLowerCase();
  const limit = Number(req.query.limit || 50);
  const offset = Number(req.query.offset || 0);
  if (term.length > 100 || status.length > 40 || !Object.hasOwn(processSearchFields, field) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1_000_000) return res.status(400).json({ error: 'Filtro inválido.' });
  const scope = canReadAllProcesses(req.user) ? '' : ' AND p.analyst_id=$3';
  const params = canReadAllProcesses(req.user) ? [status, term] : [status, term, req.user.sub];
  const next = params.length + 1;
  const where = `WHERE ($1='' OR p.status=$1) AND ($2='' OR ${processSearchFields[field]} ILIKE '%'||$2||'%')${scope}`;
  const [items, total] = await Promise.all([
    query(`${processSelect} ${where} ORDER BY p.created_at DESC,p.id DESC LIMIT $${next} OFFSET $${next + 1}`, [...params, limit, offset]),
    query(`SELECT COUNT(*)::int AS total FROM processes p JOIN clients c ON c.id=p.client_id JOIN users u ON u.id=p.analyst_id ${where}`, params)
  ]);
  res.json({ items: items.rows, pagination: { limit, offset, total: total.rows[0].total, hasMore: offset + items.rowCount < total.rows[0].total } });
}));
app.get('/api/processes/:id', authenticate, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const scope = canReadAllProcesses(req.user) ? '' : ' AND p.analyst_id=$2';
  const params = canReadAllProcesses(req.user) ? [req.params.id] : [req.params.id, req.user.sub];
  const result = await query(`${processSelect} WHERE p.id=$1${scope}`, params);
  // Não diferenciar recurso inexistente de recurso sem permissão evita revelar
  // identificadores válidos para usuários sem acesso.
  if (!result.rowCount) return res.status(404).json({ error: 'Processo não encontrado.' });
  res.json(result.rows[0]);
}));
app.post('/api/processes', authenticate, processEditorOnly, asyncRoute(async (req, res) => {
  const body = { ...req.body };
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
  const p = toDbProcess(validatedProcess(body));
  const values = processColumns.map(key => p[key] ?? null);
  const placeholders = processColumns.map((_, i) => `$${i + 1}`).join(',');
  let result;
  try {
    result = await query(`INSERT INTO processes(${processColumns.join(',')},analyst_id) VALUES(${placeholders},$${values.length + 1}) RETURNING *`, [...values, req.user.sub]);
  } catch (error) {
    // O booking pode ser usado em mais de um lançamento. process_number é um
    // identificador técnico único, então em caso de repetição mantemos o
    // booking visível e só acrescentamos um sufixo interno invisível ao usuário.
    if (error.code !== '23505' || error.constraint !== 'processes_process_number_key') throw error;
    body.processNumber = `${String(body.processNumber || 'SEM-BOOKING').slice(0, 55)}-${Date.now()}`;
    const retry = toDbProcess(body);
    const retryValues = processColumns.map(key => retry[key] ?? null);
    result = await query(`INSERT INTO processes(${processColumns.join(',')},analyst_id) VALUES(${placeholders},$${retryValues.length + 1}) RETURNING *`, [...retryValues, req.user.sub]);
  }
  await audit(req.user.sub, 'process.created', 'process', result.rows[0].id);
  publishProcessChange(result.rows[0], 'created');
  res.status(201).json(result.rows[0]);
}));
app.patch('/api/processes/:id', authenticate, processEditorOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const previous = (await query('SELECT * FROM processes WHERE id=$1', [req.params.id])).rows[0];
  if (!previous) return res.status(404).json({ error: 'Processo não encontrado.' });
  if (req.user.role !== 'admin' && previous.analyst_id !== req.user.sub) return res.status(403).json({ error: 'Você só pode alterar seus próprios processos.' });
  const body = { ...req.body };
  if (body.updatedAt && previous.updated_at && new Date(body.updatedAt).getTime() !== new Date(previous.updated_at).getTime()) {
    return res.status(409).json({ error: 'Este processo foi alterado por outro usuário. Feche, abra novamente e confira os dados antes de salvar.' });
  }
  // process_number é um identificador técnico, único e não editável pela
  // interface. Preservá-lo em toda edição evita colisões de unicidade quando
  // o usuário altera booking ou outros campos do processo.
  body.processNumber = previous.process_number;
  const p = toDbProcess(validatedProcess(body)); const values = processColumns.map(key => p[key] ?? null);
  const set = processColumns.map((key, i) => `${key}=$${i + 1}`).join(',');
  const result = await query(`UPDATE processes SET ${set} WHERE id=$${values.length + 1} RETURNING *`, [...values, req.params.id]);
  await audit(req.user.sub, 'process.updated', 'process', req.params.id, { changes: processChanges(previous, p) });
  publishProcessChange(result.rows[0], 'updated');
  res.json(result.rows[0]);
}));
app.delete('/api/processes/:id', authenticate, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const previous = (await query('SELECT analyst_id FROM processes WHERE id=$1', [req.params.id])).rows[0];
  if (!previous) return res.status(404).json({ error: 'Processo não encontrado.' });
  if (req.user.role !== 'admin' && previous.analyst_id !== req.user.sub) return res.status(403).json({ error: 'Você só pode excluir seus próprios processos.' });
  await query('DELETE FROM processes WHERE id=$1', [req.params.id]);
  await audit(req.user.sub, 'process.deleted', 'process', req.params.id);
  publishProcessChange({ id: req.params.id, analyst_id: previous.analyst_id }, 'deleted');
  res.status(204).end();
}));

app.patch('/api/processes/:id/vgm', authenticate, vgmManagerOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const statuses = ['Não', 'Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT'];
  const vgmStatus = String(req.body.vgmStatus || 'Não');
  const physicalProcessAnalyst = String(req.body.physicalProcessAnalyst || '').trim() || null;
  const vgmSentTo = String(req.body.vgmSentTo || '').trim() || null;
  if (!statuses.includes(vgmStatus)) return res.status(400).json({ error: 'Status de VGM inválido.' });
  if (vgmSentTo?.length > 160) return res.status(400).json({ error: 'O campo “Enviado para” deve ter no máximo 160 caracteres.' });
  const result = await query(
    `UPDATE processes
        SET vgm_status=$1::varchar(30),
            physical_process_analyst=$2,
            vgm_sent_to=$3,
            vgm_sent_date=CASE
              WHEN $1::varchar(30) IN ('Sim', 'Enviado pelo Cliente') AND vgm_sent_date IS NULL THEN NOW()
              WHEN $1::varchar(30) NOT IN ('Sim', 'Enviado pelo Cliente') THEN NULL
              ELSE vgm_sent_date
            END
      WHERE id=$4
      RETURNING *`,
    [vgmStatus, physicalProcessAnalyst, vgmSentTo, req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Processo não encontrado.' });
  await audit(req.user.sub, 'process.vgm_updated', 'process', req.params.id, { vgmStatus, physicalProcessAnalyst, vgmSentTo, vgmSentDate: result.rows[0].vgm_sent_date });
  publishProcessChange(result.rows[0], 'vgm-updated');
  res.json(result.rows[0]);
}));

app.patch('/api/processes/:id/release', authenticate, releaseManagerOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const releaseStatus = String(req.body.releaseStatus || 'Não');
  const releaseSchedule = cleanOptionalDate(req.body.releaseSchedule, 'Agendamento de liberação');
  const releaseDeadline = cleanOptionalDate(req.body.releaseDeadline, 'Deadline de liberação');
  const vessel = cleanText(req.body.vessel, 160, 'Navio');
  const releaseChannel = String(req.body.releaseChannel || '').trim() || null;
  const releaseDate = cleanOptionalDate(req.body.releaseDate, 'Data de liberação');
  if (!['Não', 'Sim'].includes(releaseStatus)) return res.status(400).json({ error: 'Status de liberação inválido.' });
  if (releaseChannel && !['Verde', 'Laranja', 'Vermelho'].includes(releaseChannel)) return res.status(400).json({ error: 'Canal de liberação inválido.' });
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

app.get('/api/followup/history', authenticate, followupManagerOnly, asyncRoute(async (req, res) => {
  const ownOnly = req.user.role === 'analyst';
  const result = await query(`
    SELECT a.id, a.action, a.details, a.created_at, u.username,
           p.id AS process_id, p.booking, c.name AS exporter
      FROM audit_log a
      JOIN users u ON u.id=a.user_id
      JOIN processes p ON p.id=a.entity_id
      JOIN clients c ON c.id=p.client_id
     WHERE a.entity='process'${ownOnly ? ' AND p.analyst_id=$1' : ''}
       AND a.action IN ('process.created','process.updated','process.vgm_updated','process.release_updated','process.followup_updated')
     ORDER BY a.created_at DESC
     LIMIT 500
  `, ownOnly ? [req.user.sub] : []);
  res.json(result.rows);
}));

app.get('/api/processes/:id/followup-history', authenticate, followupManagerOnly, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de processo inválido.' });
  const ownOnly = req.user.role === 'analyst';
  const result = await query(`
    SELECT a.action, a.details, a.created_at, u.username,
           p.id AS process_id, p.booking, c.name AS exporter
      FROM audit_log a
      JOIN users u ON u.id=a.user_id
      JOIN processes p ON p.id=a.entity_id
      JOIN clients c ON c.id=p.client_id
     WHERE a.entity='process' AND a.entity_id=$1${ownOnly ? ' AND p.analyst_id=$2' : ''}
       AND a.action IN ('process.created','process.updated','process.vgm_updated','process.release_updated','process.followup_updated')
     ORDER BY a.created_at ASC
  `, ownOnly ? [req.params.id, req.user.sub] : [req.params.id]);
  res.json(result.rows);
}));

app.get('/api/reports', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  const month = req.query.month ? Number(req.query.month) : null;
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || (month !== null && (!Number.isInteger(month) || month < 1 || month > 12))) return res.status(400).json({ error: 'Período de relatório inválido.' });
  const params = [year, month];
  const period = `p.shipping_date IS NOT NULL AND EXTRACT(YEAR FROM p.shipping_date)=$1 AND ($2::int IS NULL OR EXTRACT(MONTH FROM p.shipping_date)=$2)`;
  const [total, analysts, exporters] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM processes p WHERE ${period}`, params),
    query(`SELECT u.username AS name,COUNT(*)::int AS total FROM processes p JOIN users u ON u.id=p.analyst_id WHERE ${period} GROUP BY u.username ORDER BY total DESC,name`, params),
    query(`SELECT c.name,COUNT(*)::int AS total FROM processes p JOIN clients c ON c.id=p.client_id WHERE ${period} GROUP BY c.name ORDER BY total DESC,name`, params)
  ]);
  res.json({ year, month, total: total.rows[0].total, analysts: analysts.rows, exporters: exporters.rows });
}));

app.use((error, req, res, _next) => {
  const status = Number.isInteger(error?.status)
    ? error.status
    : error?.type === 'entity.too.large'
      ? 413
      : error?.type === 'entity.parse.failed'
        ? 400
        : 500;
  // Nunca escreva corpo, senha, token, query string ou pilha de banco nos logs.
  const errorEntry = JSON.stringify({ time: new Date().toISOString(), method: req.method, path: req.path, status, code: error?.code || null }) + '\n';
  appendFile(path.resolve(here, '../server-errors.log'), errorEntry, 'utf8').catch(() => {});
  if (status >= 500) console.error(`[erro] ${req.method} ${req.path} ${error?.code || error?.name || 'internal'}`);
  const message = status === 413
    ? 'Solicitação muito grande.'
    : error?.type === 'entity.parse.failed'
      ? 'JSON inválido.'
      : status < 500
        ? error.message
        : 'Erro interno do servidor.';
  res.status(status).json({ error: message });
});
const ensureProcessFields = async () => {
  // Mantém o banco compatível com novos campos de capa, inclusive em projetos
  // que já estavam em uso antes dessas funcionalidades serem adicionadas.
  // A instalação foi evoluindo por etapas; por isso, todos os campos usados no
  // lançamento são garantidos aqui. Assim uma atualização incompleta do banco
  // não bloqueia o cadastro de um novo processo.
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0');
  await query('ALTER TABLE clients ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE');
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
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS deadline DATE');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS shipping_date DATE');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS container_collection_date DATE');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS collection_terminal VARCHAR(160)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS free_time_days INTEGER');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS incoterm VARCHAR(10)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS shipment_type VARCHAR(10)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS bl_type VARCHAR(80)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS freight_type VARCHAR(80)');
  await query('ALTER TABLE processes ADD COLUMN IF NOT EXISTS mapa_inspection BOOLEAN NOT NULL DEFAULT FALSE');
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
  await query(`CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql`);
  await query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='processes_updated_at') THEN
      CREATE TRIGGER processes_updated_at BEFORE UPDATE ON processes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
  END $$`);
  // Permite criar o perfil Liberação também em bancos já existentes.
  await query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
  await query("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'analyst', 'vgm', 'financeiro', 'liberacao'))");
  await query('CREATE INDEX IF NOT EXISTS processes_status_deadline_idx ON processes(status, deadline)');
  await query('CREATE INDEX IF NOT EXISTS processes_analyst_created_at_idx ON processes(analyst_id, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS processes_client_created_at_idx ON processes(client_id, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS processes_vgm_status_idx ON processes(vgm_status)');
  await query('CREATE INDEX IF NOT EXISTS audit_log_entity_created_at_idx ON audit_log(entity, created_at DESC)');
};

ensureProcessFields()
  .then(() => app.listen(port, () => console.log(`Atlas Export API em http://localhost:${port}`)))
  .catch(error => {
    console.error('Não foi possível preparar o banco de dados:', error);
    process.exit(1);
  });
