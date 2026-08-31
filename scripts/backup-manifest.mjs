import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';

export const sha256File = file => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  createReadStream(file)
    .on('data', chunk => hash.update(chunk))
    .on('error', reject)
    .on('end', () => resolve(hash.digest('hex')));
});

export const verifyBackupManifest = async backupFile => {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(`${backupFile}.json`, 'utf8'));
  } catch {
    throw Object.assign(new Error('Manifesto do backup ausente ou inválido.'), { code:'BACKUP_MANIFEST_INVALID' });
  }
  const fileStat = await stat(backupFile);
  if (manifest?.format !== 'postgres-custom' || !Number.isInteger(manifest.bytes)
    || manifest.bytes !== fileStat.size || !/^[a-f0-9]{64}$/i.test(String(manifest.sha256 || ''))) {
    throw Object.assign(new Error('Metadados do backup não conferem.'), { code:'BACKUP_MANIFEST_MISMATCH' });
  }
  const actualSha256 = await sha256File(backupFile);
  if (actualSha256 !== String(manifest.sha256).toLowerCase()) {
    throw Object.assign(new Error('Checksum do backup não confere.'), { code:'BACKUP_CHECKSUM_MISMATCH' });
  }
  return { bytes:fileStat.size, sha256:actualSha256, createdAt:manifest.createdAt || null };
};
