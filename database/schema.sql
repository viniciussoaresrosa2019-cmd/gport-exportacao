CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin', 'analyst', 'vgm', 'financeiro', 'liberacao')),
  roles VARCHAR(20)[] NOT NULL DEFAULT ARRAY['analyst']::VARCHAR[] CHECK (
    cardinality(roles) BETWEEN 1 AND 2
    AND roles <@ ARRAY['admin', 'analyst', 'vgm', 'financeiro', 'liberacao']::VARCHAR[]
    AND (cardinality(roles) = 1 OR roles[1] <> roles[2])
  ),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION sync_user_primary_role() RETURNS TRIGGER AS $$
BEGIN
  NEW.role = NEW.roles[1];
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_sync_primary_role
  BEFORE INSERT OR UPDATE OF roles ON users
  FOR EACH ROW EXECUTE FUNCTION sync_user_primary_role();

CREATE INDEX users_active_roles_gin_idx ON users USING GIN (roles) WHERE active = TRUE;

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(180) NOT NULL UNIQUE,
  tax_id VARCHAR(40),
  contact VARCHAR(120),
  phone VARCHAR(50),
  email VARCHAR(160),
  country VARCHAR(80),
    address TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    ruc_manual BOOLEAN NOT NULL DEFAULT FALSE,
    due_only BOOLEAN NOT NULL DEFAULT FALSE,
    ovacao BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_number VARCHAR(80) NOT NULL UNIQUE,
  display_process_number VARCHAR(80),
  status VARCHAR(50) NOT NULL DEFAULT 'Em andamento',
  client_id UUID NOT NULL REFERENCES clients(id),
  importer VARCHAR(180),
  invoice VARCHAR(100),
  booking VARCHAR(100),
  due_number VARCHAR(100),
  due_issue_date DATE,
  ruc_number VARCHAR(100),
  origin_port VARCHAR(120),
  destination_port VARCHAR(120),
  vessel VARCHAR(120),
  agency VARCHAR(120),
  carrier VARCHAR(120),
  deadline TIMESTAMP WITHOUT TIME ZONE,
  shipping_date DATE,
  post_shipment_date DATE,
  container_collection_date DATE,
  collection_terminal VARCHAR(120),
  free_time_days INTEGER CHECK (free_time_days >= 0),
  incoterm VARCHAR(10),
  shipment_type VARCHAR(3) CHECK (shipment_type IN ('FCL', 'LCL')),
  bl_type VARCHAR(40),
  freight_type VARCHAR(40),
  mapa_inspection BOOLEAN NOT NULL DEFAULT FALSE,
  isf_lacey BOOLEAN NOT NULL DEFAULT FALSE,
  vgm_status VARCHAR(30) NOT NULL DEFAULT 'Não' CHECK (vgm_status IN ('Não', 'Sim', 'Enviado pelo Cliente', 'Enviando no DRAFT')),
  vgm_sent_to VARCHAR(160),
  vgm_sent_date TIMESTAMP WITHOUT TIME ZONE,
  release_status VARCHAR(10) NOT NULL DEFAULT 'Não' CHECK (release_status IN ('Não', 'Sim')),
  release_schedule TIMESTAMP WITHOUT TIME ZONE,
  release_deadline TIMESTAMP WITHOUT TIME ZONE,
  release_channel VARCHAR(10) CHECK (release_channel IN ('Verde', 'Laranja', 'Vermelho')),
  release_date TIMESTAMP WITHOUT TIME ZONE,
  followup_status VARCHAR(15) NOT NULL DEFAULT 'Pendente' CHECK (followup_status IN ('Pendente', 'Concluído')),
  followup_note VARCHAR(500),
  physical_process_analyst VARCHAR(120),
  container_quantity INTEGER CHECK (container_quantity >= 0),
  container_type VARCHAR(80),
  container_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  cubic_meters NUMERIC(14,2),
  net_weight_kg NUMERIC(14,2),
  gross_weight_kg NUMERIC(14,2),
  packages_quantity INTEGER CHECK (packages_quantity >= 0),
  cargo_value NUMERIC(16,2),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'EUR', 'BRL')),
  analyst_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX processes_created_at_idx ON processes(created_at DESC);
CREATE INDEX processes_client_id_idx ON processes(client_id);
CREATE INDEX processes_analyst_id_idx ON processes(analyst_id);

CREATE TABLE user_notifications (
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
CREATE INDEX user_notifications_user_unread_idx ON user_notifications(user_id,read_at,created_at DESC);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(40) NOT NULL,
  entity_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mantém uma sequência independente por ano para números como 0001/26.
CREATE TABLE process_counters (
  reference_year SMALLINT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

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
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER processes_updated_at BEFORE UPDATE ON processes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
