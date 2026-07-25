import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import path from 'node:path';
import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('Defina um JWT_SECRET forte com pelo menos 32 caracteres.');

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self'");
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  // Dados operacionais e sessões nunca devem ser reaproveitados pelo cache do navegador.
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || false }));
app.use(express.json({ limit: '1mb' }));
const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../public');
app.use(express.static(webRoot, {
  etag: true,
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    // O HTML deve sempre ser validado para que uma atualização publicada apareça logo.
    res.setHeader('Cache-Control', filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=86400');
  }
}));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const tokenFor = user => jwt.sign({ sub: user.id, username: user.username, role: user.role }, jwtSecret, { expiresIn: '8h' });
const publicUser = user => ({ id: user.id, username: user.username, role: user.role, active: user.active, createdAt: user.created_at });
const validRoles = ['admin', 'analyst', 'vgm', 'financeiro', 'liberacao'];

const loginAttempts = new Map();
const loginAttemptKey = req => `${req.ip}:${req.path}`;
const loginLimit = (req, res, next) => {
  const key = loginAttemptKey(req);
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (entry && now > entry.resetAt) loginAttempts.delete(key);
  else if (entry?.count >= 10) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' });
  next();
};
const registerLoginFailure = req => {
  const key = loginAttemptKey(req), now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
  else entry.count += 1;
};
const clearLoginFailures = req => loginAttempts.delete(loginAttemptKey(req));

function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Autenticação obrigatória.' });
  let claims;
  try { claims = jwt.verify(token, jwtSecret); }
  catch { return res.status(401).json({ error: 'Sessão inválida ou expirada.' }); }
  query('SELECT id,username,role,active FROM users WHERE id=$1', [claims.sub])
    .then(result => {
      const user = result.rows[0];
      if (!user?.active) return res.status(401).json({ error: 'Usuário inativo ou sessão expirada.' });
      // O cargo vem do banco, não apenas do token antigo. Assim exclusões e
      // mudanças de função passam a valer imediatamente.
      req.user = { sub: user.id, username: user.username, role: user.role };
      next();
    })
    .catch(next);
}
const adminOnly = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Acesso restrito a administradores.' });
const vgmManagerOnly = (req, res, next) => ['admin', 'vgm'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Apenas VGM ou Administrador podem atualizar este controle.' });
const releaseManagerOnly = (req, res, next) => ['admin', 'liberacao'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Apenas Liberação ou Administrador podem atualizar este controle.' });
const followupManagerOnly = (req, res, next) => ['admin', 'analyst'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Apenas Analista ou Administrador podem atualizar o follow up.' });
const audit = (userId, action, entity, entityId, details = {}) => query('INSERT INTO audit_log(user_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)', [userId, action, entity, entityId, details]);

app.get('/api/health', asyncRoute(async (_req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok', time: new Date().toISOString() });
}));

app.post('/api/auth/register', loginLimit, asyncRoute(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const registrationCode = String(req.body.registrationCode || '');
  if (process.env.REGISTRATION_CODE && registrationCode !== process.env.REGISTRATION_CODE) { registerLoginFailure(req); return res.status(403).json({ error: 'Código de cadastro inválido.' }); }
  if (username.length < 3 || password.length < 8) return res.status(400).json({ error: 'Usuário deve ter 3+ caracteres e senha 8+ caracteres.' });
  const count = await query('SELECT COUNT(*)::int AS total FROM users');
  const role = count.rows[0].total === 0 ? 'admin' : 'analyst';
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await query('INSERT INTO users(username,password_hash,role) VALUES($1,$2,$3) RETURNING id,username,role,active,created_at', [username, passwordHash, role]);
    const user = result.rows[0];
    await audit(user.id, 'user.created', 'user', user.id, { role });
    clearLoginFailures(req);
    res.status(201).json({ user: publicUser(user), token: tokenFor(user) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
    throw error;
  }
}));

app.post('/api/auth/login', loginLimit, asyncRoute(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const user = (await query('SELECT * FROM users WHERE LOWER(username)=LOWER($1)', [username])).rows[0];
  if (!user || !user.active || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) { registerLoginFailure(req); return res.status(401).json({ error: 'Usuário ou senha inválidos.' }); }
  clearLoginFailures(req);
  res.json({ user: publicUser(user), token: tokenFor(user) });
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
  const result = await query('SELECT id,username,role FROM users WHERE active=true ORDER BY username');
  res.json(result.rows);
}));
app.patch('/api/users/:id', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const { role, active, password } = req.body;
  if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'Perfil inválido.' });
  if (password && String(password).length < 8) return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
  if ((role && role !== 'admin') || active === false) {
    const target = (await query('SELECT role,active FROM users WHERE id=$1', [req.params.id])).rows[0];
    const admins = (await query("SELECT COUNT(*)::int AS total FROM users WHERE role='admin' AND active=true")).rows[0].total;
    if (target?.role === 'admin' && target?.active && admins === 1) return res.status(400).json({ error: 'O sistema precisa manter um administrador ativo.' });
  }
  const result = await query('UPDATE users SET role=COALESCE($1,role), active=COALESCE($2,active), password_hash=COALESCE($3,password_hash) WHERE id=$4 RETURNING id,username,role,active,created_at', [role || null, typeof active === 'boolean' ? active : null, password ? await bcrypt.hash(String(password), 12) : null, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Usuário não encontrado.' });
  await audit(req.user.sub, 'user.updated', 'user', req.params.id, { role, active, passwordReset: !!password });
  res.json({ user: publicUser(result.rows[0]) });
}));
app.delete('/api/users/:id', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const target = (await query('SELECT id,role,active FROM users WHERE id=$1', [req.params.id])).rows[0];
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (!target.active) return res.status(400).json({ error: 'Este funcionário já foi excluído.' });
  const admins = (await query("SELECT COUNT(*)::int AS total FROM users WHERE role='admin' AND active=true")).rows[0].total;
  if (target.role === 'admin' && admins === 1) return res.status(400).json({ error: 'O sistema precisa manter um administrador ativo.' });
  await query('UPDATE users SET active=false WHERE id=$1', [target.id]);
  await audit(req.user.sub, 'user.deactivated', 'user', target.id);
  res.status(204).end();
}));

