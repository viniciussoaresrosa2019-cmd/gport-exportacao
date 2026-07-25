-- GPORT | estabilidade, auditoria e desempenho
-- Execute uma única vez no SQL Editor do Supabase, após o schema consolidado.
-- Não remove nem altera processos, clientes ou usuários existentes.

ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE processes
  ALTER COLUMN cubic_meters TYPE NUMERIC(14,3),
  ALTER COLUMN net_weight_kg TYPE NUMERIC(14,3),
  ALTER COLUMN gross_weight_kg TYPE NUMERIC(14,3);

ALTER TABLE processes DROP CONSTRAINT IF EXISTS processes_release_status_check;
ALTER TABLE processes ADD CONSTRAINT processes_release_status_check
  CHECK (release_status IN ('Não', 'Sim'));

ALTER TABLE processes DROP CONSTRAINT IF EXISTS processes_release_channel_check;
ALTER TABLE processes ADD CONSTRAINT processes_release_channel_check
  CHECK (release_channel IS NULL OR release_channel IN ('Verde', 'Laranja', 'Vermelho'));

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'processes_updated_at') THEN
    CREATE TRIGGER processes_updated_at
      BEFORE UPDATE ON processes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- A pesquisa atual usa ILIKE. Estes índices aceleram a planilha quando a
-- quantidade de processos crescer sem alterar o resultado da busca.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS processes_booking_trgm_idx
  ON processes USING gin (booking gin_trgm_ops);
CREATE INDEX IF NOT EXISTS clients_name_trgm_idx
  ON clients USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS processes_importer_trgm_idx
  ON processes USING gin (importer gin_trgm_ops);

