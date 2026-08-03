# Evolução profissional do GPORT — fase atual

Data: 03/08/2026. Escopo: código local preparado para homologação. Produção
não foi alterada por esta fase.

## Diagnóstico priorizado

| Prioridade | Constatação | Situação nesta fase |
|---|---|---|
| Alta | `index.html` permanece grande e concentra fluxos legados | Mitigado progressivamente: comportamentos novos estão em assets cacheáveis. Extração completa continua planejada e não deve ser feita de uma vez. |
| Alta | Lançamento longo aumenta risco de erro e perda de preenchimento | Corrigido: fluxo guiado, validação por etapa, modo rápido e rascunho local. |
| Média | Login podia parecer parado enquanto referências eram buscadas | Corrigido: skeleton imediato e lista prioritária; referências são carregadas em segundo plano. |
| Média | Dashboard e notificações podiam carregar informação excessiva ou não destacar prioridades | Corrigido: resumo enxuto por perfil, notificações persistentes e lembretes de deadline deduplicados. |
| Média | Auditoria existia, mas a leitura de alterações não deixava claro o antes/depois | Corrigido: histórico visual exibe até cinco alterações com valor anterior e novo. |
| Média | Exclusões não têm restauração segura | Pendente de decisão: o fluxo atual exclui processos definitivamente; "desfazer" precisa de exclusão lógica, retenção e migração. |
| Baixa | Métricas de experiência de navegador ainda não foram capturadas após este código | Pendente de medição autenticada em HML com DevTools/Lighthouse. |

## Alterações aplicadas

### Formulário e prevenção de perda de dados

- Seis etapas: Processo, Exportador, Rota, Documentos, Carga e Revisão.
- Barra de progresso, erros pendentes, validação da etapa atual e foco no
  primeiro campo inválido.
- Modo rápido, para tornar todas as etapas visíveis sem desativar validações.
- Rascunho local somente para novo processo, restaurável e descartável. Não
  envia informações ao servidor e é apagado após o primeiro salvamento válido.
- Proteção já existente de idempotência da API permanece ativa para reenvio,
  timeout e clique repetido.

### Carregamento e listas

- Skeleton é mostrado após login/restauração de sessão antes de referências
  auxiliares; processos e indicadores têm prioridade.
- Cache de referências evita buscar clientes/usuários repetidamente durante
  paginação e filtros.
- Pesquisa de Processos é preservada apenas durante a sessão do navegador.
- Dashboard usa resumo e apenas seis processos recentes em vez de carregar a
  lista inteira.

### Operação, notificações e histórico

- Dashboard adequa os indicadores aos perfis Administrador, Analista, VGM e
  Liberação. Financeiro e Prazos permanecem ocultos de forma reversível, como
  definido para esta operação.
- Notificações de mudanças em processo, VGM e Liberação permanecem persistentes.
- Lembretes de deadline são criados ao abrir as notificações para vencidos,
  24h e 48h. A deduplicação usa processo, estágio e data. A variável
  `DEADLINE_NOTIFICATIONS_ENABLED` permite desligar essa função.
- Follow up permite abrir o histórico sem sair da lista e apresenta autor,
  data/hora, ação e alterações antes/depois quando disponíveis na auditoria.

### Interface, acessibilidade e segurança preservada

- Estados de skeleton, vazio, toast e confirmação seguem o mesmo conjunto de
  componentes; ações irreversíveis continuam pedindo confirmação.
- Toasts mantêm `aria-live`; o formulário orienta o foco para erros e os
  estilos respeitam redução de movimento e tema claro/escuro.
- Autenticação, cookie HttpOnly, CSRF, rate limit, permissões por papel, SSE,
  paginação, auditoria e validação no servidor não foram relaxados.

## Arquivos desta fase

- `public/assets/experience.js` — fluxo guiado, rascunho, dashboard,
  notificações e cartões móveis.
- `public/assets/experience.css` — estilos responsivos das novas experiências.
- `public/index.html` — integração progressiva, skeleton, filtros de sessão,
  histórico e navegação operacional.
- `src/server.js` — dashboard, notificações, lembretes de prazo e auditoria.
- `.env.example` — `DEADLINE_NOTIFICATIONS_ENABLED` documentada.
- `tests/application.test.mjs` — regressões de lançamento, filtros,
  notificações e histórico.
- `docs/EVOLUCAO_UI_OPERACIONAL.md` e este documento — manutenção e limites.

## Medições reais disponíveis

| Medida | Resultado |
|---|---:|
| Página inicial HML sem autenticação (medição passiva anterior) | 185.886 B, 1,14 s |
| Health HML sem autenticação (medição passiva anterior) | 15 B, 1,56 s |
| `index.html` local após esta fase | 186.904 B |
| `experience.js` cacheável | 20.111 B |
| `experience.css` cacheável | 12.609 B |
| Testes automatizados locais | 42 aprovados, 0 falhas |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilidades reportadas |
| Verificação de segredos | nenhum segredo aparente nos arquivos analisados |

Após publicar em HML, execute `powershell -ExecutionPolicy Bypass -File
.\scripts\measure-homologation.ps1`. O roteiro é passivo: mede a página,
health check e assets sem login, cookie ou alteração de dados. Execute-o antes
e depois de qualquer ajuste de infraestrutura para registrar a diferença.

LCP, INP, CLS, CPU, RAM e latências autenticadas não foram inventados: devem
ser medidos no navegador contra HML depois da publicação deste commit.

