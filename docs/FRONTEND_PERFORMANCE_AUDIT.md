# Auditoria de HTML, CSS e JavaScript

Data: 03/08/2026  
Escopo: arquivos locais da interface. Nenhuma alteração de API, autenticação, permissão ou banco foi realizada.

## Diagnóstico inicial medido

| Item | Antes |
|---|---:|
| `public/index.html` | 187.084 bytes (47.231 gzip) |
| JavaScript dentro do HTML | 161.920 bytes, em 2 blocos |
| Atributos `style` no HTML | 49 |
| Manipuladores HTML `onclick`/`onchange`/`oninput`/`onsubmit` | 0 |
| `gport.css` | 18.821 bytes (4.850 gzip) |
| Testes automatizados | 45 aprovados, 0 falhas |

O custo principal não era o volume total isolado, e sim a concentração: o documento `no-store` carregava e analisava novamente todo o JavaScript em cada navegação. Os scripts também não podiam aproveitar o cache estático de um dia já configurado no Express.

Outros achados:

- regras completas de toast existiam tanto em `gport.css` quanto em `toasts.css`;
- `app.js`, `app.css` e `api-client.js` não tinham referência de execução;
- um gerador antigo de capa (`printOperationalCover`) não possuía chamada;
- a camada legada ainda contém estado e eventos compartilhados com a camada autenticada atual;
- não há bundler, minificador nem `browserslist`; a compatibilidade observada é com navegadores modernos e Node.js 24;
- estilos dinâmicos de largura dos gráficos e o CSS do documento de impressão são casos intencionais e não equivalem a estilos estáticos do HTML inicial.

## Alterações aplicadas

1. Os dois blocos JavaScript foram extraídos, sem reordenação interna, para `legacy-ui.js` e `app-runtime.js`.
2. Os três scripts são externos, usam `defer` e conservam a ordem de dependência.
3. Todos os 49 estilos estáticos do documento foram convertidos em classes.
4. Estilos estáticos gerados por JavaScript (tabelas, campos de senha e contêineres) também passaram a usar classes.
5. A definição duplicada de toast foi removida de `gport.css`; `toasts.css` é a fonte única.
6. Três ativos não utilizados e cinco declarações sem referência foram removidos. O gerador de capa atual foi preservado e ganhou verificação regressiva explícita.
7. Os testes passaram a validar sintaxe de cada arquivo JavaScript externo e impedir que o HTML volte a ultrapassar 30 KB ou receba estilos/eventos inline.
8. As URLs dos recursos receberam uma versão explícita para impedir que o cache de um dia do Render entregue arquivos anteriores após o deploy.

## Resultado local medido

| Item | Antes | Depois | Variação |
|---|---:|---:|---:|
| `index.html` bruto | 187.084 B | 24.471 B | −86,9% |
| `index.html` gzip | 47.231 B | 5.870 B | −87,6% |
| JavaScript inline | 161.920 B | 0 B | −100% |
| Estilos inline no HTML | 49 | 0 | −100% |
| `gport.css` | 18.821 B | 14.873 B | −21,0% |
| `app-runtime.js` | 114.588 B | 98.972 B | −13,6% |
| Conjunto principal bruto | 243.627 B | 224.573 B | −7,8% |
| Conjunto principal gzip | 63.422 B | 61.611 B | −2,9% |
| Testes automatizados | 45/45 | 46/46 | sem regressão |

No primeiro acesso, os arquivos externos acrescentam duas requisições, mas são cacheáveis. Nas navegações seguintes, o documento `no-store` transfere aproximadamente 41 KB gzip a menos e os scripts podem ser reutilizados do cache. O JavaScript usa `defer`, portanto deixa de bloquear a análise do HTML.

## Decisões de risco

- Não foi removida a camada legada inteira. `app-runtime.js` ainda depende de funções globais como renderização, formatação e geração da capa.
- Não foi usado carregamento assíncrono para as folhas principais: elas são pequenas e evitam FOUC; a evidência anterior do Lighthouse deve ser refeita após o deploy.
- O CSS autocontido da capa permanece dentro do documento de impressão, pois precisa funcionar dentro do `iframe.srcdoc` e na impressão/PDF.
- Larguras dos gráficos continuam dinâmicas. Substituí-las agora mudaria a implementação visual sem ganho mensurável relevante.

## Próximas fases recomendadas

1. Publicar em homologação e repetir Lighthouse autenticado, comparando LCP, CLS, INP, requisições e recursos não utilizados.
2. Criar testes de navegador para login, processo, VGM, liberação, usuários, preferências e capa; só depois remover os manipuladores e o armazenamento local desativados da camada legada.
3. Separar `legacy-ui.js` por responsabilidade e expor dependências de forma explícita; migrar para módulos ES somente quando não houver globais cruzadas.
4. Adotar uma etapa de build com nomes de arquivo versionados e minificação, mantendo arquivos-fonte legíveis e sourcemaps restritos à homologação.
5. Carregar relatórios e recursos secundários sob demanda após medir o custo real por aba.

## Reversão

Republique o commit anterior da homologação para reverter toda a fase. Para reversão seletiva, restaure `public/index.html`, `gport.css`, `experience.css`, `legacy-ui.js`, `app-runtime.js`, os três ativos removidos e `tests/application.test.mjs` a partir do commit anterior conhecido. Nenhuma reversão de banco é necessária.
