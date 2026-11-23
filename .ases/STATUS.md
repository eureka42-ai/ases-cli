# STATUS AER

Último evento: seq 131 (PhaseUpdated, 2026-11-23T01:15:18.507Z)

## Fases
| Fase | Título | Estado | Evidência |
|---|---|---|---|
| PHASE-01 | Repositório e bootstrap seguro | COMPLETED | .ases/evidence/PHASE-01-verify.md |
| PHASE-02 | SQLite + eventos + estados | COMPLETED | .ases/evidence/PHASE-02-verify.md |
| PHASE-03 | Dois executáveis e IPC | COMPLETED | .ases/evidence/PHASE-03-verify.md |
| PHASE-04 | TUI utilizável + marca Eureka42 | COMPLETED | .ases/evidence/PHASE-04-verify.md |
| PHASE-05 | Scheduler, DAG e isolamento Git | RUNNING | — |

## Tarefas
| Tarefa | Fase | Título | Estado | Evidência |
|---|---|---|---|---|
| TAR-0001 | PHASE-01 | Auditar ambiente local | COMPLETED | .ases/evidence/TAR-0001-environment.md |
| TAR-0002 | PHASE-01 | Monorepo TypeScript (npm workspaces) | COMPLETED | .ases/evidence/PHASE-01-verify.md<br>docs/ADRs/ADR-0001.md |
| TAR-0003 | PHASE-01 | Contratos de projeto | COMPLETED | .ases/evidence/PHASE-01-verify.md<br>packages/contracts/test/contracts.test.ts |
| TAR-0004 | PHASE-01 | Bootstrap de .ases/ | COMPLETED | .ases/evidence/PHASE-01-verify.md<br>test/ases-dev.test.mjs |
| TAR-0005 | PHASE-01 | Testes/CI e esqueleto PlatformAdapter | COMPLETED | .ases/evidence/PHASE-01-verify.md<br>packages/platform-core/test/platform.test.ts<br>.github/workflows/ci.yml |
| TAR-0006 | PHASE-02 | Schema SQLite e migrações | COMPLETED | .ases/evidence/PHASE-02-verify.md<br>docs/ADRs/ADR-0002.md<br>packages/persistence/test/migrations.test.ts |
| TAR-0007 | PHASE-02 | Event store transacional | COMPLETED | .ases/evidence/PHASE-02-verify.md<br>packages/persistence/test/store.test.ts |
| TAR-0008 | PHASE-02 | Máquina de estados de tarefa e fase | COMPLETED | .ases/evidence/PHASE-02-verify.md<br>packages/contracts/test/state-machine.test.ts<br>packages/persistence/test/store.test.ts |
| TAR-0009 | PHASE-02 | Exportação JSONL e recuperação | COMPLETED | .ases/evidence/PHASE-02-verify.md<br>packages/persistence/test/export.test.ts<br>docs/DATA.md |
| TAR-0010 | PHASE-02 | Suíte transacional multiprocesso | COMPLETED | .ases/evidence/PHASE-02-verify.md<br>packages/persistence/test/multiprocess.test.ts |
| TAR-0011 | PHASE-03 | CLI shell ases/ases-tar + build + marca mínima | COMPLETED | .ases/evidence/PHASE-03-verify.md<br>test/e2e/bins.test.mjs<br>packages/branding/test/branding.test.ts |
| TAR-0012 | PHASE-03 | Servidor IPC local (UDS / Named Pipe) | COMPLETED | .ases/evidence/PHASE-03-verify.md<br>packages/ipc/test/ipc.test.ts<br>docs/ADRs/ADR-0003.md |
| TAR-0013 | PHASE-03 | Cliente IPC e assinatura de eventos | COMPLETED | .ases/evidence/PHASE-03-verify.md<br>packages/ipc/test/ipc.test.ts<br>docs/API.md |
| TAR-0014 | PHASE-03 | Monitor somente leitura | COMPLETED | .ases/evidence/PHASE-03-verify.md<br>packages/ipc/test/ipc.test.ts |
| TAR-0015 | PHASE-03 | E2E com dois processos reais | COMPLETED | .ases/evidence/PHASE-03-verify.md<br>test/e2e/two-processes.test.mjs |
| TAR-0016 | PHASE-04 | tui-shared: tema, marca, badges, painéis, ajuda | COMPLETED | .ases/evidence/PHASE-04-verify.md<br>packages/tui-shared/test/tui-shared.test.tsx<br>docs/ADRs/ADR-0011.md |
| TAR-0017 | PHASE-04 | ases: home + sessão TUI | COMPLETED | .ases/evidence/PHASE-04-verify.md<br>apps/ases-cli/test/tui.test.tsx<br>test/e2e/pty.test.mjs |
| TAR-0018 | PHASE-04 | ases-tar: overview + eventos ao vivo | COMPLETED | .ases/evidence/PHASE-04-verify.md<br>apps/ases-tar/test/tui.test.tsx<br>apps/ases-tar/test/projection.test.ts |
| TAR-0019 | PHASE-04 | ases-tar: detalhe da tarefa | COMPLETED | .ases/evidence/PHASE-04-verify.md<br>apps/ases-tar/test/tui.test.tsx |
| TAR-0020 | PHASE-04 | Acessibilidade, larguras e smoke em pty | COMPLETED | .ases/evidence/PHASE-04-verify.md<br>test/e2e/pty.test.mjs<br>docs/TUI-UX.md |
| TAR-0021 | PHASE-05 | DAG de dependências | PLANNED | — |
| TAR-0022 | PHASE-05 | Leases com fencing e scheduler | PLANNED | — |
| TAR-0023 | PHASE-05 | Git worktree por tarefa/attempt | PLANNED | — |
| TAR-0024 | PHASE-05 | Fila de merge serializada | PLANNED | — |
| TAR-0025 | PHASE-05 | Concorrência e recuperação do scheduler | PLANNED | — |
| TAR-0026 | PHASE-05 | Evidências no banco e corte do .ases/ interino | PLANNED | — |

Estados sem evidência listada não foram verificados. NOT_RUN ≠ PASS.
