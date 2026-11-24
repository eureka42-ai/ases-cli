<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-16 — Eureka42 Branding, UX portátil e release estável

- **Estado:** RUNNING (v4)
- **Requisitos da fase** (união das tarefas): AER-REQ-225, AER-REQ-232, AER-REQ-234, AER-REQ-240, AER-REQ-243, AER-REQ-244, AER-REQ-245, AER-REQ-246, AER-REQ-247, AER-REQ-248, AER-REQ-249

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0070 — TUI em ConPTY/Windows Terminal: roteiro manual do responsável ou harness automático (vem da TAR-0069) | PLANNED | — | — | AER-REQ-234 |
| TAR-0071 — Profundidade de cor: truecolor, 256 e 16 cores pelo terminal | RUNNING | — | — | AER-REQ-243, AER-REQ-245 |
| TAR-0072 — Tema de alto contraste e tema auto, com razão de contraste medida | RUNNING | — | — | AER-REQ-243 |
| TAR-0073 — Precedência de tema e logo: CLI > projeto > global > padrão | RUNNING | — | — | AER-REQ-248, AER-REQ-249 |
| TAR-0074 — Sem animação nas TUIs (verificação automática) e larguras 40/50/80/120 nas duas TUIs | RUNNING | — | — | AER-REQ-244, AER-REQ-246, AER-REQ-247 |
| TAR-0075 — Gate de release cross-platform: matriz, pacote por plataforma e notas de versão | PLANNED | — | — | AER-REQ-225, AER-REQ-232, AER-REQ-240 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).
