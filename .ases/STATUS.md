# STATUS

Gerado pelo engine a partir do banco (`.ases/db/ases.sqlite`). Último evento: seq 465 (TaskUpdated, 2026-11-23T20:12:28.828Z)

## Fases
| Fase | Título | Estado |
|---|---|---|
| PHASE-01 | Repositório e bootstrap seguro | COMPLETED |
| PHASE-02 | SQLite + eventos + estados | COMPLETED |
| PHASE-03 | Dois executáveis e IPC | COMPLETED |
| PHASE-04 | TUI utilizável + marca Eureka42 | COMPLETED |
| PHASE-05 | Scheduler, DAG e isolamento Git | COMPLETED |
| PHASE-06 | Motor de provider e simulador determinístico | COMPLETED |
| PHASE-07 | Claude Code oficial e Codex oficial | COMPLETED |
| PHASE-08 | Kimi, OpenCode e Google | COMPLETED |
| PHASE-09 | ASES-300/500 e rastreabilidade | COMPLETED |
| PHASE-10 | Segurança e registry de extensões | RUNNING |
| PHASE-11 | Continuidade, métricas e review | RUNNING |

## Tarefas
| Tarefa | Fase | Título | Estado | Último teste | Evidência |
|---|---|---|---|---|---|
| TAR-0001 | PHASE-01 | Auditar ambiente local | COMPLETED | — | .ases/evidence/TAR-0001-environment.md |
| TAR-0002 | PHASE-01 | Monorepo TypeScript (npm workspaces) | COMPLETED | — | .ases/evidence/PHASE-01-verify.md<br>docs/ADRs/ADR-0001.md |
| TAR-0003 | PHASE-01 | Contratos de projeto | COMPLETED | — | .ases/evidence/PHASE-01-verify.md<br>packages/contracts/test/contracts.test.ts |
| TAR-0004 | PHASE-01 | Bootstrap de .ases/ | COMPLETED | — | .ases/evidence/PHASE-01-verify.md<br>test/ases-dev.test.mjs |
| TAR-0005 | PHASE-01 | Testes/CI e esqueleto PlatformAdapter | COMPLETED | — | .ases/evidence/PHASE-01-verify.md<br>packages/platform-core/test/platform.test.ts<br>.github/workflows/ci.yml |
| TAR-0006 | PHASE-02 | Schema SQLite e migrações | COMPLETED | — | .ases/evidence/PHASE-02-verify.md<br>docs/ADRs/ADR-0002.md<br>packages/persistence/test/migrations.test.ts |
| TAR-0007 | PHASE-02 | Event store transacional | COMPLETED | — | .ases/evidence/PHASE-02-verify.md<br>packages/persistence/test/store.test.ts |
| TAR-0008 | PHASE-02 | Máquina de estados de tarefa e fase | COMPLETED | — | .ases/evidence/PHASE-02-verify.md<br>packages/contracts/test/state-machine.test.ts<br>packages/persistence/test/store.test.ts |
| TAR-0009 | PHASE-02 | Exportação JSONL e recuperação | COMPLETED | — | .ases/evidence/PHASE-02-verify.md<br>packages/persistence/test/export.test.ts<br>docs/DATA.md |
| TAR-0010 | PHASE-02 | Suíte transacional multiprocesso | COMPLETED | — | .ases/evidence/PHASE-02-verify.md<br>packages/persistence/test/multiprocess.test.ts |
| TAR-0011 | PHASE-03 | CLI shell ases/ases-tar + build + marca mínima | COMPLETED | — | .ases/evidence/PHASE-03-verify.md<br>test/e2e/bins.test.mjs<br>packages/branding/test/branding.test.ts |
| TAR-0012 | PHASE-03 | Servidor IPC local (UDS / Named Pipe) | COMPLETED | — | .ases/evidence/PHASE-03-verify.md<br>packages/ipc/test/ipc.test.ts<br>docs/ADRs/ADR-0003.md |
| TAR-0013 | PHASE-03 | Cliente IPC e assinatura de eventos | COMPLETED | — | .ases/evidence/PHASE-03-verify.md<br>packages/ipc/test/ipc.test.ts<br>docs/API.md |
| TAR-0014 | PHASE-03 | Monitor somente leitura | COMPLETED | — | .ases/evidence/PHASE-03-verify.md<br>packages/ipc/test/ipc.test.ts |
| TAR-0015 | PHASE-03 | E2E com dois processos reais | COMPLETED | — | .ases/evidence/PHASE-03-verify.md<br>test/e2e/two-processes.test.mjs |
| TAR-0016 | PHASE-04 | tui-shared: tema, marca, badges, painéis, ajuda | COMPLETED | — | .ases/evidence/PHASE-04-verify.md<br>packages/tui-shared/test/tui-shared.test.tsx<br>docs/ADRs/ADR-0011.md |
| TAR-0017 | PHASE-04 | ases: home + sessão TUI | COMPLETED | — | .ases/evidence/PHASE-04-verify.md<br>apps/ases-cli/test/tui.test.tsx<br>test/e2e/pty.test.mjs |
| TAR-0018 | PHASE-04 | ases-tar: overview + eventos ao vivo | COMPLETED | — | .ases/evidence/PHASE-04-verify.md<br>apps/ases-tar/test/tui.test.tsx<br>apps/ases-tar/test/projection.test.ts |
| TAR-0019 | PHASE-04 | ases-tar: detalhe da tarefa | COMPLETED | — | .ases/evidence/PHASE-04-verify.md<br>apps/ases-tar/test/tui.test.tsx |
| TAR-0020 | PHASE-04 | Acessibilidade, larguras e smoke em pty | COMPLETED | — | .ases/evidence/PHASE-04-verify.md<br>test/e2e/pty.test.mjs<br>docs/TUI-UX.md |
| TAR-0021 | PHASE-05 | DAG de dependências | COMPLETED | — | .ases/evidence/PHASE-05-verify.md |
| TAR-0022 | PHASE-05 | Leases com fencing e scheduler | COMPLETED | — | .ases/evidence/PHASE-05-verify.md |
| TAR-0023 | PHASE-05 | Git worktree por tarefa/attempt | COMPLETED | — | .ases/evidence/PHASE-05-verify.md |
| TAR-0024 | PHASE-05 | Fila de merge serializada | COMPLETED | — | .ases/evidence/PHASE-05-verify.md |
| TAR-0025 | PHASE-05 | Concorrência e recuperação do scheduler | COMPLETED | — | .ases/evidence/PHASE-05-verify.md |
| TAR-0026 | PHASE-05 | Evidências no banco e corte do .ases/ interino | COMPLETED | — | .ases/evidence/PHASE-05-verify.md |
| TAR-0027 | PHASE-06 | Contratos do provider-sdk (AgentProvider v1) | COMPLETED | — | docs/ADRs/ADR-0012.md<br>.ases/evidence/PHASE-06-verify.md |
| TAR-0028 | PHASE-06 | Simulador determinístico SIMULATED | COMPLETED | — | packages/provider-simulator/test/simulator.test.ts<br>.ases/evidence/PHASE-06-verify.md |
| TAR-0029 | PHASE-06 | Normalização de streams NDJSON | COMPLETED | — | packages/provider-sdk/test/stream.test.ts<br>.ases/evidence/PHASE-06-verify.md |
| TAR-0030 | PHASE-06 | Ciclo de vida do worker: spawn, timeout, cancelamento e árvore de processos | COMPLETED | — | packages/scheduler/test/worker.test.ts<br>packages/platform-core/test/process.test.ts<br>.ases/evidence/PHASE-06-verify.md |
| TAR-0031 | PHASE-06 | /run e /cancel ponta a ponta com ases-tar | COMPLETED | — | test/e2e/run.test.mjs<br>.ases/evidence/PHASE-06-verify.md<br>.ases/evidence/PHASE-06-verify.md |
| TAR-0032 | PHASE-07 | Pesquisa de flags e termos atuais (Claude Code, Codex) | COMPLETED | — | docs/PROVIDERS_PESQUISA.md |
| TAR-0033 | PHASE-07 | Adapter Claude Code (claude -p, stream-json) | COMPLETED | — | packages/provider-claude/test/claude.test.ts<br>.ases/evidence/PHASE-07-verify.md |
| TAR-0034 | PHASE-07 | Adapter Codex (codex exec --json) | COMPLETED | — | packages/provider-codex/test/codex.test.ts<br>.ases/evidence/PHASE-07-verify.md |
| TAR-0035 | PHASE-07 | Smoke opt-in com consentimento e transcript redigido | COMPLETED | — | .ases/evidence/TAR-0035-smoke-real.md |
| TAR-0036 | PHASE-07 | Matriz de limitações e doctor VERIFIED/SIMULATED/UNKNOWN | COMPLETED | — | docs/PROVIDERS.md<br>test/e2e/providers.test.mjs<br>.ases/evidence/PHASE-07-verify.md |
| TAR-0037 | PHASE-08 | Pesquisa de flags, ACP e termos (Kimi, OpenCode, Google) | COMPLETED | — | docs/PROVIDERS_PESQUISA_PHASE08.md |
| TAR-0038 | PHASE-08 | Cliente ACP comum e adapter Kimi (kimi acp) | COMPLETED | — | .ases/evidence/PHASE-08-verify.md |
| TAR-0039 | PHASE-08 | Adapter OpenCode (opencode acp) | COMPLETED | — | .ases/evidence/PHASE-08-verify.md<br>.ases/evidence/TAR-0041-smoke-real.md |
| TAR-0040 | PHASE-08 | Adapter Google (Gemini CLI) com capability honesta | COMPLETED | — | .ases/evidence/PHASE-08-verify.md<br>.ases/evidence/TAR-0041-smoke-real.md |
| TAR-0041 | PHASE-08 | Fixtures de teste e smoke opt-in | COMPLETED | — | .ases/evidence/TAR-0041-smoke-real.md<br>.ases/evidence/TAR-0041-smoke-real.md |
| TAR-0042 | PHASE-08 | Documentação de paridade dos cinco providers | COMPLETED | — | docs/PROVIDERS.md<br>docs/ADRs/ADR-0013.md |
| TAR-0043 | PHASE-09 | Importação e verificação das fontes ASES (REQ-001..300 literais + SHA-256) | COMPLETED | — | .ases/evidence/PHASE-09-verify.md |
| TAR-0044 | PHASE-09 | Fluxo de especificação ASES-500 (entrevista por lacunas, decisões) | COMPLETED | — | .ases/evidence/PHASE-09-verify.md |
| TAR-0045 | PHASE-09 | Matriz de requisitos (aplicabilidade, estado, evidência, N/A justificado) | COMPLETED | — | .ases/evidence/PHASE-09-verify.md |
| TAR-0046 | PHASE-09 | Rastreabilidade, gates G0/G1 e mudança controlada (CHANGE) | COMPLETED | — | .ases/evidence/PHASE-09-verify.md<br>docs/ADRs/ADR-0014.md |
| TAR-0047 | PHASE-09 | QA: projeto de exemplo da entrevista a 2 fases e 3 tarefas rastreáveis | COMPLETED | — | .ases/evidence/PHASE-09-verify.md |
| TAR-0048 | PHASE-10 | Policy engine: escopos, deny-by-default, approvals por hash com escopo e validade (/approval) | REVIEW | — | .ases/evidence/PHASE-10-verify.md<br>docs/ADRs/ADR-0015.md |
| TAR-0049 | PHASE-10 | SecretStore nativo (Keychain macOS, libsecret Linux; Windows explícito) | REVIEW | — | .ases/evidence/PHASE-10-verify.md |
| TAR-0050 | PHASE-10 | Skill registry: discovery, frontmatter seguro, hash, preview, import por referência | REVIEW | — | .ases/evidence/PHASE-10-verify.md |
| TAR-0051 | PHASE-10 | MCP bridge: discovery, inspeção, allowlist, health sob timeout, namespace | REVIEW | — | .ases/evidence/PHASE-10-verify.md |
| TAR-0052 | PHASE-10 | Plugin manager: scan de supply chain, compatibilidade, instalação delegada ao CLI oficial | REVIEW | — | .ases/evidence/PHASE-10-verify.md |
| TAR-0053 | PHASE-10 | Testes de segurança do gate (plugin inseguro, Claude-only, logs redigidos) | REVIEW | — | .ases/evidence/PHASE-10-verify.md |
| TAR-0054 | PHASE-11 | Handoff entre providers: continuidade da worktree, HANDOFF.md e pacote de contexto com budget | REVIEW | — | .ases/evidence/PHASE-11-verify.md<br>docs/ADRs/ADR-0016.md |
| TAR-0055 | PHASE-11 | Usage por provider com proveniência, sem somar providers (/usage) | REVIEW | — | .ases/evidence/PHASE-11-verify.md |
| TAR-0056 | PHASE-11 | Revisão independente read-only por outro provider (/review) | REVIEW | — | .ases/evidence/PHASE-11-verify.md |
| TAR-0057 | PHASE-11 | Recovery: /resume recupera tentativas interrompidas sem duplicar | REVIEW | — | .ases/evidence/PHASE-11-verify.md |
| TAR-0058 | PHASE-11 | Test runs reais (/test com EXEC_TESTS) e gate de troca de provider | REVIEW | — | .ases/evidence/PHASE-11-verify.md |

COMPLETED exige evidência ou test run aprovado (o engine recusa o contrário). NOT_RUN ≠ PASS.
