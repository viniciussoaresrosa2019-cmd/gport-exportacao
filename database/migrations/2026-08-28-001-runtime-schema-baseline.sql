-- Baseline idempotente do esquema que anteriormente era garantido no boot.
-- Pré-requisito para banco limpo: aplicar database/schema.sql.
-- Rollback: não remover colunas/tabelas automaticamente. Em caso de falha,
-- corrigir com uma nova migração aditiva e restaurar o backup se necessário.

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ruc_manual BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS due_only BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ovacao BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE processes ALTER COLUMN importer DROP NOT NULL;
ALTER TABLE processes ALTER COLUMN origin_port DROP NOT NULL;
ALTER TABLE processes ALTER COLUMN destination_port DROP NOT NULL;
ALTER TABLE processes ALTER COLUMN deadline DROP NOT NULL;

ALTER TABLE processes ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'Em andamento';
ALTER TABLE processes ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS importer VARCHAR(200);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS invoice VARCHAR(120);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS booking VARCHAR(120);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS due_number VARCHAR(120);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS ruc_number VARCHAR(120);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS origin_port VARCHAR(120);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS destination_port VARCHAR(120);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS vessel VARCHAR(160);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS agency VARCHAR(160);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS carrier VARCHAR(160);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS deadline TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE processes ALTER COLUMN deadline TYPE TIMESTAMP WITHOUT TIME ZONE USING deadline::timestamp;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS shipping_date DATE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS container_collection_date DATE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS collection_terminal VARCHAR(160);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS free_time_days INTEGER;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS incoterm VARCHAR(10);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS shipment_type VARCHAR(10);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS bl_type VARCHAR(80);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS freight_type VARCHAR(80);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS mapa_inspection BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS isf_lacey BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS container_quantity INTEGER;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS container_type VARCHAR(80);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS container_details JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS cubic_meters NUMERIC(14,3);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS net_weight_kg NUMERIC(14,3);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS gross_weight_kg NUMERIC(14,3);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS packages_quantity INTEGER;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS cargo_value NUMERIC(14,2);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE processes ADD COLUMN IF NOT EXISTS due_issue_date DATE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS display_process_number VARCHAR(80);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS vgm_sent_to VARCHAR(160);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS vgm_sent_date TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_status VARCHAR(10) NOT NULL DEFAULT 'Não';
ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_schedule TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_deadline TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE processes ALTER COLUMN release_deadline TYPE TIMESTAMP WITHOUT TIME ZONE USING release_deadline::timestamp;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_channel VARCHAR(10);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS release_date TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS followup_status VARCHAR(15) NOT NULL DEFAULT 'Pendente';
ALTER TABLE processes ADD COLUMN IF NOT EXISTS followup_note VARCHAR(500);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE processes ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS processes_idempotency_key_unique_idx
  ON processes(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='processes_updated_at') THEN
    CREATE TRIGGER processes_updated_at
      BEFORE UPDATE ON processes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'analyst', 'vgm', 'financeiro', 'liberacao'));

CREATE INDEX IF NOT EXISTS processes_status_deadline_idx ON processes(status, deadline);
CREATE INDEX IF NOT EXISTS processes_created_at_idx ON processes(created_at DESC);
CREATE INDEX IF NOT EXISTS processes_analyst_created_at_idx ON processes(analyst_id, created_at DESC);
CREATE INDEX IF NOT EXISTS processes_client_created_at_idx ON processes(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS processes_vgm_status_idx ON processes(vgm_status);
CREATE INDEX IF NOT EXISTS processes_vgm_sent_date_idx ON processes(vgm_sent_date DESC);
CREATE INDEX IF NOT EXISTS processes_release_origin_deadline_idx ON processes(origin_port, release_deadline ASC);
CREATE INDEX IF NOT EXISTS processes_updated_at_idx ON processes(updated_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_created_at_idx ON audit_log(entity, created_at DESC);

CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  process_id UUID REFERENCES processes(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(120) NOT NULL,
  message VARCHAR(280) NOT NULL,
  dedupe_key VARCHAR(180) NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id,dedupe_key)
);
CREATE INDEX IF NOT EXISTS user_notifications_user_unread_idx
  ON user_notifications(user_id,read_at,created_at DESC);

CREATE TABLE IF NOT EXISTS process_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS process_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS process_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  file_name VARCHAR(160) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 4194304),
  content BYTEA NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS process_prelaunches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analyst_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  booking VARCHAR(160) NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS process_checklist_items_process_idx
  ON process_checklist_items(process_id,completed,created_at);
CREATE INDEX IF NOT EXISTS process_comments_process_idx
  ON process_comments(process_id,created_at DESC);
CREATE INDEX IF NOT EXISTS process_attachments_process_idx
  ON process_attachments(process_id,created_at DESC);
CREATE INDEX IF NOT EXISTS process_prelaunches_analyst_deadline_idx
  ON process_prelaunches(analyst_id,deadline);