app.get('/api/clients', authenticate, asyncRoute(async (_req, res) => {
  const result = await query('SELECT * FROM clients ORDER BY name');
  res.json(result.rows);
}));
app.post('/api/clients', authenticate, asyncRoute(async (req, res) => {
  const c = req.body;
  if (!String(c.name || '').trim()) return res.status(400).json({ error: 'Nome do exportador é obrigatório.' });
  const result = await query('INSERT INTO clients(name,tax_id,contact,phone,email,country,address) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [c.name.trim(), c.taxId || null, c.contact || null, c.phone || null, c.email || null, c.country || null, c.address || null]);
  await audit(req.user.sub, 'client.created', 'client', result.rows[0].id);
  res.status(201).json(result.rows[0]);
}));
app.patch('/api/clients/:id', authenticate, asyncRoute(async (req, res) => {
  const c = req.body;
  if (!String(c.name || '').trim()) return res.status(400).json({ error: 'Nome do exportador é obrigatório.' });
  const result = await query('UPDATE clients SET name=$1,tax_id=$2,contact=$3,phone=$4,email=$5,country=$6,address=$7 WHERE id=$8 RETURNING *', [c.name.trim(), c.taxId || null, c.contact || null, c.phone || null, c.email || null, c.country || null, c.address || null, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Exportador não encontrado.' });
  await audit(req.user.sub, 'client.updated', 'client', req.params.id);
  res.json(result.rows[0]);
}));

const processColumns = ['process_number','display_process_number','status','client_id','importer','invoice','booking','due_number','due_issue_date','ruc_number','origin_port','destination_port','vessel','agency','carrier','deadline','shipping_date','container_collection_date','collection_terminal','free_time_days','incoterm','shipment_type','bl_type','freight_type','mapa_inspection','container_quantity','container_type','container_details','cubic_meters','net_weight_kg','gross_weight_kg','packages_quantity','cargo_value','currency'];
const toDbProcess = body => ({
  process_number: body.processNumber, display_process_number: body.displayProcessNumber, status: body.status || 'Em andamento', client_id: body.clientId, importer: body.importer, invoice: body.invoice, booking: body.booking, due_number: body.dueNumber, due_issue_date: body.dueIssueDate, ruc_number: body.rucNumber, origin_port: body.originPort, destination_port: body.destinationPort, vessel: body.vessel, agency: body.agency, carrier: body.carrier, deadline: body.deadline, shipping_date: body.shippingDate, container_collection_date: body.containerCollectionDate, collection_terminal: body.collectionTerminal, free_time_days: body.freeTimeDays, incoterm: body.incoterm, shipment_type: body.shipmentType, bl_type: body.blType, freight_type: body.freightType, mapa_inspection: body.mapaInspection === true, container_quantity: body.containerQuantity, container_type: body.containerType, container_details: JSON.stringify(body.containerDetails || []), cubic_meters: body.cubicMeters, net_weight_kg: body.netWeightKg, gross_weight_kg: body.grossWeightKg, packages_quantity: body.packagesQuantity, cargo_value: body.cargoValue, currency: body.currency || 'USD'
});
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

app.get('/api/processes', authenticate, asyncRoute(async (req, res) => {
  const term = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const result = await query(`${processSelect} WHERE ($1='' OR p.status=$1) AND ($2='' OR p.process_number ILIKE '%'||$2||'%' OR c.name ILIKE '%'||$2||'%' OR p.importer ILIKE '%'||$2||'%' OR p.booking ILIKE '%'||$2||'%') ORDER BY p.created_at DESC`, [status, term]);
  res.json(result.rows);
}));
app.post('/api/processes', authenticate, asyncRoute(async (req, res) => {
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
  const p = toDbProcess(body);
  if (!p.client_id || !p.importer || !p.origin_port || !p.destination_port || !p.deadline) return res.status(400).json({ error: 'Preencha os campos obrigatórios do processo.' });
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
  res.status(201).json(result.rows[0]);
}));
app.patch('/api/processes/:id', authenticate, asyncRoute(async (req, res) => {
  const previous = (await query('SELECT * FROM processes WHERE id=$1', [req.params.id])).rows[0];
  if (!previous) return res.status(404).json({ error: 'Processo não encontrado.' });
  if (req.user.role !== 'admin' && previous.analyst_id !== req.user.sub) return res.status(403).json({ error: 'Você só pode alterar seus próprios processos.' });
  const body = { ...req.body };
  if (body.updatedAt && previous.updated_at && new Date(body.updatedAt).getTime() !== new Date(previous.updated_at).getTime()) {
    return res.status(409).json({ error: 'Este processo foi alterado por outro usuário. Feche, abra novamente e confira os dados antes de salvar.' });
  }
  // process_number é técnico e obrigatório no banco. A interface usa o booking
  // como identificação principal; preserve o identificador atual quando uma
  // atualização vier sem esse campo, evitando falha de NOT NULL na edição.
  if (!String(body.processNumber || '').trim()) {
    const current = (await query('SELECT process_number FROM processes WHERE id=$1', [req.params.id])).rows[0];
    body.processNumber = current?.process_number || String(body.booking || '').trim() || `SEM-BOOKING-${Date.now()}`;
  }
  const p = toDbProcess(body); const values = processColumns.map(key => p[key] ?? null);
  if (!p.client_id || !p.importer || !p.origin_port || !p.destination_port || !p.deadline) {
    return res.status(400).json({ error: 'Preencha os campos obrigatórios do processo.' });
  }
  const set = processColumns.map((key, i) => `${key}=$${i + 1}`).join(',');
  const result = await query(`UPDATE processes SET ${set} WHERE id=$${values.length + 1} RETURNING *`, [...values, req.params.id]);
  await audit(req.user.sub, 'process.updated', 'process', req.params.id, { changes: processChanges(previous, p) });
  res.json(result.rows[0]);
}));
app.delete('/api/processes/:id', authenticate, asyncRoute(async (req, res) => {
  const previous = (await query('SELECT analyst_id FROM processes WHERE id=$1', [req.params.id])).rows[0];
  if (!previous) return res.status(404).json({ error: 'Processo não encontrado.' });
  if (req.user.role !== 'admin' && previous.analyst_id !== req.user.sub) return res.status(403).json({ error: 'Você só pode excluir seus próprios processos.' });
  await query('DELETE FROM processes WHERE id=$1', [req.params.id]);
  await audit(req.user.sub, 'process.deleted', 'process', req.params.id);
  res.status(204).end();
}));

app.patch('/api/processes/:id/vgm', authenticate, vgmManagerOnly, asyncRoute(async (req, res) => {
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
  res.json(result.rows[0]);
}));

app.patch('/api/processes/:id/release', authenticate, releaseManagerOnly, asyncRoute(async (req, res) => {
  const releaseStatus = String(req.body.releaseStatus || 'Não');
  const releaseSchedule = req.body.releaseSchedule || null;
  const releaseDeadline = req.body.releaseDeadline || null;
  const vessel = String(req.body.vessel || '').trim() || null;
  const releaseChannel = String(req.body.releaseChannel || '').trim() || null;
  const releaseDate = req.body.releaseDate || null;
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
  res.json(result.rows[0]);
}));

app.patch('/api/processes/:id/followup', authenticate, followupManagerOnly, asyncRoute(async (req, res) => {
  const followupStatus = String(req.body.followupStatus || 'Pendente');
  const followupNote = String(req.body.followupNote || '').trim() || null;
  if (!['Pendente', 'Concluído'].includes(followupStatus)) return res.status(400).json({ error: 'Status de follow up inválido.' });
  if (followupNote?.length > 500) return res.status(400).json({ error: 'A observação pode ter no máximo 500 caracteres.' });
  const result = await query('UPDATE processes SET followup_status=$1, followup_note=$2 WHERE id=$3 RETURNING *', [followupStatus, followupNote, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Processo não encontrado.' });
  await audit(req.user.sub, 'process.followup_updated', 'process', req.params.id, { followupStatus, followupNote });
  res.json(result.rows[0]);
}));

app.get('/api/followup/history', authenticate, followupManagerOnly, asyncRoute(async (_req, res) => {
  const result = await query(`
    SELECT a.id, a.action, a.details, a.created_at, u.username,
           p.id AS process_id, p.booking, c.name AS exporter
      FROM audit_log a
      JOIN users u ON u.id=a.user_id
      JOIN processes p ON p.id=a.entity_id
      JOIN clients c ON c.id=p.client_id
     WHERE a.entity='process'
       AND a.action IN ('process.created','process.updated','process.vgm_updated','process.release_updated','process.followup_updated')
     ORDER BY a.created_at DESC
     LIMIT 500
  `);
  res.json(result.rows);
}));

app.get('/api/processes/:id/followup-history', authenticate, followupManagerOnly, asyncRoute(async (req, res) => {
  const result = await query(`
    SELECT a.action, a.details, a.created_at, u.username,
           p.id AS process_id, p.booking, c.name AS exporter
      FROM audit_log a
      JOIN users u ON u.id=a.user_id
      JOIN processes p ON p.id=a.entity_id
      JOIN clients c ON c.id=p.client_id
     WHERE a.entity='process' AND a.entity_id=$1
       AND a.action IN ('process.created','process.updated','process.vgm_updated','process.release_updated','process.followup_updated')
     ORDER BY a.created_at ASC
  `, [req.params.id]);
  res.json(result.rows);
}));

app.get('/api/reports', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  const month = req.query.month ? Number(req.query.month) : null;
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
  console.error(error);
  // Registro local para diagnosticar falhas de banco no lançamento sem expor
  // informações técnicas ao usuário final. O arquivo não contém senhas.
  const errorEntry = `[${new Date().toISOString()}] ${req.method} ${req.path}\n${error?.stack || error?.message || String(error)}\n\n`;
  appendFile(path.resolve(here, '../server-errors.log'), errorEntry, 'utf8').catch(() => {});
  const localRequest = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  const message = localRequest && error?.message
    ? `Erro interno do servidor: ${error.message}`
    : 'Erro interno do servidor.';
  res.status(500).json({ error: message });
});
const ensureProcessFields = async () => {
  // Mantém o banco compatível com novos campos de capa, inclusive em projetos
  // que já estavam em uso antes dessas funcionalidades serem adicionadas.
  // A instalação foi evoluindo por etapas; por isso, todos os campos usados no
  // lançamento são garantidos aqui. Assim uma atualização incompleta do banco
  // não bloqueia o cadastro de um novo processo.
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
