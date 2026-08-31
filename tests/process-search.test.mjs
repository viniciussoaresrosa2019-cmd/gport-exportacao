import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProcessSearchQuery, normalizeSearchTerm, processSearchFields } from '../src/process-search.js';

test('busca normaliza acentos, caixa e espaços sem alterar SQL', () => {
  assert.equal(normalizeSearchTerm('  São   JOSÉ  '), 'sao jose');
  const query = buildProcessSearchQuery({ search:'  São   JOSÉ  ', field:'porto', limit:'25', offset:'50' });
  assert.equal(query.params[1], 'sao jose');
  assert.equal(query.limit, 25);
  assert.equal(query.offset, 50);
  assert.equal(query.pageParams.at(-2), 25);
  assert.equal(query.pageParams.at(-1), 50);
  assert.match(query.itemsSql, /LIMIT \$10 OFFSET \$11/);
});

test('busca escapa curingas e mantém termo exclusivamente parametrizado', () => {
  const query = buildProcessSearchQuery({ search:"abc%_\\' OR TRUE", field:'booking' });
  assert.equal(query.itemsSql.includes("abc%_\\' OR TRUE"), false);
  assert.match(query.params[1], /abc\\%\\_\\\\' or true/);
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
});

