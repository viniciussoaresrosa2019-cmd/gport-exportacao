import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('API possui as proteções essenciais de autenticação e processos', async () => {
  const server = await read('src/server.js');
  for (const required of [
    "app.post('/api/processes'", "app.patch('/api/processes/:id'",
    'loginLimit', 'processes_updated_at', 'processChanges',
    'Usuário inativo ou sessão expirada.'
  ]) assert.ok(server.includes(required), `Item obrigatório ausente: ${required}`);
});

test('interface mantém a sintaxe JavaScript válida', async () => {
  const html = await read('public/index.html');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).join('\n');
  const result = spawnSync(process.execPath, ['--check'], { input: scripts, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || 'Falha de sintaxe na interface.');
});

test('migração de estabilidade está disponível', async () => {
  const migration = await read('database/migrations/2026-07-25-stability-security.sql');
  assert.match(migration, /processes_updated_at/);
  assert.match(migration, /pg_trgm/);
  assert.match(migration, /release_channel/);
});
