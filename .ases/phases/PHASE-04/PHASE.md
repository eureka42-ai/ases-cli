<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-04 — TUI utilizável + marca Eureka42

- **Estado:** COMPLETED (v1)
- **Requisitos da fase** (união das tarefas): AER-REQ-081, AER-REQ-084, AER-REQ-085, AER-REQ-087, AER-REQ-088, AER-REQ-089, AER-REQ-090, AER-REQ-092, AER-REQ-094, AER-REQ-096, AER-REQ-098, AER-REQ-099, AER-REQ-100, AER-REQ-201, AER-REQ-203, AER-REQ-240, AER-REQ-243, AER-REQ-244, AER-REQ-245, AER-REQ-246, AER-REQ-248

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0016 — tui-shared: tema, marca, badges, painéis, ajuda | COMPLETED | — | — | AER-REQ-100, AER-REQ-240, AER-REQ-243, AER-REQ-248 |
| TAR-0017 — ases: home + sessão TUI | COMPLETED | — | TAR-0016 | AER-REQ-081, AER-REQ-084, AER-REQ-085, AER-REQ-087, AER-REQ-088, AER-REQ-090 |
| TAR-0018 — ases-tar: overview + eventos ao vivo | COMPLETED | — | TAR-0016 | AER-REQ-092, AER-REQ-096, AER-REQ-099, AER-REQ-203 |
| TAR-0019 — ases-tar: detalhe da tarefa | COMPLETED | — | TAR-0018 | AER-REQ-085, AER-REQ-094, AER-REQ-098 |
| TAR-0020 — Acessibilidade, larguras e smoke em pty | COMPLETED | — | TAR-0017, TAR-0018, TAR-0019 | AER-REQ-088, AER-REQ-089, AER-REQ-201, AER-REQ-244, AER-REQ-245, AER-REQ-246 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).

## Relatório de conclusão
- **TAR-0016** COMPLETED: sem test run; 3 evidência(s)
- **TAR-0017** COMPLETED: sem test run; 3 evidência(s)
- **TAR-0018** COMPLETED: sem test run; 3 evidência(s)
- **TAR-0019** COMPLETED: sem test run; 2 evidência(s)
- **TAR-0020** COMPLETED: sem test run; 3 evidência(s)
- Motivo registrado na conclusão: — (seq 122)
