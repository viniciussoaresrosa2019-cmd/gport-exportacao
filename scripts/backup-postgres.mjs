import 'dotenv/config';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connectionArguments, parsePostgresTarget, runPostgresTool } from './postgres-tools.mjs';
import { sha256File } from './backup-manifest.mjs';

const sourceUrl = process.env.BACKUP_SOURCE_DATABASE_URL;
const outputDirectory = process.env.BACKUP_OUTPUT_DIRECTORY;
if (!sourceUrl || !outputDirectory) throw new Error('Configure BACKUP_SOURCE_DATABASE_URL e BACKUP_OUTPUT_DIRECTORY fora do repositório.');

const source = parsePostgresTarget(sourceUrl);
const absoluteOutput = path.resolve(outputDirectory);
const repository = path.resolve(import.meta.dirname, '..');
if (absoluteOutput === repository || absoluteOutput.startsWith(`${repository}${path.sep}`)) {
  throw new Error('BACKUP_OUTPUT_DIRECTORY deve ficar fora do repositório.');
}
await mkdir(absoluteOutput, { recursive:true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(absoluteOutput, `gport-${stamp}.dump`);
const startedAt = Date.now();

try {
  await runPostgresTool({
    executable:process.env.PG_DUMP_BIN || 'pg_dump',
    target:source,
    arguments:[...connectionArguments(source), '--format=custom', '--no-owner', '--no-privileges', '--file', backupFile]
  });
  const fileStat = await stat(backupFile);
  const manifest = {
    createdAt:new Date().toISOString(),
    format:'postgres-custom',
    bytes:fileStat.size,
    sha256:await sha256File(backupFile),
    durationMs:Date.now() - startedAt,
    retentionClass:'daily-35d-monthly-12m'
  };
  await writeFile(`${backupFile}.json`, `${JSON.stringify(manifest, null, 2)}\n`, { encoding:'utf8', mode:0o600 });
  console.log(JSON.stringify({ status:'created', file:path.basename(backupFile), ...manifest }));
} catch (error) {
  console.error(JSON.stringify({ status:'failed', code:String(error?.code || 'BACKUP_FAILED').slice(0, 80) }));
  process.exitCode = 1;
}
