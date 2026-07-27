# Atualização em tempo real

## Arquitetura

O navegador abre uma conexão SSE autenticada em `GET /api/events`. A API só
envia eventos de processo para quem pode ler o respectivo processo. O evento
não contém dados do processo: contém apenas o identificador, o tipo da mudança
e o horário. Ao recebê-lo, a interface busca somente `GET /api/processes/:id`
e atualiza o item já visível.

Eventos cobertos:

- `process-changed`: criação, edição, exclusão, VGM, liberação e follow-up;
- `reference-changed`: clientes e lista de responsáveis.

O endpoint individual reaplica a autorização no servidor. Um analista não
consegue obter processo de outro analista alterando o identificador.

## Desempenho e fallback

- Eventos próximos são agrupados por 120 ms no navegador.
- Um item já visível é atualizado com uma única consulta, sem recarregar a
  página, paginação ou lista inteira.
- Um processo novo fora da página/filtro atual gera apenas um aviso discreto.
- Se SSE continuar indisponível por 10 segundos, a página faz polling somente
  a cada 60 segundos, apenas enquanto a aba estiver visível.
- Ao reconectar, o polling é interrompido automaticamente.

## Métricas

Um administrador pode consultar `GET /api/realtime/metrics` com a sessão
autenticada. A resposta possui conexões abertas, total de conexões desde o
início da instância, eventos publicados, entregues e o horário do último
evento. Essas métricas ficam em memória e reiniciam quando a instância reinicia.

Para estimar atraso, altere VGM em uma conta de teste e observe a outra conta:
o esperado, com o servidor já ativo, é atualização em centenas de
milissegundos a poucos segundos, dependendo de rede, Render e Supabase.

## Limitações

O SSE em memória distribui eventos somente dentro de uma instância Node.js. Se
o serviço passar a usar mais de uma instância no Render, é obrigatório publicar
e assinar os eventos por Redis/Upstash ou Supabase Realtime antes de escalar.
O plano gratuito do Render pode suspender a instância por inatividade; durante
a inicialização não há atualização em tempo real.

## Teste manual de autorização

1. Abra duas sessões com usuários de teste autorizados ao mesmo processo.
2. Altere VGM ou liberação na primeira sessão e confirme a mudança na segunda.
3. Abra uma sessão de analista sem acesso ao processo e confirme que ela não
   recebe nem consegue buscar o processo pelo endpoint individual.
4. Desconecte temporariamente a rede de uma sessão, aguarde o aviso de
   fallback, reconecte e confirme que o aviso de reconexão aparece.
