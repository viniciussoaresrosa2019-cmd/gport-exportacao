import 'dotenv/config';
import pg from 'pg';
import { assertIsolatedRestoreTarget, parsePostgresTarget } from './postgres-tools.mjs';

if (!process.argv.includes('--confirm-isolated')) throw new Error('Use --confirm-isolated para excluir somente o banco descartável validado.');
const targetUrl = process.env.RESTORE_TEST_DATABASE_URL;
if (!targetUrl) throw new Error('RESTORE_TEST_DATABASE_URL não configurada.');
const target = parsePostgresTarget(targetUrl);
assertIsolatedRestoreTarget({
  target,
  marker:process.env.RESTORE_TEST_DATABASE_MARKER || 'restore',
  protectedUrls:[process.env.DATABASE_URL, process.env.BACKUP_SOURCE_DATABASE_URL]
});

const maintenance = new URL(targetUrl);
maintenance.pathname = '/postgres';
const client = new pg.Client({
  connectionString:maintenance.toString(),
  ssl:/^(localhost|127\.0\.0\.1)$/i.test(target.host) ? false : { rejectUnauthorized:true }
});
try {
  await client.connect();
  await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [target.database]);
  const identifier = `"${target.database.replaceAll('"', '""')}"`;
  await client.query(`DROP DATABASE ${identifier}`);
  console.log(JSON.stringify({ status:'deleted', targetType:'isolated-restore-database' }));
} catch (error) {
  console.error(JSON.stringify({ status:'failed', code:String(error?.code || 'RESTORE_CLEANUP_FAILED').slice(0, 80) }));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

