# Desempenho da homologação — 23/10/2026

## Alterações

- Pesquisa e total de resultados usam a mesma consulta PostgreSQL, com `COUNT(*) OVER()`. A contagem separada permanece apenas para páginas além do fim. Filtros, paginação e separação de Apenas DU-E são preservados.
- Edição carrega processo anterior e regras atuais do exportador em uma consulta. Validação, auditoria e detecção de versão antiga permanecem obrigatórias.
- `/api/me` reutiliza o usuário que a autenticação acabou de ler do banco, sem armazenar permissões em cache entre requisições.
- Conexões ociosas do pool são reutilizadas por 60 segundos (antes, 20), mantendo o limite de cinco conexões.
- Buscas canceladas não geram novas tentativas nem mensagens falsas de falha de conexão. GETs com falhas transitórias continuam tendo retry; gravações nunca são reenviadas automaticamente pelo cliente HTTP.
- O contador da agenda não consulta novamente a cada pesquisa/paginação dentro de um minuto. Mutações da agenda forçam atualização e sessões diferentes não compartilham resultados.
- O formulário não repete uma gravação já confirmada pelo autosave quando os dados permanecem iguais. Uma alteração nova ou tentativa que falhou continua sendo enviada. Timers pendentes são cancelados no salvamento explícito e na abertura de formulário.

## Verificação

Testes comportamentais cobrem cancelamento e retry, paginação vazia, total exato, exportador inexistente, regras Apenas DU-E, conflito de versão, autosave confirmado/falho e concorrência no contador de agenda. Build de produção e verificação de segredos executados localmente.

A suíte completa da versão original `0cb429f` já apresenta três falhas: arquivo `.github/workflows/security.yml` ausente; expressão de teste da projeção que não aceita CRLF; teste da capa que ainda espera RUC em Apenas DU-E. Essas mesmas falhas foram reproduzidas numa cópia sem as alterações. Não são regressões introduzidas nesta otimização.

O serviço usa a branch `homologacao`, com publicação automática por commit. Não houve alteração de schema ou migração de dados. O banco de testes estava pausado no Supabase e foi retomado antes da verificação HTTP.

## Limites

O plano gratuito do Render ainda suspende a instância após inatividade. As melhorias não eliminam o tempo de despertar da hospedagem nem a latência entre o usuário e Ohio. O banco de homologação também está em Ohio. Tempos HTTP variam com rede, carga, dados e estado da instância; redução de consultas não equivale a uma porcentagem fixa de ganho.
