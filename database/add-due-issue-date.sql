-- Execute uma única vez no Supabase SQL Editor.
-- Guarda a data manual de emissão da DU-E para exibição na capa do processo.

ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS due_issue_date DATE;
