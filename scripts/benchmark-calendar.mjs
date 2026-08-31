import { gzipSync } from 'node:zlib';

const total = Math.min(20_000, Math.max(500, Number(process.argv.find(argument => argument.startsWith('--items='))?.split('=')[1] || 500)));
const fullRows = Array.from({ length:total }, (_, index) => ({
  id:`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  process_number:`PROC-${index}`,
  booking:`BOOKING-${index}`,
  invoice:`INV-${index}`,
  importer:`IMPORTADOR REPRESENTATIVO ${index}`,
  deadline:`2026-08-${String(index % 28 + 1).padStart(2, '0')}T${String(index % 24).padStart(2, '0')}:00:00`,
  container_collection_date:null,
  release_schedule:null,
  release_deadline:null,
  analyst_id:'00000000-0000-4000-8000-000000000001',
  exporter:'EXPORTADOR REPRESENTATIVO',
  analyst:'ANALISTA DE TESTE',
  container_details:Array.from({ length:4 }, (_, container) => ({
    number:`ABCD${String(index * 4 + container).padStart(7, '0')}`,
    tare:3750,
    seal:`LACRE-${index}-${container}`,
    invoice_number:`NF-${index}-${container}`
  })),
  internal_notes:'x'.repeat(220)
}));
const compactRows = fullRows.map(row => ({
  id:row.id,
  booking:row.booking,
  deadline:row.deadline,
  container_collection_date:row.container_collection_date,
  release_schedule:row.release_schedule,
  release_deadline:row.release_deadline,
  analyst_id:row.analyst_id,
  exporter:row.exporter,
  analyst:row.analyst
}));

const measure = rows => {
  const before = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const groups = new Map();
  for (const row of rows) {
    const day = row.deadline.slice(0, 10);
    const events = groups.get(day) || [];
    events.push({ id:row.id, booking:row.booking, when:row.deadline });
    groups.set(day, events);
  }
  for (const events of groups.values()) events.sort((left, right) => left.when.localeCompare(right.when));
  const renderModel = [...groups].sort(([left], [right]) => left.localeCompare(right));
  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - before);
  const json = Buffer.from(JSON.stringify(rows));
  return { rows:rows.length, days:renderModel.length, jsonBytes:json.length, gzipBytes:gzipSync(json).length, durationMs, heapDeltaBytes };
};

const full = measure(fullRows);
const compact = measure(compactRows);
const firstPage = measure(compactRows.slice(0, 200));
const percent = (before, after) => Math.round((1 - after / before) * 1000) / 10;
console.log(JSON.stringify({
  generatedData:true,
  sensitiveData:false,
  total,
  full,
  compact,
  progressiveFirstPage:firstPage,
  reduction:{ jsonPercent:percent(full.jsonBytes, compact.jsonBytes), gzipPercent:percent(full.gzipBytes, compact.gzipBytes) },
  strategy:'projection-compacta + páginas de 200 + limite visível de 1000 + índice por analista/prazo'
}, null, 2));

