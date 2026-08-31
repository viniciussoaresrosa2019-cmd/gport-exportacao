import assert from 'node:assert/strict';
import test from 'node:test';
import { createObservability } from '../src/observability.js';
import { createErrorHandler } from '../src/error-handler.js';

test('observabilidade cria correlação e agrega somente métricas técnicas', async () => {
  const thresholds = [];
  const observability = createObservability({ slowRequestMs:1, onThreshold:event => thresholds.push(event) });
  const listeners = {};
  const request = { path:'/api/processes/550e8400-e29b-41d4-a716-446655440000', route:{ path:'/api/processes/:id' } };
  const response = {
    statusCode:500,
    headers:{},
    setHeader(name, value) { this.headers[name] = value; },
    once(name, callback) { listeners[name] = callback; }
  };
  observability.middleware(request, response, () => {});
  await new Promise(resolve => setTimeout(resolve, 2));
  listeners.finish();
  const snapshot = observability.snapshot();
  assert.match(response.headers['X-Request-Id'], /^[0-9a-f-]{36}$/);
  assert.equal(snapshot.total, 1);
  assert.equal(snapshot.errors, 1);
  assert.equal(snapshot.routes[0].route, '/api/processes/:id');
  assert.deepEqual(Object.keys(snapshot.routes[0]).sort(), ['averageMs', 'count', 'errors', 'maxMs', 'route', 'slow'].sort());
  assert.equal(thresholds[0].type, 'slow-request');
  assert.equal(thresholds[0].route, '/api/processes/:id');
});

test('erro interno não expõe mensagem, pilha ou dados da requisição', () => {
  let responseStatus;
  let responseBody;
  const handler = createErrorHandler({});
  handler(
    Object.assign(new Error('detalhe secreto do banco'), { code:'XX999' }),
    { method:'POST', path:'/api/processes', correlationId:'test-correlation' },
    { status(value) { responseStatus = value; return this; }, json(value) { responseBody = value; } },
    () => {}
  );
  assert.equal(responseStatus, 500);
  assert.deepEqual(responseBody, { error:'Erro interno do servidor.', correlationId:'test-correlation' });
  assert.doesNotMatch(JSON.stringify(responseBody), /detalhe secreto|stack|password|token/i);
});

test('observabilidade detecta aumento de erros 500 dentro da janela configurada', () => {
  const thresholds = [];
  let currentTime = 1_000_000;
  const observability = createObservability({
    slowRequestMs:99_999,
    errorThreshold:3,
    errorWindowMs:60_000,
    now:() => currentTime,
    onThreshold:event => thresholds.push(event)
  });
  for (let index = 0; index < 3; index += 1) {
    const listeners = {};
    const response = { statusCode:500, setHeader() {}, once(name, callback) { listeners[name] = callback; } };
    observability.middleware({ path:'/api/test', route:{ path:'/api/test' } }, response, () => {});
    listeners.finish();
    currentTime += 1_000;
  }
  assert.equal(thresholds.length, 1);
  assert.deepEqual({ type:thresholds[0].type, errors:thresholds[0].errors, windowMs:thresholds[0].windowMs }, { type:'error-rate', errors:3, windowMs:60_000 });
});
