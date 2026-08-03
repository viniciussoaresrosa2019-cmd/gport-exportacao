# Interface web do GPORT

O conteúdo desta pasta é servido pelo Express em `src/server.js`.

## Estrutura ativa

- `index.html`: marcação semântica e referências aos recursos; não contém JavaScript, estilos ou eventos inline.
- `assets/gport.css`: tokens e componentes visuais básicos.
- `assets/toasts.css`: única fonte dos estilos de notificação.
- `assets/experience.css`: experiência progressiva, responsividade e classes estruturais.
- `assets/legacy-ui.js`: camada visual compartilhada ainda necessária para compatibilidade.
- `assets/app-runtime.js`: integração autenticada com API e fluxos operacionais atuais.
- `assets/experience.js`: melhorias progressivas de formulário, dashboard, notificações e acessibilidade.

Os scripts clássicos são carregados com `defer` e na ordem acima porque a camada atual ainda reutiliza funções da camada de compatibilidade. Não transforme um arquivo isolado em módulo ES sem antes eliminar essas dependências globais e executar os testes de regressão.

Para desenvolvimento, inicie o servidor completo na raiz do projeto:

```powershell
npm run start
```

Não abra `index.html` diretamente: autenticação, CSP, CSRF, API e substituição da chave Turnstile são aplicadas pelo servidor.
