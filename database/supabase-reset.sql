-- ATENÇÃO: use somente enquanto o banco ainda estiver vazio/de teste.
-- Remove toda a estrutura anterior do Atlas Export para começar do zero.
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.processes CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
