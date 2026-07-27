# Checklist obrigatória de produção

Execute esta lista em toda publicação. O deploy só deve seguir se todos os itens aplicáveis estiverem concluídos.

## Código e dependências

- [ ] `npm ci` executado sem alterar o `package-lock.json`.
- [ ] `npm run security:secrets` concluído sem alertas.
- [ ] `npm test` concluído com sucesso.
- [ ] `npm audit --omit=dev --audit-level=high` concluído sem vulnerabilidades altas ou críticas.
- [ ] A revisão do GitHub confirma que `.env`, backups, logs, chaves e senhas não foram enviados.
- [ ] O workflow **Security and quality** do GitHub Actions está verde no commit que será publicado.

## Render e Supabase

- [ ] `NODE_ENV=production` está definido no Render.
- [ ] `JWT_SECRET` é exclusivo, aleatório e possui pelo menos 32 caracteres.
- [ ] `CORS_ORIGIN` contém somente a URL HTTPS exata do sistema.
- [ ] `DATABASE_URL` está cadastrada somente como variável secreta do Render.
- [ ] A migração `database/migrations/2026-07-26-session-security.sql` foi executada no Supabase.
- [ ] O navegador não acessa diretamente as tabelas do Supabase; RLS e revogações da migração estão ativas.
- [ ] Há um backup recente e uma restauração foi testada em ambiente separado.
- [ ] Contas administrativas do Render, Supabase e GitHub usam MFA.

## Banco e rede

- [ ] `DB_SSL_CA` ou `DB_SSL_CA_BASE64` está configurada com o certificado raiz do provedor.
- [ ] `ALLOW_UNVERIFIED_DATABASE_TLS` está ausente ou definido como `false`.
- [ ] Somente as pessoas autorizadas têm acesso aos painéis e às credenciais do banco.

## Verificação após o deploy

- [ ] `GET /api/health` retorna `200` e `{ "status": "ok" }`.
- [ ] `GET /api/processes` sem login retorna `401`.
- [ ] Uma origem externa não autorizada recebe `403` no preflight CORS.
- [ ] Login, criação de processo, edição própria, VGM e liberação foram testados com dados de teste.
- [ ] A tentativa de editar um processo de outro analista é rejeitada pelo servidor.
- [ ] Logs e alertas do Render não mostram erros recorrentes.

## Incidentes

Se houver vazamento ou suspeita de credencial: altere imediatamente `JWT_SECRET`, a senha do banco e as senhas afetadas; desative as contas envolvidas; revise o `audit_log`; e avalie comunicação/LGPD com o responsável da empresa.
