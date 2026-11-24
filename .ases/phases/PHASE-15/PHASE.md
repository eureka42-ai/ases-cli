<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-15 — Portabilidade Windows e Linux verificada

- **Estado:** PLANNED (v2)
- **Requisitos da fase** (união das tarefas): AER-REQ-122, AER-REQ-225, AER-REQ-227, AER-REQ-229, AER-REQ-230, AER-REQ-233, AER-REQ-234, AER-REQ-238, AER-REQ-239

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0065 — SecretStore Windows (Credential Manager, segredo só por stdin, falha fechado) | RUNNING | — | — | AER-REQ-122, AER-REQ-229 |
| TAR-0066 — ACL do runtime dir e do Named Pipe no Windows verificadas (icacls) | PLANNED | — | — | AER-REQ-227 |
| TAR-0067 — Caminhos Windows: UNC, junction, letra de unidade, acentos e espaços | PLANNED | — | — | AER-REQ-230 |
| TAR-0068 — Matriz de suporte publicada por SO/arquitetura com PASS/FAIL/NOT_RUN e doctor | PLANNED | — | — | AER-REQ-225, AER-REQ-233, AER-REQ-238, AER-REQ-239 |
| TAR-0069 — TUI em ConPTY/Windows Terminal ou registro NOT_RUN honesto | PLANNED | — | — | AER-REQ-234 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).
