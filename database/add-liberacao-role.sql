-- Perfil Liberação: execute uma única vez no Supabase SQL Editor caso o
-- servidor não esteja sendo executado localmente para aplicar a atualização.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'analyst', 'vgm', 'financeiro', 'liberacao'));
