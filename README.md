# Atlas Export Web

Estrutura inicial da aplicação web que substituirá progressivamente o MVP em arquivo único.

## Organização

- `index.html`: ponto de entrada do navegador.
- `assets/app.css`: estilos globais e componentes visuais.
- `assets/app.js`: inicialização da interface e futura comunicação com a API.
- `docs/api-contract.md`: contrato inicial das rotas do backend.

Nesta primeira etapa a interface continua sendo estática. A próxima etapa é criar o servidor e banco de dados para que processos, usuários e clientes sejam compartilhados entre os computadores.

Para abrir localmente, execute na pasta `atlas-export-web`:

```powershell
python -m http.server 8080
```

Depois acesse `http://localhost:8080`.
