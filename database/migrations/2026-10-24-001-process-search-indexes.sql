-- Busca parcial normalizada sem recalcular todos os campos de cada linha.
-- A função é imutável para poder ser usada por colunas geradas e índices.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.gport_normalize_search_text(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(
    translate(lower(COALESCE(value, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'
  )
$$;

ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    gport_normalize_search_text(
      COALESCE(booking, '') || ' ' ||
      COALESCE(process_number, '') || ' ' ||
      COALESCE(display_process_number, '') || ' ' ||
      COALESCE(status, '') || ' ' ||
      COALESCE(importer, '') || ' ' ||
      COALESCE(invoice, '') || ' ' ||
      COALESCE(due_number, '') || ' ' ||
      COALESCE(ruc_number, '') || ' ' ||
      COALESCE(origin_port, '') || ' ' ||
      COALESCE(destination_port, '') || ' ' ||
      COALESCE(vessel, '') || ' ' ||
      COALESCE(agency, '') || ' ' ||
      COALESCE(carrier, '') || ' ' ||
      COALESCE(bl_type, '') || ' ' ||
      COALESCE(freight_type, '') || ' ' ||
      COALESCE(vgm_status, '') || ' ' ||
      COALESCE(release_status, '') || ' ' ||
      COALESCE(release_channel, '') || ' ' ||
      COALESCE(container_details::text, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS processes_search_text_trgm_idx
  ON processes USING GIN (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clients_search_name_trgm_idx
  ON clients USING GIN (gport_normalize_search_text(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS processes_search_booking_trgm_idx
  ON processes USING GIN (gport_normalize_search_text(booking) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS processes_search_importer_trgm_idx
  ON processes USING GIN (gport_normalize_search_text(importer) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS processes_search_invoice_trgm_idx
  ON processes USING GIN (gport_normalize_search_text(invoice) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS processes_search_due_trgm_idx
  ON processes USING GIN (gport_normalize_search_text(due_number) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS processes_search_vessel_trgm_idx
  ON processes USING GIN (gport_normalize_search_text(vessel) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS processes_search_agency_trgm_idx
  ON processes USING GIN (gport_normalize_search_text(agency) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS processes_search_origin_port_trgm_idx
  ON processes USING GIN (gport_normalize_search_text(origin_port) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS processes_search_destination_port_trgm_idx
  ON processes USING GIN (gport_normalize_search_text(destination_port) gin_trgm_ops);
