# Atlas Export API

API Node.js para o sistema de gestão de processos de exportação. Usa PostgreSQL, autenticação JWT e senhas com hash bcrypt.

## Executar localmente

1. Instale Node.js 20+ e PostgreSQL.
2. Para Supabase, siga `docs/supabase-setup.md`; para PostgreSQL local, crie um banco chamado `atlas_export` e execute `database/supabase-schema-consolidado.sql` nele.
3. Em bancos já existentes, execute também `database/migrations/2026-07-25-stability-security.sql` uma única vez.
4. Copie `.env.example` para `.env` e preencha `DATABASE_URL` e `JWT_SECRET`.
5. Execute:

```powershell
npm install
npm run dev
```

6. Acesse `http://localhost:3000/api/health`. O primeiro usuário criado em `POST /api/auth/register` torna-se administrador.

## Verificações antes de publicar

```powershell
npm.cmd test
```

Opcionalmente, defina `REGISTRATION_CODE` no `.env`/Render para exigir um código no cadastro inicial de novos usuários. Sem essa variável, permanece o cadastro aberto para a equipe, como no fluxo atual.

## Publicação no Azure

- Banco: **Supabase PostgreSQL** ou **Azure Database for PostgreSQL Flexible Server**.
- API: **Azure App Service** com Node.js 20+.
- Configure no App Service as variáveis `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` e `PORT`.
- Execute `database/schema.sql` uma vez no banco antes de publicar a API.

Nunca inclua `.env` ou senhas no GitHub.
