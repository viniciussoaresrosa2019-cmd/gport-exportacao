# QA — Lançamento de Processos

Data da revisão local: 02/08/2026. Escopo: código e testes automatizados locais. Nenhum dado publicado foi consultado, criado, alterado ou excluído.

## Regras mapeadas

| Item | Regra validada no servidor |
|---|---|
| Acesso | Usuário autenticado pode criar, editar, visualizar e excluir processos, conforme a regra atual aprovada. |
| Campos gerais | Booking, exportador, fatura, navio e demais dados obrigatórios são validados pelo servidor. Campos com apenas `.` ou `*` são rejeitados. |
| Contêiner FCL | Quantidade, tipo e dados individuais obrigatórios; número segue `AAAA9999999`; tara e lacre são obrigatórios. Nota fiscal é opcional. |
| LCL | Não exige dados de contêiner. |
| MAPA | Exige novo lacre em cada contêiner. |
| RUC manual | Dispensa DU-E somente para exportador marcado. |
| Apenas DU-E | Reduz corretamente o conjunto obrigatório ao fluxo aprovado. |
| Integridade | Edição usa `updated_at` e rejeita conflito com `409`; novo lançamento usa chave de idempotência. |
| Auditoria | Criação, edição, VGM, liberação, follow-up e exclusão são registrados. |

## Matriz de testes

| Categoria | Cenário | Prioridade | Resultado local |
|---|---|---:|---|
| Criação | FCL válido com todos os campos | Alta | Coberto por validação de servidor e regressão estrutural. |
| Criação | LCL, MAPA, RUC manual e Apenas DU-E | Alta | Coberto por testes de regressão. |
| Validação | Vazio, espaço, `.` ou `*` em campo obrigatório | Alta | Aprovado na validação de servidor. |
| Validação | Contêiner fora de `AAAA9999999` | Alta | Aprovado na validação de servidor. |
| Concorrência | Edição com versão antiga | Alta | API responde `409`; requer confirmação em homologação. |
| Concorrência | Clique duplo, retry e timeout após envio | Alta | Chave de idempotência adicionada; requer confirmação em homologação. |
| Segurança | Sem sessão, CSRF, payload acima de 256 KB, CORS | Alta | Coberto pela suíte existente. |
| Segurança | Injeção e XSS | Média | Queries são parametrizadas e interface escapa valores; requer teste ativo em homologação. |
| Interface | Desktop, celular, teclado, leitor de tela, zoom | Média | Não executado: requer navegador e ambiente de homologação. |
| Desempenho | Latência, usuários simultâneos, CPU/RAM e banco | Média | Não executado: requer métricas e ambiente de homologação. |

## Achados

### Alto — requer validação antes da publicação

1. **Sem ambiente de homologação separado informado.** Não é seguro executar concorrência, perda de conexão, duplicação e exclusão no site publicado. Crie uma instância Render e um projeto Supabase dedicados a teste, com contas e dados fictícios.

2. **Duplicidade por reenvio:** corrigida no código com `idempotency_key`. A migração deve ser aplicada antes do deploy e validada com duas abas ou uma repetição de requisição no ambiente de homologação.

### Médio

1. **Migrações são executadas na inicialização** em `src/server.js`. Em banco maior, DDL no startup pode atrasar deploy ou bloquear temporariamente tabelas. Recomenda-se executar as migrações versionadas pelo pipeline antes de iniciar a aplicação e retirar a rotina automática após uma migração planejada.

2. **Auditoria de processo excluído:** a exclusão é registrada, mas as consultas de histórico fazem `JOIN processes`; após a exclusão, o evento pode não aparecer na tela de histórico. Não afeta a exclusão em si, mas reduz a rastreabilidade. Corrigir exige decisão de retenção/auditoria (soft delete ou histórico independente).

### Baixo

1. O `status` geral aceita qualquer texto dentro do limite, pois não há lista formal de estados permitidos. Definir uma enumeração alteraria a regra de negócio e deve ser aprovado antes.

2. Os testes atuais são principalmente de regressão de código. Testes HTTP, banco e navegador reais ainda precisam de um ambiente isolado.

## Teste em homologação obrigatório

1. Criar dois usuários de teste e um exportador `QA TESTE`.
2. Criar FCL válido em uma aba e, antes da resposta, reenviar na mesma aba e em uma segunda aba. Esperado: somente um processo.
3. Abrir o mesmo processo em duas sessões; salvar na primeira e tentar salvar na segunda. Esperado: a segunda recebe conflito e não sobrescreve dados.
4. Bloquear temporariamente a rede logo após clicar em salvar, restaurar e reenviar. Esperado: um único processo.
5. Testar FCL, LCL, MAPA, RUC manual e Apenas DU-E.
6. Verificar listagem, filtros, VGM, liberação, follow-up, capa e auditoria após cada cenário.
7. Medir tempo de `POST /api/processes`, consultas, memória do Render e erros do banco.

## Critério para publicar

- [ ] `npm test` e `npm run security:check` aprovados.
- [ ] Migração `2026-08-02-process-idempotency.sql` aplicada em homologação e produção.
- [ ] Cenários de concorrência e recuperação de rede aprovados em homologação.
- [ ] Não há erro recorrente no Render nem no Supabase.
- [ ] O responsável aprova a decisão sobre auditoria de exclusão e migrações no startup.

Esta revisão não declara o recurso livre de falhas. Um teste independente em homologação e um pentest autorizado continuam recomendados antes de dados reais em escala.
