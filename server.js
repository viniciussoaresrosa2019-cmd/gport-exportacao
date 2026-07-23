import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('Defina um JWT_SECRET forte com pelo menos 32 caracteres.');

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || false }));
app.use(express.json({ limit: '1mb' }));
const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../public');
app.use(express.static(webRoot));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const tokenFor = user => jwt.sign({ sub: user.id, username: user.username, role: user.role }, jwtSecret, { expiresIn: '8h' });
const publicUser = user => ({ id: user.id, username: user.username, role: user.role, active: user.active, createdAt: user.created_at });

function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Autenticação obrigatória.' });
  try { req.user = jwt.verify(token, jwtSecret); next(); }
  catch { return res.status(401).json({ error: 'Sessão inválida ou expirada.' }); }
}
const adminOnly = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Acesso restrito a administradores.' });
const audit = (userId, action, entity, entityId, details = {}) => query('INSERT INTO audit_log(user_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)', [userId, action, entity, entityId, details]);

app.get('/api/health', asyncRoute(async (_req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok', time: new Date().toISOString() });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (username.length < 3 || password.length < 8) return res.status(400).json({ error: 'Usuário deve ter 3+ caracteres e senha 8+ caracteres.' });
  const count = await query('SELECT COUNT(*)::int AS total FROM users');
  const role = count.rows[0].total === 0 ? 'admin' : 'analyst';
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await query('INSERT INTO users(username,password_hash,role) VALUES($1,$2,$3) RETURNING id,username,role,active,created_at', [username, passwordHash, role]);
    const user = result.rows[0];
    await audit(user.id, 'user.created', 'user', user.id, { role });
    res.status(201).json({ user: publicUser(user), token: tokenFor(user) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
    throw error;
  }
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const user = (await query('SELECT * FROM users WHERE LOWER(username)=LOWER($1)', [username])).rows[0];
  if (!user || !user.active || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
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
app.patch('/api/users/:id', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const { role, active, password } = req.body;
  if (role && !['admin', 'analyst'].includes(role)) return res.status(400).json({ error: 'Perfil inválido.' });
  if (password && String(password).length < 8) return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
  if (role === 'analyst') {
    const target = (await query('SELECT role FROM users WHERE id=$1', [req.params.id])).rows[0];
    const admins = (await query("SELECT COUNT(*)::int AS total FROM users WHERE role='admin' AND active=true")).rows[0].total;
    if (target?.role === 'admin' && admins === 1) return res.status(400).json({ error: 'O sistema precisa manter um administrador ativo.' });
  }
  const result = await query('UPDATE users SET role=COALESCE($1,role), active=COALESCE($2,active), password_hash=COALESCE($3,password_hash) WHERE id=$4 RETURNING id,username,role,active,created_at', [role || null, typeof active === 'boolean' ? active : null, password ? await bcrypt.hash(String(password), 12) : null, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Usuário não encontrado.' });
  await audit(req.user.sub, 'user.updated', 'user', req.params.id, { role, active, passwordReset: !!password });
  res.json({ user: publicUser(result.rows[0]) });
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

const processColumns = ['process_number','status','client_id','importer','invoice','booking','due_number','ruc_number','origin_port','destination_port','vessel','agency','carrier','deadline','shipping_date','container_collection_date','collection_terminal','free_time_days','incoterm','container_quantity','container_type','container_details','cubic_meters','net_weight_kg','gross_weight_kg','packages_quantity','cargo_value','currency'];
const toDbProcess = body => ({
  process_number: body.processNumber, status: body.status || 'Em andamento', client_id: body.clientId, importer: body.importer, invoice: body.invoice, booking: body.booking, due_number: body.dueNumber, ruc_number: body.rucNumber, origin_port: body.originPort, destination_port: body.destinationPort, vessel: body.vessel, agency: body.agency, carrier: body.carrier, deadline: body.deadline, shipping_date: body.shippingDate, container_collection_date: body.containerCollectionDate, collection_terminal: body.collectionTerminal, free_time_days: body.freeTimeDays, incoterm: body.incoterm, container_quantity: body.containerQuantity, container_type: body.containerType, container_details: JSON.stringify(body.containerDetails || []), cubic_meters: body.cubicMeters, net_weight_kg: body.netWeightKg, gross_weight_kg: body.grossWeightKg, packages_quantity: body.packagesQuantity, cargo_value: body.cargoValue, currency: body.currency || 'USD'
});
const processSelect = `SELECT p.*,c.name AS exporter,u.username AS analyst FROM processes p JOIN clients c ON c.id=p.client_id JOIN users u ON u.id=p.analyst_id`;

app.get('/api/processes', authenticate, asyncRoute(async (req, res) => {
  const term = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const result = await query(`${processSelect} WHERE ($1='' OR p.status=$1) AND ($2='' OR p.process_number ILIKE '%'||$2||'%' OR c.name ILIKE '%'||$2||'%' OR p.importer ILIKE '%'||$2||'%' OR p.booking ILIKE '%'||$2||'%') ORDER BY p.created_at DESC`, [status, term]);
  res.json(result.rows);
}));
app.post('/api/processes', authenticate, asyncRoute(async (req, res) => {
  const p = toDbProcess(req.body);
  if (!p.process_number || !p.client_id || !p.importer || !p.origin_port || !p.destination_port || !p.deadline) return res.status(400).json({ error: 'Preencha os campos obrigatórios do processo.' });
  const values = processColumns.map(key => p[key] ?? null);
  const placeholders = processColumns.map((_, i) => `$${i + 1}`).join(',');
  const result = await query(`INSERT INTO processes(${processColumns.join(',')},analyst_id) VALUES(${placeholders},$${values.length + 1}) RETURNING *`, [...values, req.user.sub]);
  await audit(req.user.sub, 'process.created', 'process', result.rows[0].id);
  res.status(201).json(result.rows[0]);
}));
app.patch('/api/processes/:id', authenticate, asyncRoute(async (req, res) => {
  const previous = (await query('SELECT analyst_id FROM processes WHERE id=$1', [req.params.id])).rows[0];
  if (!previous) return res.status(404).json({ error: 'Processo não encontrado.' });
  if (req.user.role !== 'admin' && previous.analyst_id !== req.user.sub) return res.status(403).json({ error: 'Você só pode alterar seus próprios processos.' });
  const p = toDbProcess(req.body); const values = processColumns.map(key => p[key] ?? null);
  const set = processColumns.map((key, i) => `${key}=$${i + 1}`).join(',');
  const result = await query(`UPDATE processes SET ${set} WHERE id=$${values.length + 1} RETURNING *`, [...values, req.params.id]);
  await audit(req.user.sub, 'process.updated', 'process', req.params.id);
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

app.get('/api/reports', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  const month = req.query.month ? Number(req.query.month) : null;
  const params = [year, month];
  const period = `EXTRACT(YEAR FROM p.created_at)=$1 AND ($2::int IS NULL OR EXTRACT(MONTH FROM p.created_at)=$2)`;
  const [total, analysts, exporters] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM processes p WHERE ${period}`, params),
    query(`SELECT u.username AS name,COUNT(*)::int AS total FROM processes p JOIN users u ON u.id=p.analyst_id WHERE ${period} GROUP BY u.username ORDER BY total DESC,name`, params),
    query(`SELECT c.name,COUNT(*)::int AS total FROM processes p JOIN clients c ON c.id=p.client_id WHERE ${period} GROUP BY c.name ORDER BY total DESC,name`, params)
  ]);
  res.json({ year, month, total: total.rows[0].total, analysts: analysts.rows, exporters: exporters.rows });
}));

app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Erro interno do servidor.' }); });
app.listen(port, () => console.log(`Atlas Export API em http://localhost:${port}`));
