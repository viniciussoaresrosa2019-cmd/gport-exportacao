-- Controle da aba Follow up.
ALTER TABLE processes ADD COLUMN IF NOT EXISTS followup_status VARCHAR(15) NOT NULL DEFAULT 'Pendente';
ALTER TABLE processes ADD COLUMN IF NOT EXISTS followup_note VARCHAR(500);
