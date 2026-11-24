<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-12 — Daemon local, portabilidade final e release multiplataforma

- **Estado:** RUNNING (v3)
- **Requisitos da fase** (união das tarefas): AER-REQ-004, AER-REQ-190, AER-REQ-191, AER-REQ-210, AER-REQ-231, AER-REQ-232, AER-REQ-233

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0059 — ADR do motor residente e supervisores (launchd, systemd, Windows) | RUNNING | — | — | AER-REQ-231, AER-REQ-232 |
| TAR-0060 — Lifecycle do motor residente: start/stop/status, TUI sai sem perder tarefas | RUNNING | — | — | AER-REQ-231 |
| TAR-0061 — Pacote npm único com os dois bins, instalação, atualização e uninstall limpos | RUNNING | — | — | AER-REQ-004, AER-REQ-210 |
| TAR-0062 — Matriz CI de OS e arquiteturas com smoke do pacote instalado (bash, zsh, PowerShell) | RUNNING | — | — | AER-REQ-190, AER-REQ-233 |
| TAR-0063 — Hardening E2E, docs por SO e auditoria do DoD (P0 sem exceção aberta) | RUNNING | — | — | AER-REQ-190, AER-REQ-191 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).
