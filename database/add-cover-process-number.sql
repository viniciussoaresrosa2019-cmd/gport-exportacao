-- Execute uma única vez no Supabase SQL Editor.
-- Número manual exibido no canto superior direito da capa do processo.

ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS display_process_number VARCHAR(80);
