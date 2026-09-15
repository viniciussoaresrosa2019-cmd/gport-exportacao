const processRelations = `FROM processes p
  LEFT JOIN clients c ON c.id=p.client_id
  LEFT JOIN users u ON u.id=p.analyst_id`;

const relationFields = `COALESCE(c.name, 'Exportador não cadastrado') AS exporter,
  COALESCE(c.ovacao,false) AS client_ovacao,
  COALESCE(u.username, 'Usuário removido') AS analyst`;

export const processDetailSelect = `SELECT p.*,${relationFields} ${processRelations}`;

// Contrato enxuto da planilha inicial. Detalhes, edição e impressão continuam
// no endpoint /api/processes/:id e nunca dependem desta projeção.
export const processSummarySelect = `SELECT
  p.id,p.process_number,p.display_process_number,p.status,p.client_id,
  p.importer,p.invoice,p.booking,p.origin_port,p.destination_port,p.deadline,
  p.vgm_status,p.release_status,p.release_channel,p.release_deadline,
  p.analyst_id,p.created_at,p.updated_at,
  ${relationFields}
  ${processRelations}`;

export const processVgmSelect = `SELECT
  p.id,p.client_id,p.booking,p.importer,p.origin_port,p.destination_port,
  p.vgm_status,p.vgm_sent_to,p.vgm_sent_date,p.physical_process_analyst,
  p.release_schedule,p.release_deadline,p.release_channel,
  p.analyst_id,p.created_at,p.updated_at,
  ${relationFields}
  ${processRelations}`;

export const processReleaseSelect = `SELECT
  p.id,p.client_id,p.booking,p.importer,p.origin_port,p.vessel,
  p.release_status,p.release_schedule,p.release_deadline,p.release_channel,
  p.release_date,p.analyst_id,p.created_at,p.updated_at,
  ${relationFields}
  ${processRelations}`;

export const processFollowupSelect = `SELECT
  p.id,p.client_id,p.booking,p.invoice,p.importer,p.vessel,
  p.followup_status,p.followup_note,p.release_channel,
  p.analyst_id,p.created_at,p.updated_at,
  ${relationFields}
  ${processRelations}`;

// Contrato exclusivo do Pós-embarque. A data é independente da data de envio
// do draft, para que registrar o embarque não altere o histórico documental.
export const processPostShipmentSelect = `SELECT
  p.id,p.client_id,p.booking,p.invoice,p.importer,p.vessel,p.origin_port,
  p.destination_port,p.post_shipment_date,p.analyst_id,p.created_at,p.updated_at,
  ${relationFields}
  ${processRelations}`;

// Contrato da área Braspine: processos de exportadores configurados como
// Apenas DU-E. A edição completa continua disponível pelo endpoint individual.
export const processBraspineSelect = `SELECT
  p.id,p.client_id,p.booking,p.invoice,p.importer,p.origin_port,p.destination_port,
  p.vessel,p.due_number,p.ruc_number,p.analyst_id,p.created_at,p.updated_at,
  ${relationFields}
  ${processRelations}`;

export const processCalendarSelect = `SELECT
  p.id,p.booking,p.deadline,p.container_collection_date,
  p.release_schedule,p.release_deadline,p.analyst_id,
  ${relationFields}
  ${processRelations}`;

const projections = Object.freeze({
  full:processDetailSelect,
  summary:processSummarySelect,
  vgm:processVgmSelect,
  release:processReleaseSelect,
  followup:processFollowupSelect,
  postshipment:processPostShipmentSelect,
  braspine:processBraspineSelect
});

export const processProjection = name => projections[name] || processDetailSelect;
export const supportedProcessProjections = new Set(Object.keys(projections));
