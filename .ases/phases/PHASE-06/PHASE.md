<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-06 — Motor de provider e simulador determinístico

- **Estado:** COMPLETED (v5)
- **Requisitos da fase** (união das tarefas): AER-REQ-043, AER-REQ-101, AER-REQ-102, AER-REQ-103, AER-REQ-104, AER-REQ-105, AER-REQ-106, AER-REQ-107, AER-REQ-108, AER-REQ-109, AER-REQ-110

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0027 — Contratos do provider-sdk (AgentProvider v1) | COMPLETED | — | — | AER-REQ-101, AER-REQ-110 |
| TAR-0028 — Simulador determinístico SIMULATED | COMPLETED | — | TAR-0027 | AER-REQ-102, AER-REQ-103, AER-REQ-108 |
| TAR-0029 — Normalização de streams NDJSON | COMPLETED | — | TAR-0027 | AER-REQ-104, AER-REQ-107 |
| TAR-0030 — Ciclo de vida do worker: spawn, timeout, cancelamento e árvore de processos | COMPLETED | — | TAR-0027 | AER-REQ-105, AER-REQ-106, AER-REQ-109 |
| TAR-0031 — /run e /cancel ponta a ponta com ases-tar | COMPLETED | — | TAR-0028, TAR-0029, TAR-0030 | AER-REQ-043, AER-REQ-101, AER-REQ-105 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).

## Relatório de conclusão
- **TAR-0027** COMPLETED: sem test run; 2 evidência(s)
- **TAR-0028** COMPLETED: sem test run; 2 evidência(s)
- **TAR-0029** COMPLETED: sem test run; 2 evidência(s)
- **TAR-0030** COMPLETED: sem test run; 3 evidência(s)
- **TAR-0031** COMPLETED: sem test run; 3 evidência(s)
- Motivo registrado na conclusão: CI 8/8 run 45192505934; aprovado pelo responsável (seq 214)
