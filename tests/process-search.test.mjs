import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProcessSearchQuery, normalizeSearchTerm, processSearchFields } from '../src/process-search.js';

test('busca normaliza acentos, caixa e espaços sem alterar SQL', () => {
  assert.equal(normalizeSearchTerm('  São   JOSÉ  '), 'sao jose');
  const query = buildProcessSearchQuery({ search:'  São   JOSÉ  ', field:'porto', limit:'25', offset:'50' });
  assert.equal(query.params[0], 'sao jose');
  assert.equal(query.limit, 25);
  assert.equal(query.offset, 50);
  assert.equal(query.pageParams.at(-2), 25);
  assert.equal(query.pageParams.at(-1), 50);
  assert.match(query.itemsSql, /LIMIT \$2 OFFSET \$3/);
});

test('busca escapa curingas e mantém termo exclusivamente parametrizado', () => {
  const query = buildProcessSearchQuery({ search:"abc%_\\' OR TRUE", field:'booking' });
  assert.equal(query.itemsSql.includes("abc%_\\' OR TRUE"), false);
  assert.match(query.params[0], /abc\\%\\_\\\\' or true/);
  assert.match(query.itemsSql, /ESCAPE/);
});

test('busca cobre identificadores e campos operacionais esperados', () => {
  for (const field of ['todos','booking','exportador','importador','fatura','due','ruc','containers','tipobl','tipofrete','porto','navio','analista']) {
    assert.ok(processSearchFields[field], `campo ausente: ${field}`);
  }
  assert.match(processSearchFields.todos, /process_number/);
  assert.match(processSearchFields.todos, /container_details/);
});

test('filtros inválidos, termos longos e paginação excessiva são recusados', () => {
  for (const input of [
    { search:'x'.repeat(101) },
    { field:'sql_injetado' },
    { limit:101 },
    { offset:-1 },
    { launchedFrom:'2026-12-31', launchedTo:'2026-01-01' },
    { client:'not-a-uuid' }
  ]) assert.throws(() => buildProcessSearchQuery(input), error => error.code === 'INVALID_PROCESS_FILTER' && error.status === 400);
});

test('ordenação é estável e específica por tela', () => {
  assert.match(buildProcessSearchQuery({ view:'processes' }).itemsSql, /c\.name ASC,p\.created_at DESC,p\.id DESC/);
  assert.match(buildProcessSearchQuery({ view:'vgm' }).itemsSql, /vgm_sent_date DESC NULLS LAST/);
  assert.match(buildProcessSearchQuery({ view:'release' }).itemsSql, /origin_port ASC,p\.release_deadline ASC NULLS LAST/);
  assert.match(buildProcessSearchQuery({ view:'followup' }).itemsSql, /updated_at DESC,p\.id DESC/);
  assert.match(buildProcessSearchQuery({ view:'postshipment', projection:'postshipment' }).itemsSql, /post_shipment_date ASC NULLS FIRST/);
  assert.match(buildProcessSearchQuery({ view:'braspine', projection:'braspine' }).itemsSql, /c\.name ASC,p\.created_at DESC,p\.id DESC/);
});

test('filtro por exportador usa client_id direto e ordenação coberta pelo índice', () => {
  const query = buildProcessSearchQuery({
    view:'processes',
    client:'6f3db4ea-d93e-41ea-a909-a89f62508f92',
    clientName:'Nome que não deve entrar na consulta'
  });
  assert.deepEqual(query.params, ['6f3db4ea-d93e-41ea-a909-a89f62508f92']);
  assert.match(query.itemsSql, /p\.client_id=\$1::uuid/);
  assert.doesNotMatch(query.itemsSql, /LOWER\(COALESCE\(c\.name/);
  assert.match(query.itemsSql, /ORDER BY p\.created_at DESC,p\.id DESC/);
});

test('processos Apenas DU-E são separados da planilha, VGM e Braspine no banco', () => {
  assert.match(buildProcessSearchQuery({ view:'processes' }).itemsSql, /COALESCE\(c\.due_only,false\)=FALSE/);
  assert.match(buildProcessSearchQuery({ view:'vgm', projection:'vgm' }).itemsSql, /COALESCE\(c\.due_only,false\)=FALSE/);
  assert.match(buildProcessSearchQuery({ view:'braspine', projection:'braspine' }).itemsSql, /COALESCE\(c\.due_only,false\)=TRUE/);
});
