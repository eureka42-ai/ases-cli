<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-03 — Dois executáveis e IPC

- **Estado:** COMPLETED (v1)
- **Requisitos da fase** (união das tarefas): AER-REQ-004, AER-REQ-011, AER-REQ-014, AER-REQ-070, AER-REQ-071, AER-REQ-072, AER-REQ-073, AER-REQ-074, AER-REQ-075, AER-REQ-076, AER-REQ-077, AER-REQ-078, AER-REQ-079, AER-REQ-080, AER-REQ-090, AER-REQ-091, AER-REQ-093, AER-REQ-094, AER-REQ-099, AER-REQ-170, AER-REQ-191, AER-REQ-228, AER-REQ-240, AER-REQ-241, AER-REQ-245, AER-REQ-247

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0011 — CLI shell ases/ases-tar + build + marca mínima | COMPLETED | — | — | AER-REQ-004, AER-REQ-011, AER-REQ-240, AER-REQ-241, AER-REQ-245, AER-REQ-247 |
| TAR-0012 — Servidor IPC local (UDS / Named Pipe) | COMPLETED | — | TAR-0011 | AER-REQ-014, AER-REQ-071, AER-REQ-072, AER-REQ-078, AER-REQ-080, AER-REQ-228 |
| TAR-0013 — Cliente IPC e assinatura de eventos | COMPLETED | — | TAR-0012 | AER-REQ-070, AER-REQ-074, AER-REQ-075, AER-REQ-076, AER-REQ-077 |
| TAR-0014 — Monitor somente leitura | COMPLETED | — | TAR-0012 | AER-REQ-073, AER-REQ-079, AER-REQ-170 |
| TAR-0015 — E2E com dois processos reais | COMPLETED | — | TAR-0013, TAR-0014 | AER-REQ-090, AER-REQ-091, AER-REQ-093, AER-REQ-094, AER-REQ-099, AER-REQ-191 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).

## Relatório de conclusão
- **TAR-0011** COMPLETED: sem test run; 3 evidência(s)
- **TAR-0012** COMPLETED: sem test run; 3 evidência(s)
- **TAR-0013** COMPLETED: sem test run; 3 evidência(s)
- **TAR-0014** COMPLETED: sem test run; 2 evidência(s)
- **TAR-0015** COMPLETED: sem test run; 2 evidência(s)
- Motivo registrado na conclusão: — (seq 88)
