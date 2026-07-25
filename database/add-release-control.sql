-- Controle da aba Liberação. Execute uma vez no Supabase SQL Editor se o
-- servidor não estiver em execução para criar o campo imediatamente.
ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS release_status VARCHAR(10) NOT NULL DEFAULT 'Não';
ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_schedule TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_deadline TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE processes ALTER COLUMN release_deadline TYPE TIMESTAMP WITHOUT TIME ZONE USING release_deadline::timestamp;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_channel VARCHAR(10);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_date TIMESTAMP WITHOUT TIME ZONE;
