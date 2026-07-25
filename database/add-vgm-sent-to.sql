-- Campo “Enviado para” da aba VGM.
ALTER TABLE processes ADD COLUMN IF NOT EXISTS vgm_sent_to VARCHAR(160);
