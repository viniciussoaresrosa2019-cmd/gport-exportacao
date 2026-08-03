# Relatório de homologação — GPORT

**Ambiente:** `https://gport-exportacao-hml.onrender.com/`  
**Data:** 03/08/2026  
**Escopo:** lançamento de processos, autenticação, permissões, VGM, Liberação, SSE, Dashboard e Notificações.  
**Dados usados:** somente exportador/processos com prefixo `QA-HML` e chaves aleatórias. Todos foram removidos ao final.

## Resultado executivo

Não foram encontradas falhas críticas ou altas nos fluxos automatizados cobertos. A homologação técnica está **aprovada condicionalmente** para promoção, sujeita às pendências de revisão visual em dispositivos reais e teste do perfil Financeiro.

## Matriz de testes executados

| Categoria | Cenário | Resultado esperado | Resultado obtido |
|---|---|---|---|
| Saúde | `GET /api/health` | 200 | Aprovado (200) |
| Sessão | Processos sem cookie | 401 | Aprovado (401) |
| Autenticação | Login Admin, Analista, VGM e Liberação | 200 | Aprovado (4/4) |
| Dashboard | Dashboard por perfil autenticado | 200 | Aprovado (4/4) |
| Notificações | Caixa por perfil autenticado | 200 | Aprovado (4/4) |
| Validação | Processo incompleto | 400 | Aprovado (400) |
| Lançamento | Processo válido | 201 | Aprovado (201) |
| Idempotência | Reenvio com mesma chave | Mesmo processo / 200 | Aprovado |
| Leitura | Analista vê processo compartilhado | 200 + visível | Aprovado |
| Concorrência | Segunda edição com versão antiga | 409, sem sobrescrever | Aprovado |
| VGM | Analista altera VGM | 403 | Aprovado |
| VGM | Perfil VGM altera status | 200 | Aprovado |
| Tempo real | SSE recebe alteração de VGM | Evento recebido | Aprovado |
| Liberação | Analista altera Liberação | 403 | Aprovado |
| Liberação | Perfil Liberação altera status | 200 | Aprovado |
| Notificação | VGM recebe e marca notificação como lida | 200 / 204 | Aprovado |
| CSRF | Exclusão sem token | 403 | Aprovado |
| Rede | Timeout do cliente + reenvio | Um único processo | Aprovado |
| Carga | Dez lançamentos de teste paralelos | 10/10 e sem duplicação | Aprovado em 10,18 s |
| Limpeza | Processos e exportador de teste | 204 | Aprovado |

## Métricas observadas

| Medida | Resultado | Limite da medição |
|---|---:|---|
| Página inicial HML | 200 em 0,336 s; 182.506 B | Medição isolada, sem cold start e sem navegador. |
| Health HML | 200 em 0,446 s; 15 B | Medição isolada, sem carga. |
| Carga de lançamentos | 10 em 10,18 s | Inclui rede, jobs e gravação remota; não é média individual. |
| Testes locais | 36/36 aprovados | Testes estruturais/integração local. |

O roteiro contém um timeout deliberado de 60 ms para validar recuperação de rede. O `curl: (28)` esperado nesse cenário não representa falha do sistema: o reenvio confirmou exatamente um processo.

## Falhas encontradas e correções

Nenhuma falha funcional bloqueante foi encontrada nesta rodada. O roteiro foi ampliado em `scripts/qa-process-launch-hml.ps1` para validar Dashboard, Notificações e a marcação de leitura após a atualização de VGM.

## Cobertura não concluída

- **Financeiro:** não foi fornecida conta de teste desse perfil; login, menu, dashboard e permissões específicas ainda precisam ser homologados.
- **Visual real:** não houve sessão de navegador autenticada em 320px, 375px, 414px, tablet, desktop, tema claro/escuro, zoom 200%, teclado e leitor de tela. A camada responsiva foi testada estruturalmente, mas requer validação humana.
- **Lighthouse/LCP/INP/CLS:** não executado com navegador; é necessário rodar em homologação autenticada e registrar o relatório.
- **Lembretes automáticos de prazo:** a base de notificações está ativa, mas a regra de destinatários, antecedência e prioridade não foi definida; nenhum lembrete programado foi ativado.

## Riscos residuais

| Severidade | Risco | Mitigação recomendada |
|---|---|---|
| Médio | Código principal ainda concentrado no `index.html`. | Extrair módulos gradualmente, mantendo os testes a cada etapa. |
| Médio | Não há evidência de teste visual/dispositivo real nesta rodada. | Executar checklist visual antes da produção. |
| Baixo | Métricas podem piorar no cold start do plano do Render. | Avaliar plano sem suspensão ou hospedagem interna. |
| Baixo | Política de lembretes de prazo não definida. | Definir destinatários, janela e severidade antes de automatizar. |

## Checklist para promover para produção

- [ ] Informar e homologar uma conta de teste Financeiro.
- [ ] Validar visualmente desktop, tablet e celular com login autenticado.
- [ ] Executar Lighthouse e registrar LCP, INP e CLS.
- [ ] Confirmar no Render que o deploy é o mesmo commit testado em HML.
- [ ] Confirmar backup do banco e variáveis de ambiente de produção.
- [ ] Fazer smoke test: health, login, criação/edição de processo de teste, VGM, Liberação, Dashboard, Notificação e logout.
- [ ] Promover sem misturar uploads manuais de versões diferentes.
