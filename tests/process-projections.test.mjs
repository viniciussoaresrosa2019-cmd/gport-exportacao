import assert from 'node:assert/strict';
import test from 'node:test';
import {
  processCalendarSelect, processDetailSelect, processFollowupSelect,
  processProjection, processReleaseSelect, processSummarySelect,
  processVgmSelect, supportedProcessProjections
} from '../src/process-projections.js';

test('projeção resumida preserva o contrato visual sem carregar contêineres', () => {
  for (const field of [
    'p.id', 'p.booking', 'p.invoice', 'p.importer', 'p.origin_port',
    'p.destination_port', 'p.deadline', 'p.vgm_status', 'p.release_status',
    'p.release_channel', 'p.analyst_id', 'p.created_at', 'p.updated_at'
  ]) assert.match(processSummarySelect, new RegExp(field.replace('.', '\\.')));
  assert.doesNotMatch(processSummarySelect, /p\.\*|container_details|content|password|token/i);
  assert.match(processSummarySelect, /AS exporter/);
  assert.match(processSummarySelect, /AS analyst/);
});

test('projeção completa permanece padrão para consumidores existentes', () => {
  assert.equal(processProjection('full'), processDetailSelect);
  assert.equal(processProjection('desconhecida'), processDetailSelect);
  assert.equal(processProjection('summary'), processSummarySelect);
  assert.deepEqual([...supportedProcessProjections].sort(), ['followup', 'full', 'release', 'summary', 'vgm']);
});

test('VGM, Liberação e Follow up recebem somente os campos consumidos por cada tela', () => {
  const contracts = [
    [processVgmSelect, ['p.vgm_status', 'p.vgm_sent_to', 'p.physical_process_analyst', 'p.release_deadline']],
    [processReleaseSelect, ['p.origin_port', 'p.vessel', 'p.release_status', 'p.release_channel']],
    [processFollowupSelect, ['p.invoice', 'p.vessel', 'p.followup_status', 'p.followup_note']]
  ];
  for (const [projection, fields] of contracts) {
    assert.doesNotMatch(projection, /p\.\*|container_details|cargo_value|content|password|token/i);
    for (const field of fields) assert.match(projection, new RegExp(field.replace('.', '\\.')));
  }
  assert.equal(processProjection('vgm'), processVgmSelect);
  assert.equal(processProjection('release'), processReleaseSelect);
  assert.equal(processProjection('followup'), processFollowupSelect);
});

test('calendário usa contrato mínimo e reduz payload representativo', () => {
  assert.doesNotMatch(processCalendarSelect, /p\.\*|container_details|invoice|cargo_value|content/i);
  for (const field of ['p.id', 'p.booking', 'p.deadline', 'p.container_collection_date', 'p.release_schedule', 'p.release_deadline']) {
    assert.match(processCalendarSelect, new RegExp(field.replace('.', '\\.')));
  }
  const full = Array.from({ length:500 }, (_, index) => ({
    id:`id-${index}`,
    booking:`BOOKING-${index}`,
    deadline:'2026-08-28T12:00:00',
    importer:'IMPORTADOR COM NOME REPRESENTATIVO',
    invoice:`FATURA-${index}`,
    container_details:Array.from({ length:8 }, (_value, item) => ({ number:`ABCD${String(index * 10 + item).padStart(7, '0')}`, tare:3800, seal:`LACRE-${item}`, invoice_number:`NF-${index}-${item}` })),
    cargo_value:'125000.00'
  }));
  const compact = full.map(({ id, booking, deadline }) => ({ id, booking, deadline, container_collection_date:null, release_schedule:null, release_deadline:null }));
  const fullBytes = Buffer.byteLength(JSON.stringify(full));
  const compactBytes = Buffer.byteLength(JSON.stringify(compact));
  assert.ok(compactBytes < fullBytes * 0.25, `Payload compacto ${compactBytes} deveria ser menor que 25% de ${fullBytes}.`);
});
