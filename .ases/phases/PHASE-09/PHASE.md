<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-09 — ASES-300/500 e rastreabilidade

- **Estado:** COMPLETED (v5)
- **Requisitos da fase** (união das tarefas): AER-REQ-151, AER-REQ-152, AER-REQ-153, AER-REQ-154, AER-REQ-155, AER-REQ-156, AER-REQ-157, AER-REQ-158, AER-REQ-159, AER-REQ-160

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0043 — Importação e verificação das fontes ASES (REQ-001..300 literais + SHA-256) | COMPLETED | — | — | AER-REQ-151, AER-REQ-152, AER-REQ-153, AER-REQ-156 |
| TAR-0044 — Fluxo de especificação ASES-500 (entrevista por lacunas, decisões) | COMPLETED | — | — | AER-REQ-154, AER-REQ-155, AER-REQ-160 |
| TAR-0045 — Matriz de requisitos (aplicabilidade, estado, evidência, N/A justificado) | COMPLETED | — | TAR-0043 | AER-REQ-152, AER-REQ-158 |
| TAR-0046 — Rastreabilidade, gates G0/G1 e mudança controlada (CHANGE) | COMPLETED | — | TAR-0044, TAR-0045 | AER-REQ-157, AER-REQ-159 |
| TAR-0047 — QA: projeto de exemplo da entrevista a 2 fases e 3 tarefas rastreáveis | COMPLETED | — | TAR-0046 | AER-REQ-157, AER-REQ-158 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).

## Relatório de conclusão
- **TAR-0043** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0044** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0045** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0046** COMPLETED: sem test run; 2 evidência(s)
- **TAR-0047** COMPLETED: sem test run; 1 evidência(s)
- Motivo registrado na conclusão: CI Linux/Windows 6/6 run 45245602246; macOS cancelado sem runner, só local 248/248 (seq 393)
