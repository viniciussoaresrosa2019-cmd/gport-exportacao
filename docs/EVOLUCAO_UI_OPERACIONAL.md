# Evolução operacional, UX e qualidade — GPORT

## Diagnóstico inicial

| Área | Evidência | Risco/prioridade | Tratamento aplicado |
|---|---|---|---|
| Interface | `public/index.html` concentra HTML e comportamento de gerações diferentes. | Alto para manutenção/regressão | A camada nova foi isolada em `assets/experience.css` e `assets/experience.js`; o legado permanece até a substituição ser coberta por testes de fluxo. |
| Formulário | Lançamento longo, com pouca indicação de estado em tela pequena. | Alto para erro operacional | Seções visuais, progresso, indicação de edição/salvamento e preservação do mecanismo existente de autosave na edição. |
| Celular | Tabelas operacionais têm largura mínima e exigiam rolagem lateral. | Alto para usabilidade | As tabelas principais passam a cartões responsivos em até 640px e há navegação móvel fixa em até 850px. |
| Carregamento | A lista era esvaziada durante o carregamento. | Médio | Skeleton acessível, sem alterar a paginação e filtros existentes. |
| Dashboard | Não havia um painel operacional por função. | Médio | Endpoint resumido (`/api/dashboard`) e painel por perfil sem carregar todos os processos. |
| Notificações | Não havia caixa interna persistente. | Médio | Notificações por usuário, deduplicadas, com leitura e atualização motivada pelo SSE já existente. |
| Mensagens | Ainda existiam chamadas legadas a `alert()`/`confirm()`. | Médio | `alert()` passa a toast compatível e exclusões ativas passam a confirmação visual interna. Restos legados não são removidos até a migração completa. |

## Alterações desta fase

### Interface e acessibilidade

- `public/assets/experience.css`: estilos progressivos para formulário, skeleton, cartões móveis, painel, notificações, temas claro/escuro e preferência de movimento reduzido.
- `public/assets/experience.js`: rotulagem acessível de tabelas móveis, navegação móvel, seções do formulário, estado visual de salvamento, painel e caixa de notificações.
- `public/index.html`: carregamento dos novos ativos, confirmação interna, skeleton, compatibilidade de `alert()` com toast e evento da atualização SSE.

### Dados e API

- `GET /api/dashboard`: retorna indicadores e no máximo seis processos recentes; não substitui nem amplia o acesso já permitido aos processos.
- `GET /api/notifications` e `PATCH /api/notifications/:id/read`: caixa por usuário autenticado.
- `user_notifications`: tabela aditiva criada na inicialização com chave única de deduplicação por usuário.
- Atualizações de processo, VGM e liberação alimentam notificações sem bloquear o salvamento se a notificação falhar.

### Decisões de produto adotadas

- Administrador recebe atualizações gerais; VGM recebe pendências/atualizações de VGM; Liberação recebe atualizações de liberação; Analista recebe atualizações operacionais. As telas continuam seguindo a regra já aprovada: usuários autenticados podem ver e editar processos.
- O dashboard mostra métricas mais relevantes por perfil, mas não impõe uma nova restrição de acesso.

## Medições locais

Estas métricas são de arquivos e testes estáticos; não substituem RUM/Lighthouse em homologação.

| Medida | Antes | Depois | Observação |
|---|---:|---:|---|
| `index.html` | 179.966 B | 182.482 B | Crescimento pequeno para marcação de confirmação e SSE; comportamentos novos foram movidos para arquivo cacheável. |
| CSS de experiência cacheável | 0 B | 9.529 B | Carregado uma vez e reutilizado pelo cache estático de 1 dia. |
| JS de experiência cacheável | 0 B | 12.262 B | Código separado do HTML para facilitar evolução e CSP futura. |
| Consulta de dashboard | inexistente | máx. 6 processos recentes | Evita buscar a paginação inteira para o painel. |
| Testes automatizados | 34 | 36 | Todos aprovados localmente. |

## Matriz de validação executada localmente

| Categoria | Cenário | Resultado |
|---|---|---|
| Sintaxe | `node --check` no servidor e nos novos scripts | Aprovado |
| Segurança | segredo aparente, auditoria de dependências de produção | Aprovado: 0 vulnerabilidades reportadas |
| Regressão | autenticação, CSRF, permissões, clientes, lançamento idempotente, VGM, liberação, SSE | Aprovado pelos 36 testes estruturais |
| UX | confirmação interna, toasts, skeleton, formulário em seções, tabelas móveis | Coberto por testes estáticos; requer inspeção humana em homologação |
| API | dashboard e notificações autenticadas, deduplicação de notificação | Coberto por teste estrutural; requer chamada em homologação após migração |

## Revisão visual obrigatória em homologação

1. Abrir o lançamento em 320px, 375px, 414px, tablet e desktop; confirmar leitura dos cartões, tabulação e botões.
2. Alternar tema claro/escuro e verificar contraste de painel, notificação e formulário.
3. Criar, editar e excluir somente processo de teste; verificar confirmação e toast.
4. Entrar com VGM e Liberação em duas sessões; alterar status e confirmar atualização sem recarga completa.
5. Abrir o painel inicial, a caixa de notificações, marcar uma notificação como lida e abrir o processo relacionado.

## Publicação segura

1. Enviar os arquivos alterados para a ramificação de homologação no GitHub.
2. Confirmar que o deploy de homologação iniciou sem erro e que a migração aditiva criou `user_notifications`.
3. Executar a revisão visual acima e `npm run security:check` no código publicado.
4. Somente então promover o mesmo commit para produção; não copie arquivos manualmente de versões diferentes.
5. Depois do deploy, testar `/api/health`, login, criação/edição de um processo de teste, dashboard e logout.

