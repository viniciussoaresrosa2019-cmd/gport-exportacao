import { processProjection, supportedProcessProjections } from './process-projections.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const normalizeSearchTerm = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('pt-BR');

const escapeLikeTerm = value => normalizeSearchTerm(value).replace(/[\\%_]/g, match => `\\${match}`);
const normalizedSearchExpression = expression => `regexp_replace(translate(lower(COALESCE((${expression})::text,'')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '\\s+', ' ', 'g')`;

export const processSearchFields = Object.freeze({
  todos:"CONCAT_WS(' ',p.booking,p.process_number,p.display_process_number,p.status,c.name,p.importer,p.invoice,p.due_number,p.ruc_number,p.origin_port,p.destination_port,p.vessel,p.agency,p.carrier,p.bl_type,p.freight_type,p.vgm_status,p.release_status,p.release_channel,p.container_details::text,u.username)",
  booking:'p.booking', exportador:'c.name', importador:'p.importer', fatura:'p.invoice',
  origem:'p.origin_port', destino:'p.destination_port', porto:"CONCAT_WS(' ',p.origin_port,p.destination_port)", navio:'p.vessel', analista:'u.username',
  prazo:"TO_CHAR(p.deadline,'DD/MM HH24:MI')", envio:"TO_CHAR(p.shipping_date,'DD/MM')", coleta:"TO_CHAR(p.container_collection_date,'DD/MM')",
  agencia:'p.agency', armador:'p.carrier', tipoembarque:'p.shipment_type', tipobl:'p.bl_type', tipofrete:'p.freight_type',
  vistoriomapa:"CASE WHEN p.mapa_inspection THEN 'Sim' ELSE 'Não' END", incoterm:'p.incoterm', containers:'p.container_details::text',
  qtdcontainers:'p.container_quantity::text', tipocontainer:'p.container_type', terminal:'p.collection_terminal', freetime:'p.free_time_days::text',
  metragem:'p.cubic_meters::text', pesoliquido:'p.net_weight_kg::text', pesobruto:'p.gross_weight_kg::text', volumes:'p.packages_quantity::text',
  valor:'p.cargo_value::text', moeda:'p.currency', due:'p.due_number', ruc:'p.ruc_number'
});

const invalidFilter = () => Object.assign(new Error('Filtro inválido.'), { status:400, code:'INVALID_PROCESS_FILTER' });

export const buildProcessSearchQuery = query => {
  const rawTerm = normalizeSearchTerm(query.search);
  const term = escapeLikeTerm(rawTerm);
  const status = String(query.status || '').trim();
  const field = String(query.field || 'todos').trim().toLowerCase();
  const clientId = String(query.client || '').trim();
  const clientName = String(query.clientName || '').trim();
  const launchedFrom = String(query.launchedFrom || '').trim();
  const launchedTo = String(query.launchedTo || '').trim();
  const vgmStatus = String(query.vgmStatus || '').trim().toLowerCase();
  const releaseStatus = String(query.releaseStatus || '').trim().toLowerCase();
  const postShipmentStatus = String(query.postShipmentStatus || '').trim().toLowerCase();
  const originPort = normalizeSearchTerm(query.originPort);
  const view = String(query.view || 'processes').trim().toLowerCase();
  const projection = String(query.projection || 'full').trim().toLowerCase();
  const limit = Number(query.limit || 50);
  const offset = Number(query.offset || 0);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (rawTerm.length > 100 || status.length > 40 || clientName.length > 200 || originPort.length > 120
    || !['processes', 'vgm', 'release', 'followup', 'postshipment', 'braspine'].includes(view) || !supportedProcessProjections.has(projection)
    || !['', 'sent', 'pending'].includes(vgmStatus) || !['', 'released', 'pending'].includes(releaseStatus)
    || !['', 'shipped', 'pending'].includes(postShipmentStatus)
    || (launchedFrom && !datePattern.test(launchedFrom)) || (launchedTo && !datePattern.test(launchedTo))
    || (launchedFrom && launchedTo && launchedFrom > launchedTo) || (clientId && !uuidPattern.test(clientId))
    || !Object.hasOwn(processSearchFields, field) || !Number.isInteger(limit) || limit < 1 || limit > 100
    || !Number.isInteger(offset) || offset < 0 || offset > 1_000_000) throw invalidFilter();

  const params = [status, term, clientId, clientName, launchedFrom, launchedTo, vgmStatus, releaseStatus, originPort, postShipmentStatus];
  // Clientes classificados como Apenas DU-E têm um fluxo próprio. O recorte
  // é feito na consulta, e não somente na interface, para evitar que uma
  // atualização de tela volte a expô-los na planilha ou na área de VGM.
  const dueOnlyScope = view === 'braspine'
    ? ' AND COALESCE(c.due_only,false)=TRUE'
    : ['processes', 'vgm'].includes(view) ? ' AND COALESCE(c.due_only,false)=FALSE' : '';
  const where = `WHERE ($1='' OR p.status=$1) AND ($2='' OR ${normalizedSearchExpression(processSearchFields[field])} LIKE '%'||$2||'%' ESCAPE E'\\\\') AND ($3='' OR p.client_id=NULLIF($3,'')::uuid OR LOWER(COALESCE(c.name,''))=LOWER($4)) AND ($5='' OR p.created_at >= $5::date) AND ($6='' OR p.created_at < ($6::date + INTERVAL '1 day')) AND ($7='' OR ($7='sent' AND p.vgm_status IN ('Sim','Enviado pelo Cliente','Enviando no DRAFT')) OR ($7='pending' AND COALESCE(p.vgm_status,'') NOT IN ('Sim','Enviado pelo Cliente','Enviando no DRAFT'))) AND ($8='' OR ($8='released' AND p.release_status='Sim') OR ($8='pending' AND COALESCE(p.release_status,'Não')<>'Sim')) AND ($9='' OR ${normalizedSearchExpression('p.origin_port')}=$9) AND ($10='' OR ($10='shipped' AND p.post_shipment_date IS NOT NULL) OR ($10='pending' AND p.post_shipment_date IS NULL))${dueOnlyScope}`;
  const orderBy = {
    processes:'c.name ASC,p.created_at DESC,p.id DESC',
    vgm:'p.vgm_sent_date DESC NULLS LAST,p.created_at DESC,p.id DESC',
    release:'p.origin_port ASC,p.release_deadline ASC NULLS LAST,p.created_at DESC,p.id DESC',
    followup:'p.updated_at DESC,p.id DESC',
    postshipment:'p.post_shipment_date ASC NULLS FIRST,p.created_at DESC,p.id DESC',
    braspine:'c.name ASC,p.created_at DESC,p.id DESC'
  }[view];
  const next = params.length + 1;
  return {
    itemsSql:`${processProjection(projection)} ${where} ORDER BY ${orderBy} LIMIT $${next} OFFSET $${next + 1}`,
    countSql:`SELECT COUNT(*)::int AS total FROM processes p LEFT JOIN clients c ON c.id=p.client_id LEFT JOIN users u ON u.id=p.analyst_id ${where}`,
    params,
    pageParams:[...params, limit, offset],
    limit,
    offset
  };
};
