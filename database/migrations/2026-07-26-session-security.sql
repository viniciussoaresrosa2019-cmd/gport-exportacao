-- Execute uma vez no SQL Editor do Supabase, antes de publicar esta versão.
-- Revoga sessões existentes ao alterar senha e suporta cookies de sessão seguros.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_token_version_nonnegative;
ALTER TABLE public.users
  ADD CONSTRAINT users_token_version_nonnegative CHECK (token_version >= 0);

-- A API é a única camada autorizada a acessar as tabelas. Não conceda acesso
-- direto ao navegador usando anon/authenticated.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.users, public.clients, public.processes, public.audit_log FROM anon, authenticated;
