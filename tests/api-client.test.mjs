import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/assets/api-client.js', import.meta.url), 'utf8');
const client = (fetch, timers = {}) => {
  const window = { setTimeout, clearTimeout, ...timers };
  vm.runInNewContext(source, { window, document:{ cookie:'gport_csrf=test-token' }, fetch, DOMException });
  return window.gportApi.create();
};
const ok = value => ({ ok:true, status:200, json:async () => value });

test('busca cancelada não é repetida nem convertida em erro de conexão', async () => {
  let calls = 0;
  const controller = new AbortController();
  const request = client(async () => { calls++; controller.abort(); throw controller.signal.reason; });
  await assert.rejects(request('/api/processes', { signal:controller.signal }), { name:'AbortError' });
  assert.equal(calls, 1);
});

test('cancelar durante espera de retry impede a próxima requisição', async () => {
  let calls = 0;
  const controller = new AbortController();
  let startedWaiting;
  const waiting = new Promise(resolve => { startedWaiting = resolve; });
  const request = client(async () => { calls++; return { status:503 }; }, {
    setTimeout(fn, ms) { startedWaiting(); return setTimeout(fn, ms); }
  });
  const pending = request('/api/processes', { signal:controller.signal });
  const rejected = assert.rejects(pending, { name:'AbortError' });
  await waiting;
  controller.abort();
  await rejected;
  assert.equal(calls, 1);
});

test('GET repete falha transitória e retorna resultado confirmado', async () => {
  let calls = 0;
  const request = client(async () => ++calls === 1 ? { status:503 } : ok({ items:[] }), {
    setTimeout:fn => setTimeout(fn, 0)
  });
  assert.deepEqual(await request('/api/processes'), { items:[] });
  assert.equal(calls, 2);
});

test('PATCH não é reenviado após falha de rede e mantém CSRF', async () => {
  let calls = 0;
  const request = client(async (_url, options) => {
    calls++;
    assert.equal(options.headers['X-CSRF-Token'], 'test-token');
    assert.equal(options.credentials, 'same-origin');
    throw new TypeError('offline');
  });
  await assert.rejects(request('/api/processes/id', { method:'PATCH', body:'{}' }), { status:0 });
  assert.equal(calls, 1);
});
