# Configuração com Supabase

## 1. Criar o projeto

No painel do Supabase, crie um projeto e guarde a senha do banco. Escolha uma região próxima da equipe, como South America (São Paulo), quando disponível.

## 2. Criar as tabelas

1. Abra **SQL Editor** no projeto Supabase.
2. Abra e cole o conteúdo de `database/supabase-schema-consolidado.sql`; clique em **Run**.
3. Em bancos já existentes, execute também `database/migrations/2026-07-25-stability-security.sql` e `database/migrations/2026-07-26-session-security.sql`.

As tabelas ficarão no schema `public`. As regras de segurança impedem acesso direto com as chaves públicas do Supabase: os navegadores devem falar apenas com a API.

## 3. Obter a conexão para a API

No painel principal do projeto, clique em **Connect** no topo. Copie a opção **Transaction pooler > URI**. Ela usa a porta `6543` e funciona com esta API Node.js. Se o painel também oferecer **Session pooler**, ele pode ser usado, mas não é obrigatório.

No servidor da API, configure:

```text
DATABASE_URL=<URI do Pooler>
# Em produção, não use DB_SSL_REJECT_UNAUTHORIZED=false. A API exige validação
# do certificado TLS quando NODE_ENV=production.
JWT_SECRET=<segredo longo, exclusivo e não compartilhado>
CORS_ORIGIN=https://SUA-URL-PUBLICA
```

Não coloque `DATABASE_URL`, senha do banco, `JWT_SECRET`, `service_role` ou qualquer chave secreta no HTML, GitHub ou Azure Static Web Apps.

## 4. Testar

Depois de publicar a API, acesse `/api/health`. A resposta `{"status":"ok"}` confirma que API e Supabase estão conectados.

## Limite do plano gratuito

O projeto gratuito é adequado para validação, mas pode ser pausado após um período sem uso e não inclui backups automáticos. Antes de uso comercial contínuo, escolha um plano com backup e suporte.
