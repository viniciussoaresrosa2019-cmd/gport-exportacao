# Microsoft 365 / Entra ID — preparação

O aplicativo ainda usa contas locais com senha armazenada com bcrypt. Esta é uma
preparação documental: **não habilite `AUTH_PROVIDER=entra`**, pois o fluxo
OAuth ainda não foi implementado sem as configurações da organização.

## Arquitetura recomendada

Use o Microsoft Entra ID como provedor de identidade corporativa, com OpenID
Connect Authorization Code Flow + PKCE. A recuperação de senha e o MFA ficam
no Microsoft 365/Entra, onde podem seguir as políticas corporativas e TOTP,
Microsoft Authenticator ou chave de segurança. Não implemente MFA próprio.

## Informações necessárias antes da implementação

1. Registro de aplicativo no Microsoft Entra ID pela equipe de TI.
2. `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` e uma URL de retorno HTTPS exata.
3. Um segredo de cliente guardado somente nas variáveis do Render.
4. Decisão se qualquer conta corporativa pode entrar ou somente um grupo do
   Entra ID.
5. Mapeamento aprovado entre grupos do Entra e os cargos do sistema.

Nunca coloque o segredo no Git, no HTML, em capturas de tela ou em logs. Para
testar, crie um aplicativo separado de homologação e contas de teste.
