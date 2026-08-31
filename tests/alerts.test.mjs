import assert from 'node:assert/strict';
import test from 'node:test';
import { createAlertDispatcher } from '../src/alerts.js';
import { createStructuredLogger } from '../src/structured-logger.js';

test('alerta fica desativado sem expor ou exigir webhook', async () => {
  const dispatcher = createAlertDispatcher({ webhookUrl:'' });
  assert.equal(dispatcher.enabled, false);
  assert.deepEqual(await dispatcher.send({ title:'teste' }), { status:'disabled' });
});

test('alerta Teams contém somente contrato operacional seguro e aplica cooldown', async () => {
  const calls = [];
  let currentTime = 1_000_000;
  const dispatcher = createAlertDispatcher({
    webhookUrl:'https://example.invalid/secret-webhook-value',
    provider:'teams-workflow',
    now:() => currentTime,
    cooldownMs:60_000,
    fetchImpl:async (url, options) => {
      calls.push({ url:String(url), options });
      return { ok:true, status:200 };
    }
  });
  const event = {
    severity:'critical', category:'database', title:'Banco indisponível',
    summary:'Falha técnica. senha=nao-deve-existir\nlinha-extra', correlationId:'request-123'
  };
  assert.equal((await dispatcher.send(event)).status, 'sent');
  assert.equal((await dispatcher.send(event)).status, 'suppressed');
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0].options.body);
  assert.deepEqual(Object.keys(payload).sort(), ['category', 'correlationId', 'occurredAt', 'severity', 'summary', 'title'].sort());
  assert.equal(payload.summary.includes('\n'), false);
  assert.doesNotMatch(payload.summary, /nao-deve-existir/i);
  assert.equal(JSON.stringify(payload).includes('secret-webhook-value'), false);
  currentTime += 61_000;
  assert.equal((await dispatcher.send(event)).status, 'sent');
});

test('falha no canal não derruba a aplicação nem revela o endpoint no log', async () => {
  const output = [];
  const sink = { log:value => output.push(value), error:value => output.push(value) };
  const logger = createStructuredLogger({ sink });
  const dispatcher = createAlertDispatcher({
    webhookUrl:'https://example.invalid/private-token', logger,
    fetchImpl:async () => { throw Object.assign(new Error('network secret'), { code:'ECONNRESET' }); }
  });
  const result = await dispatcher.send({ severity:'critical', category:'http', title:'Falha', summary:'Consulte a correlação.' });
  assert.equal(result.status, 'failed');
  assert.doesNotMatch(output.join(' '), /private-token|network secret/i);
});

test('logger estruturado registra campos técnicos e não aceita conteúdo arbitrário', () => {
  const output = [];
  const logger = createStructuredLogger({ sink:{ log:value => output.push(value), error:value => output.push(value) } });
  const event = logger.error('http\ninjection', {
    correlationId:'abc', method:'POST', path:'/api/processes', status:500, durationMs:12.8,
    code:'XX999\npassword=secret', body:{ password:'não registrar' }
  });
  assert.equal(event.category, 'http_injection');
  assert.equal(event.durationMs, 13);
  assert.doesNotMatch(output[0], /não registrar|password=secret/i);
});
