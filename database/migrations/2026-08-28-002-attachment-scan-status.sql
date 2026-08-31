-- Metadados para validação/varredura de anexos.
-- Registros existentes são aprovados por compatibilidade. Isso não afirma que
-- receberam antivírus; o provedor registra "legacy" ou "basic-signature".
-- Rollback: manter colunas; corrigir adiante com nova migração aditiva.

ALTER TABLE process_attachments
  ADD COLUMN IF NOT EXISTS scan_status VARCHAR(16) NOT NULL DEFAULT 'approved';
ALTER TABLE process_attachments
  ADD COLUMN IF NOT EXISTS scan_provider VARCHAR(40) NOT NULL DEFAULT 'legacy';
ALTER TABLE process_attachments
  ADD COLUMN IF NOT EXISTS scan_checked_at TIMESTAMPTZ;
ALTER TABLE process_attachments
  ADD COLUMN IF NOT EXISTS scan_error_code VARCHAR(80);

ALTER TABLE process_attachments DROP CONSTRAINT IF EXISTS process_attachments_scan_status_check;
ALTER TABLE process_attachments ADD CONSTRAINT process_attachments_scan_status_check
  CHECK (scan_status IN ('pending', 'approved', 'rejected', 'failed'));

CREATE INDEX IF NOT EXISTS process_attachments_scan_status_idx
  ON process_attachments(scan_status,created_at);
