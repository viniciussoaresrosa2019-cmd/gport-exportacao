-- Índices seguros para acelerar listagens, prazos, relatórios e VGM.
-- Execute este arquivo uma única vez no SQL Editor do Supabase.

CREATE INDEX IF NOT EXISTS processes_status_deadline_idx
  ON processes (status, deadline);

CREATE INDEX IF NOT EXISTS processes_analyst_created_at_idx
  ON processes (analyst_id, created_at DESC);

CREATE INDEX IF NOT EXISTS processes_client_created_at_idx
  ON processes (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS processes_vgm_status_idx
  ON processes (vgm_status);

CREATE INDEX IF NOT EXISTS audit_log_entity_created_at_idx
  ON audit_log (entity, created_at DESC);