## Riscos residuais e backlog

### Médio

- O `index.html` ainda concentra fluxos legados e atuais. A remoção precisa ser feita em uma fase posterior, por partes, com testes de navegador; não foi removido automaticamente para preservar os fluxos já usados.
- Notificações de prazo são uma evolução seguinte: a base persistente está pronta, mas a frequência e os destinatários de lembretes automáticos precisam de regra operacional formal para evitar alertas excessivos.

### Baixo

- As métricas atuais são locais/estáticas. Antes da produção, registrar LCP/INP/CLS e tempo de login na homologação com DevTools ou Lighthouse.
- Integrações futuras com portos exigem API oficial, contrato, credenciais em ambiente e revisão de privacidade/LGPD; nenhum acesso externo foi implementado.

### Backlog priorizado

| Ideia | Impacto | Esforço |
|---|---|---|
| Extrair gradualmente o script principal de `index.html` para módulos por área | Alto | Alto |
| Alertas programados de prazo com configuração de destinatários | Alto | Médio |
| Histórico visual completo de antes/depois na interface (a auditoria já guarda mudanças) | Alto | Médio |
| Modelos de capa configuráveis por exportador | Médio | Médio |
| Integrações oficiais de terminais/portos por API autorizada | Alto | Alto |

## Fase seguinte — lançamento guiado e carregamento imediato

Esta fase preserva os mesmos campos, rotas e regras de validação já usadas
pela API. Nenhuma tabela, permissão ou processo existente foi removido.

- O formulário agora reorganiza os campos existentes em seis etapas reais:
  Processo, Exportador, Rota, Documentos, Carga e Revisão. A opção **Modo
  rápido** deixa todas as etapas visíveis para usuários experientes.
- O avanço de etapa valida somente os campos daquela seção, move o foco para
  o primeiro campo inválido e atualiza a contagem de pendências.
- Um rascunho local é salvo apenas para lançamentos novos, no navegador do
  usuário. Ele não é enviado à API, pode ser restaurado ou descartado e é
  removido após o primeiro salvamento bem-sucedido.
- O login e a restauração de sessão agora fecham a tela de autenticação e
  mostram o skeleton imediatamente. A lista e as referências são carregadas
  em segundo plano; uma falha pontual não invalida a sessão recém-criada.
- A busca de Processos é preservada durante a sessão do navegador. Ela é
  removida por **Limpar** ou ao encerrar a sessão do navegador.
- Follow up ganhou a ação **Ver histórico**, que mostra a linha do tempo da
  auditoria no próprio sistema; o PDF continua disponível.

### Métricas desta fase

| Medida | Base anterior | Após esta fase | Interpretação |
|---|---:|---:|---|
| `index.html` | 182.506 B (medição HML) | 185.633 B local | Ainda é o principal gargalo de manutenção; esta fase não pretendeu uma extração grande e irreversível. |
| `experience.js` cacheável | 12.262 B | 20.111 B | A lógica nova fica em arquivo cacheável, não em código adicional de tela. |
| `experience.css` cacheável | 9.529 B | 12.609 B | Estilos de etapas, rascunho e histórico, reutilizados pelo cache. |
| Testes automatizados | 37 | 39 | Todos aprovados localmente. |
| `npm audit --omit=dev` | 0 vulnerabilidades | 0 vulnerabilidades | Resultado local em 03/08/2026. |

### Itens que exigem decisão operacional antes de implementar

1. **Antiduplicação entre duas abas ou dois usuários:** a API já é idempotente
   para reenvio da mesma chave. Bloquear dois lançamentos intencionalmente
   iguais exigiria definir a chave de unicidade de negócio (por exemplo,
   exportador + booking + fatura), pois alguns fluxos podem admitir registros
   semelhantes.
2. **Lembretes de prazo:** antecedência, destinatários, janela de silêncio e
   prioridade devem ser definidos antes de criar notificações automáticas.
3. **Alertas externos e monitoramento:** Render/Supabase/Sentry ou serviço
   equivalente exigem uma conta/configuração externa e responsável pelos
   alertas.

## Fase seguinte — lembretes de prazo e auditoria legível

- A central de notificações agora cria lembretes persistentes de deadline ao
  ser aberta: **vencido**, **em 24 horas** e **em 48 horas**. A regra segue o
  perfil: Administrador vê os processos aplicáveis; Analista recebe os seus;
  VGM recebe pendências de VGM; Liberação recebe pendências de liberação.
- A chave de deduplicação inclui processo, estágio e data do prazo. Assim o
  mesmo alerta é reaberto somente quando há uma mudança relevante de prazo,
  sem multiplicar cartões a cada atualização da página.
- A variável não sensível `DEADLINE_NOTIFICATIONS_ENABLED=true` permite pausar
  essa geração sem publicar código. Para avisar pessoas que estejam
  desconectadas, ainda será necessário decidir e configurar um agendador
  externo (por exemplo, Render Cron); não há envio de e-mail implementado.
- O histórico visual de edição passou a mostrar até cinco campos com valor
  anterior e novo. O conteúdo continua renderizado por `textContent`, sem
  interpretar valores do banco como HTML.

### Limitação conhecida

O botão **Desfazer exclusão** não foi adicionado: processos usam exclusão
definitiva no fluxo atual. Torná-la reversível exige mudar a regra para
exclusão lógica, migração e política de retenção; isso é uma decisão de
negócio e não será ativado silenciosamente.
