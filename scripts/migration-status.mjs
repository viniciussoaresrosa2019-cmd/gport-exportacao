import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';
import { migrationStatus } from '../src/migrations.js';

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  const rows = await migrationStatus({ pool, directory:path.resolve(here, '../database/migrations') });
  for (const row of rows) console.log(JSON.stringify(row));
} catch (error) {
  console.error(JSON.stringify({ status:'failed', code:String(error?.code || 'MIGRATION_STATUS_FAILED') }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
