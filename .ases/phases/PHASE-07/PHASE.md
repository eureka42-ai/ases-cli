<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-07 — Claude Code oficial e Codex oficial

- **Estado:** COMPLETED (v5)
- **Requisitos da fase** (união das tarefas): AER-REQ-101, AER-REQ-103, AER-REQ-110, AER-REQ-111, AER-REQ-112, AER-REQ-113, AER-REQ-116, AER-REQ-118, AER-REQ-119, AER-REQ-120, AER-REQ-121, AER-REQ-123, AER-REQ-124, AER-REQ-125, AER-REQ-126, AER-REQ-127, AER-REQ-130

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0032 — Pesquisa de flags e termos atuais (Claude Code, Codex) | COMPLETED | — | — | AER-REQ-113, AER-REQ-120, AER-REQ-121, AER-REQ-126 |
| TAR-0033 — Adapter Claude Code (claude -p, stream-json) | COMPLETED | claude | TAR-0032 | AER-REQ-101, AER-REQ-103, AER-REQ-111, AER-REQ-118, AER-REQ-125 |
| TAR-0034 — Adapter Codex (codex exec --json) | COMPLETED | codex | TAR-0032 | AER-REQ-101, AER-REQ-103, AER-REQ-112, AER-REQ-118, AER-REQ-125 |
| TAR-0035 — Smoke opt-in com consentimento e transcript redigido | COMPLETED | — | TAR-0033, TAR-0034 | AER-REQ-111, AER-REQ-112, AER-REQ-123, AER-REQ-124 |
| TAR-0036 — Matriz de limitações e doctor VERIFIED/SIMULATED/UNKNOWN | COMPLETED | — | TAR-0033, TAR-0034 | AER-REQ-110, AER-REQ-116, AER-REQ-119, AER-REQ-127, AER-REQ-130 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).

## Relatório de conclusão
- **TAR-0032** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0033** COMPLETED: sem test run; 2 evidência(s)
- **TAR-0034** COMPLETED: sem test run; 2 evidência(s)
- **TAR-0035** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0036** COMPLETED: sem test run; 3 evidência(s)
- Motivo registrado na conclusão: CI Linux/Windows 6/6 run 45220306651; macOS só local 215/215 (seq 271)
