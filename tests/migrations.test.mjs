import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadMigrations, runMigrations } from '../src/migrations.js';
import { verifySchemaCompatibility } from '../src/schema-compatibility.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'database', 'migrations');

const fakePool = ({ recorded = [], failMigration = false } = {}) => {
  const calls = [];
  const client = {
    async query(text, values = []) {
      calls.push({ text:String(text), values });
      if (String(text).startsWith('SELECT version,name,checksum,status FROM app_schema_migrations')) return { rows:recorded };
      if (failMigration && String(text).includes('ALTER TABLE users ADD COLUMN')) {
        throw Object.assign(new Error('falha simulada'), { code:'TEST_FAILURE' });
      }
      return { rows:[] };
    },
    release() { calls.push({ text:'RELEASE', values:[] }); }
  };
  return { pool:{ connect:async () => client }, calls };
};

test('migrações versionadas possuem ordem determinística e checksum SHA-256', async () => {
  const migrations = await loadMigrations(directory);
  assert.ok(migrations.length >= 1);
  assert.equal(migrations.length, 13);
  assert.equal(migrations[0].version, '2026-07-25-001');
  assert.equal(migrations.at(-1).version, '2026-09-14-003');
  assert.deepEqual(migrations.map(item => item.version), [...migrations.map(item => item.version)].sort());
  for (const migration of migrations) {
    assert.match(migration.version, /^\d{4}-\d{2}-\d{2}-\d{3}$/);
    assert.match(migration.checksum, /^[a-f0-9]{64}$/);
    assert.ok(migration.source.includes('IF NOT EXISTS'));
  }
});

test('executor registra, aplica em transação e libera o lock de migração', async () => {
  const { pool, calls } = fakePool();
  const result = await runMigrations({ pool, directory });
  assert.equal(result[0].status, 'applied');
  const sql = calls.map(call => call.text).join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app_schema_migrations/);
  assert.match(sql, /pg_advisory_lock/);
  assert.match(sql, /BEGIN/);
  assert.match(sql, /ALTER TABLE users ADD COLUMN/);
  assert.match(sql, /status='applied'/);
  assert.match(sql, /COMMIT/);
  assert.match(sql, /pg_advisory_unlock/);
});

test('dry-run lista pendências sem executar DDL', async () => {
  const { pool, calls } = fakePool();
  const result = await runMigrations({ pool, directory, dryRun:true });
  assert.equal(result[0].status, 'pending');
  assert.doesNotMatch(calls.map(call => call.text).join('\n'), /ALTER TABLE users ADD COLUMN/);
});

test('checksum alterado interrompe a execução sem reaplicar migração', async () => {
  const migrations = await loadMigrations(directory);
  const { pool, calls } = fakePool({ recorded:[{
    version:migrations[0].version,
    name:migrations[0].name,
    checksum:'0'.repeat(64),
    status:'applied'
  }] });
  await assert.rejects(() => runMigrations({ pool, directory }), error => error.code === 'MIGRATION_CHECKSUM_MISMATCH');
  assert.doesNotMatch(calls.map(call => call.text).join('\n'), /ALTER TABLE users ADD COLUMN/);
});

test('falha de DDL executa rollback e registra somente código técnico', async () => {
  const { pool, calls } = fakePool({ failMigration:true });
  await assert.rejects(() => runMigrations({ pool, directory }), error => error.code === 'TEST_FAILURE');
  const sql = calls.map(call => call.text).join('\n');
  assert.match(sql, /ROLLBACK/);
  assert.match(sql, /status='failed'/);
  assert.doesNotMatch(sql, /falha simulada/);
});

test('boot valida o esquema somente com consultas de leitura', async () => {
  const tables = ['users', 'clients', 'processes', 'audit_log', 'user_notifications', 'process_checklist_items', 'process_comments', 'process_attachments', 'process_prelaunches'];
  const columns = {
    users:['token_version','roles'],
    clients:['active', 'ruc_manual', 'due_only', 'ovacao'],
    processes:['client_id', 'booking', 'deadline', 'container_details', 'updated_at', 'idempotency_key', 'vgm_sent_date', 'release_deadline', 'followup_status', 'post_shipment_date'],
    process_attachments:['scan_status', 'scan_provider']
  };
  const calls = [];
  const query = async text => {
    calls.push(String(text));
    if (String(text).includes('information_schema.tables')) return { rows:tables.map(table_name => ({ table_name })) };
    return { rows:Object.entries(columns).flatMap(([table_name, names]) => names.map(column_name => ({ table_name, column_name }))) };
  };
  assert.deepEqual(await verifySchemaCompatibility({ query }), { compatible:true });
  assert.doesNotMatch(calls.join('\n'), /ALTER|CREATE|DROP|INSERT|UPDATE|DELETE/i);
});

test('boot falha com código explícito quando uma migração está pendente', async () => {
  const query = async text => String(text).includes('information_schema.tables')
    ? { rows:[{ table_name:'users' }] }
    : { rows:[] };
  await assert.rejects(
    () => verifySchemaCompatibility({ query }),
    error => error.code === 'SCHEMA_MIGRATION_REQUIRED' && error.missingCount > 0
  );
});
