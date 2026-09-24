# Ambiente de testes GPORT

## Separação

- Produção: branch `main`, serviço Render existente e banco atual.
- Testes: branch `homologacao`, novo serviço `gport-homologacao` e banco separado no Supabase.
- O blueprint `render.homologacao.yaml` é exclusivo para criar o serviço de testes. Não o aplique ao serviço existente. Não substitua o `render.yaml` de produção.

## Preparação pendente

1. Criar ou preparar um banco separado no Supabase. O projeto antigo `gport homologação` é uma possibilidade, mas sua estrutura e seu uso precisam ser verificados antes de reutilizá-lo. Não copiar registros de produção automaticamente.
2. Preparar a estrutura compatível com a versão do código e criar um usuário de testes nesse banco. A presença dos arquivos SQL não significa que a estrutura já foi aplicada.
3. No Render, criar um Web Service separado usando o mesmo repositório e a branch `homologacao`. Build: `npm ci && npm run build`. Start: `npm start`. Health check: `/api/health`. Como alternativa, criar um Blueprint com caminho `render.homologacao.yaml` na branch `homologacao`.
4. Usar `NODE_ENV=production`, `DEPLOY_ENV=staging`, uma nova `JWT_SECRET` e a `DATABASE_URL` do banco de testes. Configurar o certificado em `DB_SSL_CA_BASE64`. Não importar o `.env` local que aponta para produção.
5. Configurar `CORS_ORIGIN` com o endereço HTTPS real do serviço de testes. Se habilitar Turnstile, usar as duas chaves e autorizar o hostname do serviço de testes. Não reutilizar webhooks de notificações reais.
6. Confirmar que o serviço principal acompanha `main` e o de testes acompanha `homologacao` antes de ativar publicações automáticas.
7. Verificar saúde, login e operações com dados fictícios no ambiente de testes.

## Uso diário

Publicar commits em `homologacao` para atualizar apenas o serviço de testes. Após validar uma versão, abrir um pull request de `homologacao` para `main`, revisar e aprovar a publicação em produção. Migrações precisam ser avaliadas separadamente; mesclar código não migra o banco automaticamente.

## Estado inicial

A branch e os arquivos de preparação foram criados. O serviço Render e o banco de testes ainda não foram provisionados nem validados. Há três falhas de testes conhecidas na cópia recuperada, descritas no histórico da recuperação; a homologação deve ser usada para investigar essas pendências antes da promoção.
