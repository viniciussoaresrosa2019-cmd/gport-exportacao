import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const directory = path.resolve(here, '../database/migrations');
const dryRun = process.argv.includes('--dry-run');

try {
  const results = await runMigrations({ pool, directory, dryRun });
  for (const result of results) console.log(JSON.stringify(result));
  if (!results.length) console.log(JSON.stringify({ status:'current', message:'Nenhuma migração versionada encontrada.' }));
} catch (error) {
  console.error(JSON.stringify({ status:'failed', code:String(error?.code || 'MIGRATION_FAILED') }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
