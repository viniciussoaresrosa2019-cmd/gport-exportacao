-- GPORT | Esquema consolidado e seguro para Supabase
--
-- Este arquivo NÃO apaga processos, clientes ou usuários existentes.
-- Pode ser executado uma única vez no SQL Editor do Supabase para criar ou
-- completar a estrutura atual. Os arquivos SQL antigos continuam apenas como
-- histórico e não precisam ser executados novamente.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'analyst',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(180) NOT NULL UNIQUE,
  tax_id VARCHAR(40),
  contact VARCHAR(120),
  phone VARCHAR(50),
  email VARCHAR(160),
  country VARCHAR(80),
  address TEXT,
  ruc_manual BOOLEAN NOT NULL DEFAULT FALSE,
  due_only BOOLEAN NOT NULL DEFAULT FALSE,
  ovacao BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_number VARCHAR(80) NOT NULL UNIQUE,
  display_process_number VARCHAR(80),
  status VARCHAR(50) NOT NULL DEFAULT 'Em andamento',
  client_id UUID NOT NULL REFERENCES clients(id),
  importer VARCHAR(180) NOT NULL,
  invoice VARCHAR(100),
  booking VARCHAR(100),
  due_number VARCHAR(100),
  due_issue_date DATE,
  ruc_number VARCHAR(100),
  origin_port VARCHAR(120) NOT NULL,
  destination_port VARCHAR(120) NOT NULL,
  vessel VARCHAR(120),
  agency VARCHAR(120),
  carrier VARCHAR(120),
  deadline TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  shipping_date DATE,
  container_collection_date DATE,
  collection_terminal VARCHAR(120),
  free_time_days INTEGER CHECK (free_time_days >= 0),
  incoterm VARCHAR(10),
  shipment_type VARCHAR(3),
  bl_type VARCHAR(40),
  freight_type VARCHAR(40),
  mapa_inspection BOOLEAN NOT NULL DEFAULT FALSE,
  isf_lacey BOOLEAN NOT NULL DEFAULT FALSE,
  vgm_status VARCHAR(30) NOT NULL DEFAULT 'Não',
  vgm_sent_to VARCHAR(160),
  vgm_sent_date TIMESTAMP WITHOUT TIME ZONE,
  release_status VARCHAR(10) NOT NULL DEFAULT 'Não',
  release_schedule TIMESTAMP WITHOUT TIME ZONE,
  release_deadline TIMESTAMP WITHOUT TIME ZONE,
  release_channel VARCHAR(10),
  release_date TIMESTAMP WITHOUT TIME ZONE,
  followup_status VARCHAR(15) NOT NULL DEFAULT 'Pendente',
  followup_note VARCHAR(500),
  physical_process_analyst VARCHAR(120),
  container_quantity INTEGER CHECK (container_quantity >= 0),
  container_type VARCHAR(80),
  container_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  cubic_meters NUMERIC(14,3),
  net_weight_kg NUMERIC(14,3),
  gross_weight_kg NUMERIC(14,3),
  packages_quantity INTEGER CHECK (packages_quantity >= 0),
  cargo_value NUMERIC(16,2),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  analyst_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(40) NOT NULL,
  entity_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS process_counters (
  reference_year SMALLINT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

-- Complementa bancos que foram criados com versões anteriores do sistema.
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE processes ADD COLUMN IF NOT EXISTS display_process_number VARCHAR(80);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS due_issue_date DATE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS shipment_type VARCHAR(3);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS bl_type VARCHAR(40);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS freight_type VARCHAR(40);
ALTER TABLE processes ADD COLUMN IF NOT EXISTS mapa_inspection BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS isf_lacey BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS vgm_status VARCHAR(30) NOT NULL DEFAULT 'Não';
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
ALTER TABLE processes ADD COLUMN IF NOT EXISTS physical_process_analyst VARCHAR(120);
ALTER TABLE processes ALTER COLUMN deadline TYPE TIMESTAMP WITHOUT TIME ZONE USING deadline::timestamp;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'analyst', 'vgm', 'financeiro', 'liberacao'));
ALTER TABLE processes DROP CONSTRAINT IF EXISTS processes_shipment_type_check;
ALTER TABLE processes ADD CONSTRAINT processes_shipment_type_check CHECK (shipment_type IS NULL OR shipment_type IN ('FCL', 'LCL'));
ALTER TABLE processes DROP CONSTRAINT IF EXISTS processes_vgm_status_check;
ALTER TABLE processes ADD CONSTRAINT processes_vgm_status_check CHECK (vgm_status IN ('Não', 'Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT'));
ALTER TABLE processes DROP CONSTRAINT IF EXISTS processes_release_status_check;
ALTER TABLE processes ADD CONSTRAINT processes_release_status_check CHECK (release_status IN ('Não', 'Sim'));
ALTER TABLE processes DROP CONSTRAINT IF EXISTS processes_release_channel_check;
ALTER TABLE processes ADD CONSTRAINT processes_release_channel_check CHECK (release_channel IS NULL OR release_channel IN ('Verde', 'Laranja', 'Vermelho'));

CREATE INDEX IF NOT EXISTS processes_created_at_idx ON processes(created_at DESC);
CREATE INDEX IF NOT EXISTS processes_client_id_idx ON processes(client_id);
CREATE INDEX IF NOT EXISTS processes_analyst_id_idx ON processes(analyst_id);
CREATE INDEX IF NOT EXISTS processes_status_deadline_idx ON processes(status, deadline);
CREATE INDEX IF NOT EXISTS processes_analyst_created_at_idx ON processes(analyst_id, created_at DESC);
CREATE INDEX IF NOT EXISTS processes_client_created_at_idx ON processes(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS processes_vgm_status_idx ON processes(vgm_status);
CREATE INDEX IF NOT EXISTS audit_log_entity_created_at_idx ON audit_log(entity, created_at DESC);

CREATE OR REPLACE FUNCTION next_process_number() RETURNS TEXT AS $$
DECLARE
  current_year SMALLINT := EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT;
  next_number INTEGER;
BEGIN
  INSERT INTO process_counters(reference_year, last_number)
  VALUES (current_year, 1)
  ON CONFLICT (reference_year)
  DO UPDATE SET last_number = process_counters.last_number + 1
  RETURNING last_number INTO next_number;
  RETURN LPAD(next_number::TEXT, 4, '0') || '/' || RIGHT(current_year::TEXT, 2);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'users_updated_at') THEN
    CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'clients_updated_at') THEN
    CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'processes_updated_at') THEN
    CREATE TRIGGER processes_updated_at BEFORE UPDATE ON processes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- O navegador não recebe acesso direto às tabelas; tudo passa pela API.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.users FROM anon, authenticated;
REVOKE ALL ON TABLE public.clients FROM anon, authenticated;
REVOKE ALL ON TABLE public.processes FROM anon, authenticated;
REVOKE ALL ON TABLE public.audit_log FROM anon, authenticated;
