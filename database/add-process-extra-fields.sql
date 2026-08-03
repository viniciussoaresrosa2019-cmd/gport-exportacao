-- Execute uma única vez no Supabase SQL Editor antes de publicar esta atualização.
ALTER TABLE processes ADD COLUMN IF NOT EXISTS bl_type VARCHAR(40);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS freight_type VARCHAR(40);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS mapa_inspection BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS isf_lacey BOOLEAN NOT NULL DEFAULT FALSE;
