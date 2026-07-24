-- Execute uma única vez no Supabase SQL Editor.
ALTER TABLE processes ADD COLUMN IF NOT EXISTS vgm_status VARCHAR(30) NOT NULL DEFAULT 'Não';
ALTER TABLE processes ADD COLUMN IF NOT EXISTS physical_process_analyst VARCHAR(120);

ALTER TABLE processes DROP CONSTRAINT IF EXISTS processes_vgm_status_check;
ALTER TABLE processes ADD CONSTRAINT processes_vgm_status_check
  CHECK (vgm_status IN ('Não', 'Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT'));
