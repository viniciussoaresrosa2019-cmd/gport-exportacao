import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
const route = source.slice(source.indexOf("app.patch('/api/processes/:id',"), source.indexOf("app.delete('/api/processes/:id',"));
function harness({ exists = true, clientExists = true, dueOnly = true } = {}) {
  const queries = [], audits = [], validations = [];
  const previous = { id:'process-id', process_number:'internal-number', analyst_id:'user-id', updated_at:'2026-10-23T12:00:00.000Z' };
  let handler;
  const context = {
    app:{ patch:(_path, ...handlers) => { handler = handlers.at(-1); } },
    authenticate() {}, processEditorOnly() {}, asyncRoute:fn => fn,
    validId:value => typeof value === 'string' && value.endsWith('-id'),
    query:async (sql, params) => {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT')) return { rows:exists ? [{ ...previous, validation_client_id:clientExists ? 'client-id' : null, validation_ruc_manual:false, validation_due_only:dueOnly }] : [] };
      return { rows:[{ ...previous, booking:params[0] }] };
    },
    validatedProcess:(body, settings) => { validations.push(settings); return { booking:body.booking }; },
    toDbProcess:value => value, processColumns:['booking'],
    resolveProcessAnalystId:async (_value, fallback) => fallback,
    processChanges:() => ({}), audit:async (...args) => { audits.push(args); },
    notifyProcessChange:async () => {}, publishProcessChange() {}
  };
  vm.runInNewContext(route, context);
  const response = { statusCode:200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  const request = { params:{ id:'process-id' }, user:{ sub:'user-id' }, body:{ clientId:'client-id', booking:'UPDATED', updatedAt:previous.updated_at } };
  return { queries, audits, validations, response, request, run:() => handler(request, response) };
}

test('edição lê processo e regras atuais do exportador em uma consulta', async () => {
  const h = harness();
  await h.run();
  assert.equal(h.queries.length, 2); // leitura combinada + UPDATE/auditoria atômicos
  assert.match(h.queries[0].sql, /LEFT JOIN clients c ON c.id=\$2::uuid WHERE p.id=\$1/);
  assert.equal(h.queries[0].params[1], 'client-id');
  assert.equal(h.validations[0].dueOnly, true);
  assert.match(h.queries[1].sql, /^WITH updated AS/);
  assert.match(h.queries[1].sql, /INSERT INTO audit_log/);
  assert.equal(h.audits.length, 0);
  assert.equal(h.response.body.booking, 'UPDATED');
  assert.equal(h.request.body.processNumber, undefined);
  assert.equal('validation_client_id' in h.response.body, false);
});

test('exportador inexistente não permite gravação nem auditoria', async () => {
  const h = harness({ clientExists:false });
  await h.run();
  assert.equal(h.response.statusCode, 400);
  assert.equal(h.queries.length, 1);
  assert.equal(h.audits.length, 0);
});

test('processo inexistente continua retornando 404', async () => {
  const h = harness({ exists:false });
  await h.run();
  assert.equal(h.response.statusCode, 404);
  assert.equal(h.queries.length, 1);
});

test('edição com versão antiga continua bloqueada antes do UPDATE', async () => {
  const h = harness();
  h.request.body.updatedAt = '2026-10-22T12:00:00.000Z';
  await h.run();
  assert.equal(h.response.statusCode, 409);
  assert.equal(h.queries.length, 1);
  assert.equal(h.audits.length, 0);
});

test('cliente normal mantém regras de RUC ao validar a edição', async () => {
  const h = harness({ dueOnly:false });
  await h.run();
  assert.equal(h.validations[0].dueOnly, false);
  assert.equal(h.validations[0].rucManual, false);
});
