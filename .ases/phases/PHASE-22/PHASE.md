<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-22 — Cursor seguro e verificado (1.2.1)

- **Estado:** PLANNED (v1)
- **Requisitos da fase** (união das tarefas): AER-REQ-101, AER-REQ-109

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0093 — Regra deny Shell(*) durante a execução do Cursor, acesso fora do projeto como violação, smoke real e VERIFIED | REVIEW | — | — | AER-REQ-101, AER-REQ-109 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).
