# Relatório de segurança — GPORT

Data da revisão: 26/07/2026.

## Correções implementadas

- Cadastro público bloqueado; somente administradores criam usuários.
- Senhas com bcrypt (custo 12), mínimo de 12 caracteres com letras e números.
- Sessão migrada de `localStorage` para cookie `HttpOnly`, `SameSite=Strict`, `Secure` em produção e validade de 4 horas.
- Proteção CSRF para toda alteração autenticada, usando token vinculado à sessão.
- Tokens são invalidados quando uma senha é redefinida por meio de `token_version`.
- Limite para tentativas de login e para operações de escrita da API.
- Validação e limites de tamanho para usuários, clientes, processos, datas, números, UUIDs e detalhes de contêiner.
- Permissões no servidor: processos/clientes apenas Analista ou Administrador; VGM e Liberação permanecem por função; usuário comum não administra contas.
- CORS restrito por `CORS_ORIGIN`, payload JSON limitado a 256 KB, cabeçalhos de segurança e CSP com nonce para scripts.
- Logs de erro não armazenam corpo, senha, token ou stack trace do banco.
- Conexão remota com PostgreSQL exige certificado TLS válido.

## Riscos que permanecem

- A interface ainda possui estilos inline, por isso `style-src 'unsafe-inline'` permanece temporariamente. Scripts inline foram protegidos com nonce.
- Quando `ALLOW_UNVERIFIED_DATABASE_TLS=true` é usado com o pooler gratuito, o tráfego ao banco continua criptografado, mas a identidade do certificado não é validada. Esta exceção deve ser temporária.
- Rate limit é mantido em memória. Em várias instâncias Render, use Redis ou um gateway/WAF para limite distribuído.
- Não existe recuperação de senha por e-mail ou MFA. Para uma equipe interna pequena, o administrador pode redefinir senhas; MFA requer decisão de provedor de identidade/e-mail.
- Não há upload de arquivos no projeto atual. Se for adicionado, implemente antivírus, limite de tipo/tamanho e armazenamento fora do servidor.
- Backups, monitoramento e acesso administrativo do Supabase/Render dependem da configuração operacional da empresa.

## Checklist antes de produção

- [ ] Executar `database/migrations/2026-07-26-session-security.sql` no Supabase.
- [ ] Configurar `NODE_ENV=production` no Render.
- [ ] Definir `CORS_ORIGIN` como a URL HTTPS exata da aplicação.
- [ ] Usar `JWT_SECRET` aleatório com pelo menos 32 caracteres e não reutilizá-lo.
- [ ] Remover qualquer variável `DB_SSL_REJECT_UNAUTHORIZED=false` do Render.
- [ ] Quando o pooler apresentar certificado autoassinado, configurar `DB_SSL_CA` com o certificado raiz PEM do Supabase.
- [ ] Remover `ALLOW_UNVERIFIED_DATABASE_TLS=true` assim que houver conexão com certificado verificável.
- [ ] Confirmar que `.env` não foi enviado ao GitHub.
- [ ] Configurar backups do banco, retenção e teste de restauração.
- [ ] Restringir acesso ao painel Supabase/Render e ativar MFA nas contas administrativas.
- [ ] Reexecutar `npm audit --omit=dev` em rede com acesso ao npm.
- [ ] Fazer pentest independente antes de lidar com pagamentos, dados pessoais sensíveis ou acesso externo amplo.

## LGPD

Os dados de usuários, clientes e processos devem ser acessados somente por pessoas autorizadas. Defina prazo de retenção, procedimento de exclusão/anonimização, política de backup, registros de acesso e responsável pelo tratamento de dados.
