import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const migrationPattern = /^(\d{4}-\d{2}-\d{2}-\d{3})-([a-z0-9-]+)\.sql$/;
// Migrações históricas já publicadas recebem uma versão estável sem renomear
// arquivos antigos. O mapa é fechado para impedir que a ordem mude quando um
// novo arquivo aparece. Novas migrações devem sempre usar o padrão com NNN.
const legacyMigrationVersions = new Map(Object.entries({
  '2026-07-25-stability-security.sql':'2026-07-25-001',
  '2026-07-26-session-security.sql':'2026-07-26-001',
  '2026-07-28-required-launch-fields.sql':'2026-07-28-001',
  '2026-08-02-apenas-due.sql':'2026-08-02-001',
  '2026-08-02-process-idempotency.sql':'2026-08-02-002',
  '2026-08-02-ruc-manual.sql':'2026-08-02-003',
  '2026-08-12-client-ovacao.sql':'2026-08-12-001'
}));
const lockName = 'gport-schema-migrations-v1';

const checksum = source => createHash('sha256').update(source, 'utf8').digest('hex');

export const loadMigrations = async directory => {
  const entries = await readdir(directory, { withFileTypes:true });
  const migrations = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(migrationPattern);
    const legacyVersion = legacyMigrationVersions.get(entry.name);
    if (!match && !legacyVersion) continue;
    const source = await readFile(path.join(directory, entry.name), 'utf8');
    const version = match?.[1] || legacyVersion;
    const name = match?.[2] || entry.name.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.sql$/, '');
    migrations.push({ version, name, file:entry.name, source, checksum:checksum(source) });
  }
  const ordered = migrations.sort((left, right) => left.version.localeCompare(right.version));
  if (new Set(ordered.map(item => item.version)).size !== ordered.length) {
    throw Object.assign(new Error('Duas migrações possuem a mesma versão.'), { code:'MIGRATION_VERSION_CONFLICT' });
  }
  return ordered;
};

const ensureRegistry = client => client.query(`CREATE TABLE IF NOT EXISTS app_schema_migrations (
  version VARCHAR(32) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  checksum CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('running','applied','failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  execution_ms INTEGER,
  error_code VARCHAR(80)
)`);

export const migrationStatus = async ({ pool, directory }) => {
  const migrations = await loadMigrations(directory);
  const client = await pool.connect();
  try {
    await ensureRegistry(client);
    const result = await client.query('SELECT version,name,checksum,status,started_at,applied_at,execution_ms,error_code FROM app_schema_migrations ORDER BY version');
    const recorded = new Map(result.rows.map(row => [row.version, row]));
    return migrations.map(migration => {
      const row = recorded.get(migration.version);
      return {
        version:migration.version,
        name:migration.name,
        checksum:migration.checksum,
        status:row?.status || 'pending',
        checksumMatches:!row || row.checksum === migration.checksum,
        appliedAt:row?.applied_at || null,
        executionMs:row?.execution_ms ?? null,
        errorCode:row?.error_code || null
      };
    });
  } finally {
    client.release();
  }
};

export const runMigrations = async ({ pool, directory, dryRun = false }) => {
  const migrations = await loadMigrations(directory);
  const client = await pool.connect();
  const results = [];
  try {
    await ensureRegistry(client);
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockName]);
    const applied = await client.query('SELECT version,name,checksum,status FROM app_schema_migrations ORDER BY version');
    const recorded = new Map(applied.rows.map(row => [row.version, row]));
    for (const migration of migrations) {
      const previous = recorded.get(migration.version);
      if (previous?.status === 'applied') {
        if (previous.checksum !== migration.checksum) {
          throw Object.assign(new Error(`Checksum divergente para a migração ${migration.version}.`), { code:'MIGRATION_CHECKSUM_MISMATCH' });
        }
        results.push({ version:migration.version, status:'skipped', reason:'already-applied' });
        continue;
      }
      if (dryRun) {
        results.push({ version:migration.version, status:'pending', checksum:migration.checksum });
        continue;
      }
      const started = Date.now();
      await client.query(`INSERT INTO app_schema_migrations(version,name,checksum,status,started_at,applied_at,execution_ms,error_code)
        VALUES($1,$2,$3,'running',NOW(),NULL,NULL,NULL)
        ON CONFLICT(version) DO UPDATE SET name=EXCLUDED.name,checksum=EXCLUDED.checksum,status='running',started_at=NOW(),applied_at=NULL,execution_ms=NULL,error_code=NULL`,
      [migration.version, migration.name, migration.checksum]);
      try {
        await client.query('BEGIN');
        await client.query(migration.source);
        const executionMs = Date.now() - started;
        await client.query(`UPDATE app_schema_migrations SET status='applied',applied_at=NOW(),execution_ms=$2,error_code=NULL WHERE version=$1`, [migration.version, executionMs]);
        await client.query('COMMIT');
        results.push({ version:migration.version, status:'applied', executionMs });
      } catch (error) {
        await client.query('ROLLBACK');
        const executionMs = Date.now() - started;
        await client.query(`UPDATE app_schema_migrations SET status='failed',execution_ms=$2,error_code=$3 WHERE version=$1`,
          [migration.version, executionMs, String(error?.code || 'MIGRATION_FAILED').slice(0, 80)]);
        throw error;
      }
    }
    return results;
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]).catch(() => {});
    client.release();
  }
};
