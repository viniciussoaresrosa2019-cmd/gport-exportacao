import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');

test('build gera assets minificados com hash e sem sourcemap de produção', async () => {
  const manifest = JSON.parse(await read('public/dist/asset-manifest.json'));
  const metrics = JSON.parse(await read('public/dist/build-metrics.json'));
  const index = await read('public/dist/index.html');
  const files = await readdir(path.join(root, 'public', 'dist', 'assets'));
  assert.ok(Object.keys(manifest).length >= 8);
  for (const output of Object.values(manifest)) {
    assert.match(output, /^assets\/[a-z0-9-]+-[A-F0-9]{12}\.(?:js|css)$/i);
    assert.ok(index.includes(output));
  }
  assert.equal(metrics.sourceMaps, false);
  assert.ok(metrics.output.bytes < metrics.source.bytes);
  assert.ok(metrics.output.gzipBytes < metrics.source.gzipBytes);
  assert.equal(files.some(file => file.endsWith('.map')), false);
});

test('Render constrói o dist e servidor usa cache imutável para hash', async () => {
  const render = await read('render.yaml');
  const server = await read('src/server.js');
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.scripts.build, 'node scripts/build.mjs');
  assert.match(render, /buildCommand: npm ci && npm run build/);
  assert.match(render, /key: DEPLOY_ENV\s+value: production/);
  assert.match(server, /productionWebRoot/);
  assert.match(server, /\{8,\}/);
  assert.match(server, /max-age=31536000, immutable/);
});
