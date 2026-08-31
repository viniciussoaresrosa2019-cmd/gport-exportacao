import 'dotenv/config';
import path from 'node:path';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { assertIsolatedRestoreTarget, connectionArguments, parsePostgresTarget, runPostgresTool } from './postgres-tools.mjs';
import { verifyBackupManifest } from './backup-manifest.mjs';
import { runMigrations } from '../src/migrations.js';
import { verifySchemaCompatibility } from '../src/schema-compatibility.js';

const confirmed = process.argv.includes('--confirm-isolated');
const targetUrl = process.env.RESTORE_TEST_DATABASE_URL;
const backupFile = process.env.RESTORE_TEST_BACKUP_FILE;
const marker = String(process.env.RESTORE_TEST_DATABASE_MARKER || 'restore').toLowerCase();
if (!confirmed) throw new Error('Use --confirm-isolated após verificar o banco de homologação descartável.');
if (!targetUrl || !backupFile) throw new Error('Configure RESTORE_TEST_DATABASE_URL e RESTORE_TEST_BACKUP_FILE.');
const target = parsePostgresTarget(targetUrl);
assertIsolatedRestoreTarget({ target, marker, protectedUrls:[process.env.DATABASE_URL, process.env.BACKUP_SOURCE_DATABASE_URL] });
const backupStat = await stat(path.resolve(backupFile));
if (!backupStat.isFile() || !backupFile.toLowerCase().endsWith('.dump')) throw new Error('O backup deve ser um arquivo .dump regular.');
const verifiedBackup = await verifyBackupManifest(path.resolve(backupFile));

const startedAt = Date.now();
const pool = new pg.Pool({
  connectionString:targetUrl,
  max:2,
  ssl:/^(localhost|127\.0\.0\.1)$/i.test(target.host) ? false : { rejectUnauthorized:true }
});
try {
  await runPostgresTool({
    executable:process.env.PG_RESTORE_BIN || 'pg_restore', target,
    arguments:[...connectionArguments(target), '--clean', '--if-exists', '--no-owner', '--no-privileges', '--exit-on-error', path.resolve(backupFile)]
  });
  const migrationDirectory = path.resolve(import.meta.dirname, '../database/migrations');
  const migrations = await runMigrations({ pool, directory:migrationDirectory });
  await verifySchemaCompatibility({ query:(text, values) => pool.query(text, values) });
  const validation = await pool.query(`SELECT
    to_regclass('public.users') IS NOT NULL AS users,
    to_regclass('public.clients') IS NOT NULL AS clients,
    to_regclass('public.processes') IS NOT NULL AS processes,
    to_regclass('public.audit_log') IS NOT NULL AS audit_log,
    has_table_privilege(current_user,'public.processes','SELECT') AS can_read_processes,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processes') AS schema_present`);
  const checks = validation.rows[0];
  if (Object.values(checks).some(value => value !== true)) throw Object.assign(new Error('Validação estrutural incompleta.'), { code:'RESTORE_VALIDATION_FAILED' });
  const evidenceDirectory = path.resolve(process.env.RESTORE_EVIDENCE_DIRECTORY || path.resolve(import.meta.dirname, '../artifacts/restore-tests'));
  await mkdir(evidenceDirectory, { recursive:true });
  const completedAt = new Date();
  const evidence = {
    testId:`restore-${completedAt.toISOString().replace(/[:.]/g, '-')}`,
    date:completedAt.toISOString(),
    responsibleRole:String(process.env.RESTORE_TEST_RESPONSIBLE_ROLE || 'TI-designado').slice(0, 80),
    durationMs:Date.now() - startedAt,
    result:'passed',
    backupBytes:verifiedBackup.bytes,
    backupSha256:verifiedBackup.sha256,
    checks,
    migrations:migrations.map(item => ({ version:item.version, status:item.status })),
    expiresAt:new Date(completedAt.getTime() + 7 * 86400000).toISOString(),
    cleanupRequired:true,
    correctiveActions:[]
  };
  const evidenceFile = path.join(evidenceDirectory, `${evidence.testId}.json`);
  await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, { encoding:'utf8', mode:0o600 });
  console.log(JSON.stringify({ status:'passed', evidence:path.basename(evidenceFile), durationMs:evidence.durationMs, cleanupRequired:true }));
} catch (error) {
  console.error(JSON.stringify({ status:'failed', code:String(error?.code || 'RESTORE_TEST_FAILED').slice(0, 80) }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
