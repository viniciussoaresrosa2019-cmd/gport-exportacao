# Evolução GPORT — linha de base e reversão

Data da linha de base: 03/08/2026.  Esta evolução deve ser validada primeiro no ambiente de homologação. Nenhuma alteração desta etapa é publicada automaticamente.

## Estado identificado

- Aplicação Node.js/Express com PostgreSQL/Supabase.
- Interface estática concentrada em `public/index.html` e servida por `src/server.js`.
- A API já possui autenticação por sessão, CSRF, rate limit, paginação de processos, auditoria e atualização por SSE.
- A interface contém uma camada legada e uma camada atual sobrepostas no mesmo `index.html`; por isso, a substituição será incremental e testada a cada fase.

## Artefatos críticos e hashes antes da refatoração

| Arquivo | SHA-256 |
|---|---|
| `public/index.html` | `257EC6965638DF0E937D4B85AB968403883F8D194842C6EB6F6A0FC562534D02` |
| `public/assets/gport.css` | `3AFD849F9C2F0B8AEC3A944E69FCE51AC5AF2C38F8591E83EF30E48B156D5FD5` |
| `public/assets/toasts.css` | `20293A867A6F18E3BFB5BE8E660603A2061FE19A85C15B619E96C84E2DB5ACAF` |
| `src/server.js` | `6E4B5A2DCC34C6EB55BC4DA477BAE00DC0C273CBA3A3973DF956D083EDB90BEB` |

## Reversão segura

1. Validar cada fase em homologação, com contas e processos de teste.
2. Manter uma cópia do commit/arquivos usados na publicação anterior no repositório GitHub antes de enviar a fase seguinte. O diretório local atual não contém um repositório Git válido (a pasta `.git` não possui `HEAD`), portanto ele não deve ser usado como única cópia de segurança.
3. Se uma fase causar regressão, republicar o commit anterior conhecido no Render ou restaurar somente os arquivos dessa fase, nunca o banco de produção.
4. Migrações de banco futuras devem ser aditivas, com `IF NOT EXISTS`, e acompanhadas de procedimento de reversão separado.

## Fases previstas e estado

1. Base visual, componentes reutilizáveis, estados de carregamento, confirmação e acessibilidade.
2. Formulário de processo organizado por seções, preservação de rascunho local e proteção de envio duplicado.
3. Dashboard por perfil, notificações internas e histórico visual — envolve novas estruturas de dados e será documentado/testado antes de ativação.
4. Revisão de performance, responsividade, testes e guia de publicação — extração dos scripts e dos estilos inline concluída; desacoplamento da camada legada permanece gradual.

## Riscos conhecidos antes do início

- A camada `public/assets/legacy-ui.js` ainda compartilha funções e estado com `app-runtime.js`; sua remoção integral continua sendo de alto risco e exige testes reais de navegador por fluxo.
- Os arquivos antigos `public/assets/app.js`, `public/assets/app.css` e `public/assets/api-client.js` foram removidos após busca de referências no HTML, servidor, scripts, testes e documentação. Eles não eram carregados pela aplicação.
- As tabelas de Processos, VGM e Liberação usam rolagem horizontal em telas pequenas; a solução será progressiva para não perder campos operacionais.
