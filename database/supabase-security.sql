-- Execute este arquivo DEPOIS de schema.sql no SQL Editor do Supabase.
-- A API usa a conexão privada do banco; nenhum navegador deve usar a senha do banco.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.users FROM anon, authenticated;
REVOKE ALL ON TABLE public.clients FROM anon, authenticated;
REVOKE ALL ON TABLE public.processes FROM anon, authenticated;
REVOKE ALL ON TABLE public.audit_log FROM anon, authenticated;

-- Não crie políticas públicas. O acesso deverá passar exclusivamente pela API.
