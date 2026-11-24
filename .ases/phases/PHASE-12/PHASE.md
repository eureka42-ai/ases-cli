<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-12 — Daemon local, portabilidade final e release multiplataforma

- **Estado:** COMPLETED (v5)
- **Requisitos da fase** (união das tarefas): AER-REQ-004, AER-REQ-027, AER-REQ-048, AER-REQ-095, AER-REQ-097, AER-REQ-171, AER-REQ-190, AER-REQ-191, AER-REQ-210, AER-REQ-231, AER-REQ-232, AER-REQ-233

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0059 — ADR do motor residente e supervisores (launchd, systemd, Windows) | COMPLETED | — | — | AER-REQ-231, AER-REQ-232 |
| TAR-0060 — Lifecycle do motor residente: start/stop/status, TUI sai sem perder tarefas | COMPLETED | — | — | AER-REQ-231 |
| TAR-0061 — Pacote npm único com os dois bins, instalação, atualização e uninstall limpos | COMPLETED | — | — | AER-REQ-004, AER-REQ-210 |
| TAR-0062 — Matriz CI de OS e arquiteturas com smoke do pacote instalado (bash, zsh, PowerShell) | COMPLETED | — | — | AER-REQ-190, AER-REQ-233 |
| TAR-0063 — Hardening E2E, docs por SO e auditoria do DoD (P0 sem exceção aberta) | COMPLETED | — | — | AER-REQ-190, AER-REQ-191 |
| TAR-0064 — Fecha 5 P0 da auditoria (095, 097, 027, 171, 048) e registra as exceções aprovadas | COMPLETED | — | — | AER-REQ-027, AER-REQ-048, AER-REQ-095, AER-REQ-097, AER-REQ-171 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).

## Relatório de conclusão
- **TAR-0059** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0060** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0061** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0062** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0063** COMPLETED: sem test run; 2 evidência(s)
- **TAR-0064** COMPLETED: sem test run; 2 evidência(s)
- Motivo registrado na conclusão: aprovada pelo responsável; main em 11a9122 (seq 561)
