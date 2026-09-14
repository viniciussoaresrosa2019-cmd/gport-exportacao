-- Perfis múltiplos por usuário (máximo de duas funções).
-- Compatibilidade: a coluna role continua como função principal para consumidores
-- legados; roles é a fonte de autorização e o trigger mantém as duas coerentes.
-- Rollback corretivo: manter somente roles[1] em role e criar uma migração aditiva
-- para parar de usar roles. Não remova a coluna roles em produção sem backup.

ALTER TABLE users ADD COLUMN IF NOT EXISTS roles VARCHAR(20)[];

UPDATE users
SET roles = ARRAY[role]::VARCHAR[]
WHERE roles IS NULL OR cardinality(roles) = 0;

ALTER TABLE users ALTER COLUMN roles SET DEFAULT ARRAY['analyst']::VARCHAR[];
ALTER TABLE users ALTER COLUMN roles SET NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_check;
ALTER TABLE users ADD CONSTRAINT users_roles_check CHECK (
  cardinality(roles) BETWEEN 1 AND 2
  AND roles <@ ARRAY['admin','analyst','vgm','financeiro','liberacao']::VARCHAR[]
  AND (cardinality(roles) = 1 OR roles[1] <> roles[2])
);

CREATE OR REPLACE FUNCTION sync_user_primary_role() RETURNS TRIGGER AS $$
BEGIN
  NEW.role = NEW.roles[1];
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_sync_primary_role ON users;
CREATE TRIGGER users_sync_primary_role
  BEFORE INSERT OR UPDATE OF roles ON users
  FOR EACH ROW EXECUTE FUNCTION sync_user_primary_role();

CREATE INDEX IF NOT EXISTS users_active_roles_gin_idx
  ON users USING GIN (roles) WHERE active = TRUE;
