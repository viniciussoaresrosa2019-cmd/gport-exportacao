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
- Pipeline GitHub Actions criado para instalar dependências de forma reprodutível, executar testes, bloquear vulnerabilidades altas/críticas do `npm audit` e interromper a publicação quando um segredo aparente for encontrado no código.
- Checklist operacional de produção incluída em `docs/PRODUCTION_CHECKLIST.md`.

## Modelo de ameaças

| Ativo / entrada | Ameaça provável | Impacto | Proteção atual |
|---|---|---:|---|
| Contas e sessões | Roubo/reuso de sessão, força bruta | Alto | Cookie HttpOnly/SameSite, expiração de 4 horas, CSRF, limite de login e invalidação por `token_version`. |
| Processos, clientes e relatórios | Acesso ou alteração sem permissão | Alto | Autorização no servidor por cargo e por analista responsável; UUIDs e queries parametrizadas. |
| API e navegador | XSS, CSRF, CORS indevido, payload excessivo | Médio/alto | CSP, nonce de scripts, CORS restrito, CSRF, JSON de 256 KB e cabeçalhos defensivos. |
| Banco de dados | Injeção, exposição ou indisponibilidade | Alto | Queries parametrizadas, RLS/revogação para acesso direto e pool limitado. |
| Deploy e segredos | Chave no Git, configuração incorreta | Alto | `.gitignore`, `.env.example`, scanner no CI e variáveis do Render. |

## Resultado da validação local de 26/07/2026

- `npm test`: aprovado (10 testes).
- Scanner local de segredos: aprovado; nenhum segredo aparente nos arquivos de código.
- `npm audit`: não pôde ser concluído neste computador porque o acesso ao endpoint do registro npm está indisponível. O workflow do GitHub Actions executará a mesma verificação com rede e bloqueará vulnerabilidades altas/críticas.
- Não foram executados testes externos, destrutivos ou contra dados reais nesta validação.
- Os testes automatizados locais são testes de regressão de segurança do código. Testes de integração completos de login, CSRF e autorização entre dois usuários exigem um banco de homologação isolado, que não está configurado neste projeto e não foi criado automaticamente para evitar qualquer contato com dados reais.

## Achados priorizados

### Crítico

Nenhum achado crítico aberto no código revisado.

### Alto

- **Validação de certificado TLS do banco — `src/db.js` / Render.** Quando `ALLOW_UNVERIFIED_DATABASE_TLS=true`, existe risco de aceitar um certificado indevido em uma conexão comprometida. Correção definitiva: configurar `DB_SSL_CA` com a cadeia confiável do provedor ou usar conexão com certificado verificável. Validação: remover a exceção e confirmar que `/api/health` continua retornando `200`.
- **Privilégio da conta de banco — configuração do Supabase.** A API usa a URI administrativa fornecida pelo pooler; ela deve ficar somente no Render e nunca no navegador. Foi criado o plano [least-privilege-api-role.sql](database/plans/least-privilege-api-role.sql), mas ele não deve ser aplicado enquanto o aplicativo ainda executa DDL na inicialização.

### Médio

- **CSP com `style-src 'unsafe-inline'` — `src/server.js` e `public/index.html`.** O CSS principal foi movido para `public/assets/gport.css` e APIs/arquivos estáticos já não aceitam inline. A tela principal ainda contém estilos legados e geração de PDF com estilos embutidos; mantenha o risco residual até refatoração completa.
- **Redis não configurado — `src/server.js`.** O rate limit agora pode usar Redis REST distribuído quando `RATE_LIMIT_REDIS_REST_URL` e `RATE_LIMIT_REDIS_REST_TOKEN` forem definidos. Sem isso, há fallback em memória, adequado somente a uma instância.

### Baixo

- **Código de compatibilidade legado na interface — `public/index.html`.** Há trechos antigos de armazenamento local que não inicializam mais a sessão de produção, mas tornam a manutenção mais difícil. A API já rejeita cadastro público e não aceita sessão local. Recomenda-se uma refatoração dedicada antes de grandes novas funcionalidades.
- **Recuperação por e-mail e MFA ausentes — fluxo de autenticação.** O administrador redefine senhas; MFA exige escolher e configurar um provedor de identidade ou e-mail.

## Riscos que permanecem

- A interface ainda possui estilos inline e a capa PDF é gerada dinamicamente; por compatibilidade, a CSP da página principal mantém `style-src 'unsafe-inline'` temporariamente. Scripts inline recebem nonce.
- **Alto:** quando `ALLOW_UNVERIFIED_DATABASE_TLS=true` é usado com o pooler gratuito, o tráfego ao banco continua criptografado, mas a identidade do certificado não é validada. Esta exceção deve ser temporária e impede a classificação de “pronto para produção” para dados críticos. Para evitar perda de quebras de linha no painel, o projeto também aceita `DB_SSL_CA_BASE64`.
- Sem Redis configurado, o rate limit é mantido em memória. Em várias instâncias Render, configure as duas variáveis Redis ou use um gateway/WAF.
- Não existe recuperação de senha por e-mail ou MFA. Para uma equipe interna pequena, o administrador pode redefinir senhas; MFA requer decisão de provedor de identidade/e-mail.
- Não há upload de arquivos no projeto atual. Se for adicionado, implemente antivírus, limite de tipo/tamanho e armazenamento fora do servidor.
- Backups, monitoramento e acesso administrativo do Supabase/Render dependem da configuração operacional da empresa.
- Regra de leitura adotada: `admin`, `vgm`, `financeiro` e `liberacao` leem todos os processos; `analyst` recebe somente os próprios processos e seus históricos. Clientes continuam visíveis aos autenticados porque são necessários no lançamento.
- Esta revisão combina análise de código, configuração e testes locais; ela não substitui um pentest independente nem garante ausência de vulnerabilidades desconhecidas.

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
- [ ] Se houver várias instâncias, configurar Redis REST nas variáveis do Render e validar o rate limit.
- [ ] Ler [BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md) e atribuir responsável pela rotina.
- [ ] Para MFA e recuperação corporativa, concluir o registro Microsoft Entra conforme [ENTRA_ID_SETUP.md](docs/ENTRA_ID_SETUP.md).
- [ ] Restringir acesso ao painel Supabase/Render e ativar MFA nas contas administrativas.
- [ ] Reexecutar `npm audit --omit=dev` em rede com acesso ao npm.
- [ ] Fazer pentest independente antes de lidar com pagamentos, dados pessoais sensíveis ou acesso externo amplo.

## LGPD

Os dados de usuários, clientes e processos devem ser acessados somente por pessoas autorizadas. Defina prazo de retenção, procedimento de exclusão/anonimização, política de backup, registros de acesso e responsável pelo tratamento de dados.
