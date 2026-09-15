-- Busca de exportador: índice por cliente, ordenação da planilha e texto sem acento.
-- pg_trgm permite ILIKE/LIKE com termo parcial sem varrer todos os exportadores.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS processes_client_created_id_idx
  ON processes (client_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS clients_name_lower_idx
  ON clients (LOWER(name));

CREATE INDEX IF NOT EXISTS clients_name_normalized_trgm_idx
  ON clients USING GIN (
    (regexp_replace(
      translate(lower(COALESCE((name)::text, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
      '\s+', ' ', 'g'
    )) gin_trgm_ops
  );
