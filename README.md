# Atlas Export API

API Node.js para o sistema de gestão de processos de exportação. Usa PostgreSQL, autenticação JWT e senhas com hash bcrypt.

## Executar localmente

1. Instale Node.js 20+ e PostgreSQL.
2. Para Supabase, siga `docs/supabase-setup.md`; para PostgreSQL local, crie um banco chamado `atlas_export` e execute `database/schema.sql` nele.
3. Copie `.env.example` para `.env` e preencha `DATABASE_URL` e `JWT_SECRET`.
4. Execute:

```powershell
npm install
npm run dev
```

5. Acesse `http://localhost:3000/api/health`. O primeiro usuário criado em `POST /api/auth/register` torna-se administrador.

## Publicação no Azure

- Banco: **Supabase PostgreSQL** ou **Azure Database for PostgreSQL Flexible Server**.
- API: **Azure App Service** com Node.js 20+.
- Configure no App Service as variáveis `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` e `PORT`.
- Execute `database/schema.sql` uma vez no banco antes de publicar a API.

Nunca inclua `.env` ou senhas no GitHub.
