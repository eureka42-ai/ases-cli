<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-17 — Manutenção 1.0.x

- **Estado:** RUNNING (v3)
- **Requisitos da fase** (união das tarefas): AER-REQ-051, AER-REQ-052, AER-REQ-109, AER-REQ-229

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0076 — Windows: providers instalados por npm (shim .cmd) executados sem shell | PLANNED | — | — | AER-REQ-109, AER-REQ-229 |
| TAR-0077 — Worktrees em paralelo: git worktree add/remove serializados por repositório | PLANNED | — | — | AER-REQ-051, AER-REQ-052 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).