## Matriz de testes executados localmente

| Categoria | Cenários cobertos | Resultado |
|---|---|---|
| Processo | criação válida/inválida, idempotência, edição e campos obrigatórios | Aprovado |
| Regras especiais | RUC manual, Apenas DU-E, formatação, porto de origem | Aprovado |
| Acesso | autenticação, CSRF, perfis, VGM, Liberação e processos compartilhados | Aprovado |
| Dados | clientes, referências indisponíveis, paginação, filtros e ordenação | Aprovado |
| Tempo real | SSE e atualização autorizada | Aprovado estruturalmente |
| UX | etapas, modo rápido, rascunho, skeleton, cards, toast e confirmação | Aprovado estruturalmente |
| Alertas | dashboard, notificações, deduplicação de prazo e leitura | Aprovado estruturalmente |
| Segurança | segredo aparente e dependências de produção | Aprovado |

## Homologação autenticada obrigatória

Antes de produção, com as quatro contas de teste autorizadas:

1. Criar um processo de teste pelo Administrador, preencher etapas, atualizar a
   página antes do envio e confirmar restauração do rascunho.
2. Salvar, editar, abrir em outra sessão e confirmar atualização pela conexão
   em tempo real; confirmar que não há duplicação após clique duplo.
3. Acessar VGM e Liberação com seus perfis e validar que cada um só altera sua
   respectiva área.
4. Criar um deadline vencido, em 24h e em 48h somente com dados de teste;
   abrir notificações e confirmar uma notificação por estágio/processo,
   marcação como lida e abertura do processo correto.
5. Revisar 320px, 375px, 414px, tablet e desktop; tema claro/escuro, teclado e
   zoom de 200%.
6. Executar Lighthouse autenticado/manual e registrar LCP, INP, CLS, requests
   e payload. Repetir depois do primeiro acesso para separar cold start do
   tempo normal.

## Itens dependentes de decisão ou infraestrutura

| Item | Motivo | Próximo passo seguro |
|---|---|---|
| Eliminar cold start | Depende do plano do Render ou do servidor interno | Escolher instância sem adormecimento ou hospedar internamente; manter health check e monitoramento. |
| Alertas para usuário desconectado | A rotina atual ocorre quando a central é aberta | Definir e configurar Render Cron/serviço de e-mail/push, responsável e janela de silêncio. |
| Desfazer exclusão | Exige exclusão lógica e retenção de dados | Definir prazo de retenção e quem pode restaurar antes da migração. |
| Antiduplicação entre usuários | Necessita chave de negócio inequívoca | Definir se `exportador + booking + fatura` pode bloquear um novo lançamento legítimo. |
| Monitoramento externo | Requer conta/provedor e destino de alerta | Configurar Render/Supabase e, se aprovado, Sentry ou equivalente sem dados sensíveis. |
| Modelos de capa por exportador e integrações portuárias | São novas regras/integrações externas | Projetar por contrato de API oficial e credenciais autorizadas. |

## Observabilidade preparada nesta fase

O endpoint administrativo `GET /api/observability/metrics` expõe apenas dados
agregados da instância atual: rota normalizada, quantidade de chamadas,
quantidade de respostas 500, lentas, média e máximo de duração. Ele não expõe
usuários, corpos de requisição, cookies, tokens ou parâmetros. A variável
`OBSERVABILITY_SLOW_REQUEST_MS` define a partir de quantos milissegundos uma
requisição é considerada lenta (padrão: 1000).

Para transformar métricas em alerta real, um administrador deve escolher um
coletor autorizado. Sugestão operacional: monitorar `/api/health` externamente
e consultar este endpoint com uma sessão administrativa somente em rede segura;
configurar alertas para indisponibilidade, erro 500 e tendência de latência.
CPU, memória e conexões devem ser acompanhadas no painel do Render/Supabase,
pois a instância não deve expor esse tipo de informação em rota pública.

## Checklist para promover HML para produção

- [ ] Fazer backup lógico do banco e registrar ponto de reversão.
- [ ] Enviar **todos** os arquivos listados nesta fase para a mesma branch de HML.
- [ ] Confirmar deploy saudável e `GET /api/health` com 200.
- [ ] Executar a homologação autenticada acima e registrar evidências.
- [ ] Confirmar `DEADLINE_NOTIFICATIONS_ENABLED=true` somente se os alertas foram aprovados.
- [ ] Validar variáveis de banco, JWT, CORS, Turnstile e Redis sem expor valores.
- [ ] Conferir logs: sem erro 500, sem segredo e sem falha de migração.
- [ ] Promover exatamente o commit homologado, com plano de rollback para o
      último deploy saudável.

## Riscos residuais

- A modularização é progressiva: `index.html` ainda é maior do que o ideal e
  necessita de extração por domínio com testes de navegador, não uma remoção
  massiva de código legado.
- Não houve inspeção visual autenticada nem Lighthouse após esta alteração; os
  resultados locais comprovam regressão estrutural, não substituem a revisão
  humana em HML.
- Não existe ainda agendamento de alertas para usuários offline nem desfazer
  exclusão; ambos dependem das decisões listadas acima.
- Nenhuma revisão pode garantir que o sistema esteja livre de falhas. Antes de
  dados sensíveis em larga escala, mantenha backups testados, monitoramento e
  avaliação independente periódica.
