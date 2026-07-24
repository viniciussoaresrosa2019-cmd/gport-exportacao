-- Execute uma única vez no Supabase SQL Editor.
-- Cria números sequenciais por ano: 0001/26, 0002/26, ...

CREATE TABLE IF NOT EXISTS process_counters (
  reference_year SMALLINT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

-- Se já houver processos no formato novo, continua a partir do maior número.
INSERT INTO process_counters(reference_year, last_number)
SELECT
  (2000 + RIGHT(process_number, 2)::INTEGER)::SMALLINT,
  MAX(SPLIT_PART(process_number, '/', 1)::INTEGER)
FROM processes
WHERE process_number ~ '^[0-9]+/[0-9]{2}$'
GROUP BY RIGHT(process_number, 2)
ON CONFLICT (reference_year)
DO UPDATE SET last_number = GREATEST(process_counters.last_number, EXCLUDED.last_number);

CREATE OR REPLACE FUNCTION next_process_number() RETURNS TEXT AS $$
DECLARE
  current_year SMALLINT := EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT;
  next_number INTEGER;
BEGIN
  INSERT INTO process_counters(reference_year, last_number)
  VALUES (current_year, 1)
  ON CONFLICT (reference_year)
  DO UPDATE SET last_number = process_counters.last_number + 1
  RETURNING last_number INTO next_number;

  RETURN LPAD(next_number::TEXT, 4, '0') || '/' || RIGHT(current_year::TEXT, 2);
END;
$$ LANGUAGE plpgsql;
