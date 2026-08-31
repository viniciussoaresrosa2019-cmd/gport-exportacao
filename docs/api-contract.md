# Contrato inicial da API

Base URL: `/api`

| Método | Rota | Finalidade |
| --- | --- | --- |
| GET | `/health` | Estado do servidor |
| POST | `/auth/login` | Autenticação do usuário |
| POST | `/auth/logout` | Encerrar sessão |
| GET | `/processes` | Listar processos permitidos ao usuário |
| POST | `/processes` | Criar processo |
| PATCH | `/processes/:id` | Atualizar processo |
| DELETE | `/processes/:id` | Excluir processo |
| GET/POST | `/clients` | Consultar/criar exportadores |
| GET | `/reports` | Relatórios mensal e anual |
| GET | `/users` | Administração de usuários (somente administrador) |

As rotas de escrita exigirão uma sessão autenticada e verificarão a função do usuário no servidor.
