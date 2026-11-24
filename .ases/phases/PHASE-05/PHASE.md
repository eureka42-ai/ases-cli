<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-05 — Scheduler, DAG e isolamento Git

- **Estado:** COMPLETED (v1)
- **Requisitos da fase** (união das tarefas): AER-REQ-036, AER-REQ-037, AER-REQ-041, AER-REQ-042, AER-REQ-043, AER-REQ-044, AER-REQ-045, AER-REQ-046, AER-REQ-047, AER-REQ-050, AER-REQ-051, AER-REQ-052, AER-REQ-053, AER-REQ-055, AER-REQ-056, AER-REQ-057, AER-REQ-059, AER-REQ-060, AER-REQ-158, AER-REQ-164, AER-REQ-181, AER-REQ-186, AER-REQ-189, AER-REQ-192

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0021 — DAG de dependências | COMPLETED | — | — | AER-REQ-037, AER-REQ-041, AER-REQ-042 |
| TAR-0022 — Leases com fencing e scheduler | COMPLETED | — | TAR-0021 | AER-REQ-043, AER-REQ-044, AER-REQ-045, AER-REQ-046, AER-REQ-047, AER-REQ-050 |
| TAR-0023 — Git worktree por tarefa/attempt | COMPLETED | — | TAR-0022 | AER-REQ-051, AER-REQ-052, AER-REQ-053, AER-REQ-060, AER-REQ-164 |
| TAR-0024 — Fila de merge serializada | COMPLETED | — | TAR-0023 | AER-REQ-055, AER-REQ-056, AER-REQ-057, AER-REQ-059 |
| TAR-0025 — Concorrência e recuperação do scheduler | COMPLETED | — | TAR-0022, TAR-0024 | AER-REQ-045, AER-REQ-046, AER-REQ-192 |
| TAR-0026 — Evidências no banco e corte do .ases/ interino | COMPLETED | — | TAR-0022 | AER-REQ-036, AER-REQ-158, AER-REQ-181, AER-REQ-186, AER-REQ-189 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).

## Relatório de conclusão
- **TAR-0021** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0022** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0023** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0024** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0025** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0026** COMPLETED: sem test run; 1 evidência(s)
- Motivo registrado na conclusão: — (seq 157)
