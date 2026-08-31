import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertIsolatedRestoreTarget, comparableTarget, parsePostgresTarget } from '../scripts/postgres-tools.mjs';
import { sha256File, verifyBackupManifest } from '../scripts/backup-manifest.mjs';

const fakeDatabaseUrl = (database, user = 'user') =>
  `${'postgresql'}://${user}:${'test-only-password'}@db.example.com/${database}`;

test('parser PostgreSQL não devolve senha na identificação comparável', () => {
  const target = parsePostgresTarget(`${fakeDatabaseUrl('gport_restore_hml').replace('/gport_', ':5432/gport_')}?sslmode=require`);
  assert.equal(comparableTarget(target), 'db.example.com:5432/gport_restore_hml');
  assert.doesNotMatch(comparableTarget(target), /secret|user/i);
});

test('restauração recusa banco sem marcador e banco protegido', () => {
  const production = fakeDatabaseUrl('gport');
  assert.throws(() => assertIsolatedRestoreTarget({
    target:parsePostgresTarget(production), marker:'restore', protectedUrls:[]
  }), error => error.code === 'RESTORE_TARGET_NOT_ISOLATED');
  const isolated = fakeDatabaseUrl('gport_restore_hml');
  assert.throws(() => assertIsolatedRestoreTarget({
    target:parsePostgresTarget(isolated), marker:'restore', protectedUrls:[isolated]
  }), error => error.code === 'RESTORE_TARGET_PROTECTED');
});

test('restauração aceita somente destino isolado distinto dos protegidos', () => {
  assert.doesNotThrow(() => assertIsolatedRestoreTarget({
    target:parsePostgresTarget(fakeDatabaseUrl('gport_restore_hml', 'tester')),
    marker:'restore',
    protectedUrls:[fakeDatabaseUrl('gport', 'app')]
  }));
});

test('restauração valida tamanho e checksum antes de utilizar o backup', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gport-backup-test-'));
  const backup = path.join(directory, 'isolated.dump');
  try {
    const content = Buffer.from('synthetic-safe-backup');
    await writeFile(backup, content);
    const sha256 = await sha256File(backup);
    await writeFile(`${backup}.json`, JSON.stringify({ format:'postgres-custom', bytes:content.length, sha256 }));
    const verified = await verifyBackupManifest(backup);
    assert.equal(verified.sha256, sha256);
    await writeFile(backup, Buffer.from('backup alterado'));
    await assert.rejects(() => verifyBackupManifest(backup), error => ['BACKUP_MANIFEST_MISMATCH', 'BACKUP_CHECKSUM_MISMATCH'].includes(error.code));
  } finally {
    await rm(directory, { recursive:true, force:true });
  }
});
