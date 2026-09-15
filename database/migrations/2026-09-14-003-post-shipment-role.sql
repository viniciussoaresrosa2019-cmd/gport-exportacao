-- Perfil que administra exclusivamente a data de embarque no Pós-embarque.
-- Administradores continuam autorizados pelo middleware da aplicação.
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles VARCHAR(20)[];

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'analyst', 'vgm', 'financeiro', 'liberacao', 'pos_embarque'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_check;
ALTER TABLE users ADD CONSTRAINT users_roles_check CHECK (
  cardinality(roles) BETWEEN 1 AND 2
  AND roles <@ ARRAY['admin', 'analyst', 'vgm', 'financeiro', 'liberacao', 'pos_embarque']::VARCHAR[]
  AND (cardinality(roles) = 1 OR roles[1] <> roles[2])
);
