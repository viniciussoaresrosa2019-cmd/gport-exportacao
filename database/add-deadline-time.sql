-- Execute uma única vez no Supabase SQL Editor.
-- Mantém os prazos já existentes e permite incluir horário nos novos lançamentos.
ALTER TABLE processes
  ALTER COLUMN deadline TYPE TIMESTAMP WITHOUT TIME ZONE
  USING deadline::timestamp;
