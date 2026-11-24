<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-08 — Kimi, OpenCode e Google

- **Estado:** COMPLETED (v5)
- **Requisitos da fase** (união das tarefas): AER-REQ-101, AER-REQ-103, AER-REQ-111, AER-REQ-118, AER-REQ-119, AER-REQ-123, AER-REQ-125, AER-REQ-130

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0037 — Pesquisa de flags, ACP e termos (Kimi, OpenCode, Google) | COMPLETED | — | — | AER-REQ-101, AER-REQ-103, AER-REQ-118 |
| TAR-0038 — Cliente ACP comum e adapter Kimi (kimi acp) | COMPLETED | — | TAR-0037 | AER-REQ-101, AER-REQ-103, AER-REQ-111, AER-REQ-118, AER-REQ-125 |
| TAR-0039 — Adapter OpenCode (opencode acp) | COMPLETED | — | TAR-0038 | AER-REQ-101, AER-REQ-103, AER-REQ-111, AER-REQ-118, AER-REQ-125 |
| TAR-0040 — Adapter Google (Gemini CLI) com capability honesta | COMPLETED | — | TAR-0038 | AER-REQ-101, AER-REQ-103, AER-REQ-118 |
| TAR-0041 — Fixtures de teste e smoke opt-in | COMPLETED | — | TAR-0039 | AER-REQ-123, AER-REQ-125 |
| TAR-0042 — Documentação de paridade dos cinco providers | COMPLETED | — | TAR-0041 | AER-REQ-119, AER-REQ-130 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).

## Relatório de conclusão
- **TAR-0037** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0038** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0039** COMPLETED: sem test run; 2 evidência(s)
- **TAR-0040** COMPLETED: sem test run; 2 evidência(s)
- **TAR-0041** COMPLETED: sem test run; 2 evidência(s)
- **TAR-0042** COMPLETED: sem test run; 2 evidência(s)
- Motivo registrado na conclusão: CI Linux/Windows 6/6 run 45232756904; macOS só local 234/234 (seq 336)
