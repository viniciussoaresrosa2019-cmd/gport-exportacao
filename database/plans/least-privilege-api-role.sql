-- PLANO — NÃO EXECUTE DIRETAMENTE EM PRODUÇÃO.
-- Executar somente após migrar todo DDL de src/db.js para migrações revisadas.
-- O usuário atual da API cria/altera índices e tabelas na inicialização; um
-- papel de menor privilégio não pode ter essas permissões.

-- 1. Um administrador do banco cria o papel sem credencial neste arquivo.
--    A senha deve ser inserida diretamente no cofre/console, nunca no Git.
-- CREATE ROLE gport_api LOGIN NOINHERIT PASSWORD '<gerada-no-cofre>';

-- 2. Permissões mínimas para as rotas atuais após todas as migrações:
-- GRANT CONNECT ON DATABASE postgres TO gport_api;
-- GRANT USAGE ON SCHEMA public TO gport_api;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users, clients, processes, audit_log TO gport_api;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gport_api;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gport_api;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO gport_api;

-- 3. Após testes em homologação, atualize DATABASE_URL da API para gport_api.
-- Mantenha a credencial administrativa somente em job de migração separado.
-- RLS deve ser planejado junto com a identidade do usuário de banco; como a
-- API usa um único login, a autorização por usuário continua no back-end até
-- uma migração para autenticação integrada ao Supabase/Auth.
