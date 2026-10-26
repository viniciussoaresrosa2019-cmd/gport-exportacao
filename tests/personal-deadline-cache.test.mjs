import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/assets/app-runtime.js', import.meta.url), 'utf8');
const implementation = source.slice(source.indexOf('let personalDeadlineStatExpiresAt ='), source.indexOf('const showProcessLoading ='));
const harness = () => {
  let now = 100_000;
  const requests = [];
  const counter = { textContent:'', setAttribute() {} };
  const context = { currentUser:{ id:'user-1' }, Date:{ now:() => now },
    isDeadlineInNextSevenDays:() => true, el:() => counter,
    request:() => new Promise(resolve => { requests.push(resolve); }) };
  vm.createContext(context);
  vm.runInContext(`${implementation}\nthis.refresh = refreshPersonalDeadlineStat;`, context);
  return { context, requests, counter, refresh:context.refresh, advance:ms => { now += ms; } };
};

test('buscas próximas compartilham requisição e contador por um minuto', async () => {
  const h = harness();
  const a = h.refresh({ force:false }), b = h.refresh({ force:false });
  assert.equal(h.requests.length, 1);
  h.requests[0]([{ deadline:'date' }]);
  await Promise.all([a,b]);
  await h.refresh({ force:false });
  assert.equal(h.requests.length, 1);
  assert.equal(h.counter.textContent, 1);
  h.advance(60_001);
  const c = h.refresh({ force:false });
  assert.equal(h.requests.length, 2);
  h.requests[1]([]);
  await c;
  assert.equal(h.counter.textContent, 0);
});

test('alterar agenda força consulta nova e resposta antiga não apaga contador atual', async () => {
  const h = harness();
  const old = h.refresh({ force:false });
  const fresh = h.refresh();
  h.requests[1]([{ deadline:'date' }]);
  await fresh;
  h.requests[0]([]);
  await old;
  assert.equal(h.counter.textContent, 1);
});

test('troca de usuário não reaproveita resultado ou requisição da sessão anterior', async () => {
  const h = harness();
  const old = h.refresh({ force:false });
  h.context.currentUser = { id:'user-2' };
  const fresh = h.refresh({ force:false });
  assert.equal(h.requests.length, 2);
  h.requests[1]([]);
  await fresh;
  h.requests[0]([{ deadline:'private' }]);
  await old;
  assert.equal(h.counter.textContent, 0);
});
