# STATUS

Gerado pelo engine a partir do banco (`.ases/db/ases.sqlite`). Último evento: seq 902 (TaskCreated, 2026-11-25T03:19:15.890Z)

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
| PHASE-10 | Segurança e registry de extensões | COMPLETED |
| PHASE-11 | Continuidade, métricas e review | COMPLETED |
| PHASE-12 | Daemon local, portabilidade final e release multiplataforma | COMPLETED |
| PHASE-15 | Portabilidade Windows e Linux verificada | COMPLETED |
| PHASE-16 | Eureka42 Branding, UX portátil e release estável | COMPLETED |
| PHASE-13 | Brain, Swarm, Arena e recursos avançados (pós-MVP) | PLANNED |
| PHASE-14 | Time Machine, Digital Twin e Learning Engine | PLANNED |
| PHASE-17 | Manutenção 1.0.x | COMPLETED |
| PHASE-18 | Chat com IA principal e orquestração em paralelo (1.1.0) | COMPLETED |
| PHASE-19 | Manutenção 1.1.x: conversa no estilo do Claude Code e ases-tar com quem faz o quê | COMPLETED |
| PHASE-20 | Manutenção 1.1.2: abertura limpa e modo explicado | COMPLETED |
| PHASE-21 | Cursor como IA do AER (1.2.0) | COMPLETED |
| PHASE-22 | Cursor seguro e verificado (1.2.1) | COMPLETED |
| PHASE-23 | /iniciar-projeto: metodologia guiada (1.3.0) | COMPLETED |
| PHASE-24 | Listas de modelos atualizadas (1.3.1) | PLANNED |

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
| TAR-0048 | PHASE-10 | Policy engine: escopos, deny-by-default, approvals por hash com escopo e validade (/approval) | COMPLETED | — | .ases/evidence/PHASE-10-verify.md<br>docs/ADRs/ADR-0015.md |
| TAR-0049 | PHASE-10 | SecretStore nativo (Keychain macOS, libsecret Linux; Windows explícito) | COMPLETED | — | .ases/evidence/PHASE-10-verify.md |
| TAR-0050 | PHASE-10 | Skill registry: discovery, frontmatter seguro, hash, preview, import por referência | COMPLETED | — | .ases/evidence/PHASE-10-verify.md |
| TAR-0051 | PHASE-10 | MCP bridge: discovery, inspeção, allowlist, health sob timeout, namespace | COMPLETED | — | .ases/evidence/PHASE-10-verify.md |
| TAR-0052 | PHASE-10 | Plugin manager: scan de supply chain, compatibilidade, instalação delegada ao CLI oficial | COMPLETED | — | .ases/evidence/PHASE-10-verify.md |
| TAR-0053 | PHASE-10 | Testes de segurança do gate (plugin inseguro, Claude-only, logs redigidos) | COMPLETED | — | .ases/evidence/PHASE-10-verify.md |
| TAR-0054 | PHASE-11 | Handoff entre providers: continuidade da worktree, HANDOFF.md e pacote de contexto com budget | COMPLETED | — | .ases/evidence/PHASE-11-verify.md<br>docs/ADRs/ADR-0016.md |
| TAR-0055 | PHASE-11 | Usage por provider com proveniência, sem somar providers (/usage) | COMPLETED | — | .ases/evidence/PHASE-11-verify.md |
| TAR-0056 | PHASE-11 | Revisão independente read-only por outro provider (/review) | COMPLETED | — | .ases/evidence/PHASE-11-verify.md |
| TAR-0057 | PHASE-11 | Recovery: /resume recupera tentativas interrompidas sem duplicar | COMPLETED | — | .ases/evidence/PHASE-11-verify.md |
| TAR-0058 | PHASE-11 | Test runs reais (/test com EXEC_TESTS) e gate de troca de provider | COMPLETED | — | .ases/evidence/PHASE-11-verify.md |
| TAR-0059 | PHASE-12 | ADR do motor residente e supervisores (launchd, systemd, Windows) | COMPLETED | — | .ases/evidence/PHASE-12-verify.md |
| TAR-0060 | PHASE-12 | Lifecycle do motor residente: start/stop/status, TUI sai sem perder tarefas | COMPLETED | — | .ases/evidence/PHASE-12-verify.md |
| TAR-0061 | PHASE-12 | Pacote npm único com os dois bins, instalação, atualização e uninstall limpos | COMPLETED | — | .ases/evidence/PHASE-12-verify.md |
| TAR-0062 | PHASE-12 | Matriz CI de OS e arquiteturas com smoke do pacote instalado (bash, zsh, PowerShell) | COMPLETED | — | .ases/evidence/PHASE-12-verify.md |
| TAR-0063 | PHASE-12 | Hardening E2E, docs por SO e auditoria do DoD (P0 sem exceção aberta) | COMPLETED | — | docs/AUDITORIA_P0.md<br>.ases/evidence/PHASE-12-verify.md |
| TAR-0064 | PHASE-12 | Fecha 5 P0 da auditoria (095, 097, 027, 171, 048) e registra as exceções aprovadas | COMPLETED | — | docs/AUDITORIA_P0.md<br>.ases/evidence/PHASE-12-verify.md |
| TAR-0065 | PHASE-15 | SecretStore Windows (Credential Manager, segredo só por stdin, falha fechado) | COMPLETED | — | .ases/evidence/PHASE-15-verify.md |
| TAR-0066 | PHASE-15 | ACL do runtime dir e do Named Pipe no Windows verificadas (icacls) | COMPLETED | — | .ases/evidence/PHASE-15-verify.md |
| TAR-0067 | PHASE-15 | Caminhos Windows: UNC, junction, letra de unidade, acentos e espaços | COMPLETED | — | .ases/evidence/PHASE-15-verify.md |
| TAR-0068 | PHASE-15 | Matriz de suporte publicada por SO/arquitetura com PASS/FAIL/NOT_RUN e doctor | COMPLETED | — | .ases/evidence/PHASE-15-verify.md |
| TAR-0069 | PHASE-15 | TUI em ConPTY/Windows Terminal ou registro NOT_RUN honesto | CANCELLED | — | docs/SUPORTE_TERMINAIS_WINDOWS.md |
| TAR-0070 | PHASE-16 | TUI em ConPTY/Windows Terminal: roteiro manual do responsável ou harness automático (vem da TAR-0069) | COMPLETED | — | test/e2e/conpty.test.mjs<br>.ases/evidence/PHASE-16-verify.md |
| TAR-0071 | PHASE-16 | Profundidade de cor: truecolor, 256 e 16 cores pelo terminal | COMPLETED | — | .ases/evidence/PHASE-16-verify.md |
| TAR-0072 | PHASE-16 | Tema de alto contraste e tema auto, com razão de contraste medida | COMPLETED | — | .ases/evidence/PHASE-16-verify.md |
| TAR-0073 | PHASE-16 | Precedência de tema e logo: CLI > projeto > global > padrão | COMPLETED | — | .ases/evidence/PHASE-16-verify.md |
| TAR-0074 | PHASE-16 | Sem animação nas TUIs (verificação automática) e larguras 40/50/80/120 nas duas TUIs | COMPLETED | — | .ases/evidence/PHASE-16-verify.md |
| TAR-0075 | PHASE-16 | Gate de release cross-platform: matriz, pacote por plataforma e notas de versão | COMPLETED | — | docs/RELEASE_NOTES_RASCUNHO.md<br>docs/RELEASE_NOTES_1.0.0.md<br>docs/MATRIZ_SUPORTE.md<br>.ases/evidence/PHASE-16-verify.md |
| TAR-0076 | PHASE-17 | Windows: providers instalados por npm (shim .cmd) executados sem shell | COMPLETED | — | .ases/evidence/PHASE-17-verify.md |
| TAR-0077 | PHASE-17 | Worktrees em paralelo: git worktree add/remove serializados por repositório | COMPLETED | — | .ases/evidence/PHASE-17-verify.md |
| TAR-0078 | PHASE-18 | Banner EUREKA42 verde, tema green, /sobre e eureka42.org | COMPLETED | — | .ases/evidence/PHASE-18-verify.md |
| TAR-0079 | PHASE-18 | Config chat por camadas (principal, modo, limites, revisão, teste, autorizações) | COMPLETED | — | .ases/evidence/PHASE-18-verify.md |
| TAR-0080 | PHASE-18 | Eventos, migração 5 e store da conversa | COMPLETED | — | .ases/evidence/PHASE-18-verify.md |
| TAR-0081 | PHASE-18 | Simulador de chat e múltiplos simuladores | COMPLETED | — | .ases/evidence/PHASE-18-verify.md |
| TAR-0082 | PHASE-18 | Parser aer-plan e atribuição explicada de IAs | COMPLETED | — | .ases/evidence/PHASE-18-verify.md |
| TAR-0083 | PHASE-18 | Ponto de restauração e /desfazer | COMPLETED | — | .ases/evidence/PHASE-18-verify.md |
| TAR-0084 | PHASE-18 | Turno de chat da principal com fila | COMPLETED | — | .ases/evidence/PHASE-18-verify.md |
| TAR-0085 | PHASE-18 | Execução do plano: paralelo, testes, refação, troca automática e revisão cruzada | COMPLETED | — | .ases/evidence/PHASE-18-verify.md |
| TAR-0086 | PHASE-18 | Comandos simples em português com aliases | COMPLETED | — | .ases/evidence/PHASE-18-verify.md |
| TAR-0087 | PHASE-18 | TUI de chat, menu /, plano, autorização e assistente | COMPLETED | — | .ases/evidence/PHASE-18-verify.md |
| TAR-0088 | PHASE-18 | ases update e /atualizar | COMPLETED | — | .ases/evidence/PHASE-18-verify.md |
| TAR-0089 | PHASE-18 | Bins, documentação, e2e do chat e release 1.1.0 | COMPLETED | — | .ases/evidence/PHASE-18-verify.md |
| TAR-0090 | PHASE-19 | Conversa legível, atividades ao vivo, diff do que mudou, pensando com tempo, ases-tar com IA e ação por tarefa, assistente com híbrido e teste digitado | COMPLETED | — | .ases/evidence/PHASE-19-verify.md |
| TAR-0091 | PHASE-20 | Tela limpa ao abrir, pergunta da pasta antes do logo, modo do assistente explicado | COMPLETED | — | .ases/evidence/PHASE-20-verify.md |
| TAR-0092 | PHASE-21 | Adaptador do Cursor CLI (stream-json, sandbox, shell bloqueado, modelos, login) | COMPLETED | — | .ases/evidence/PHASE-21-verify.md |
| TAR-0093 | PHASE-22 | Regra deny Shell(*) durante a execução do Cursor, acesso fora do projeto como violação, smoke real e VERIFIED | COMPLETED | — | .ases/evidence/PHASE-22-verify.md |
| TAR-0094 | PHASE-23 | /iniciar-projeto: Git, fontes, ASES-500 guiada, requisitos, ASES-300, G1 e GitHub privado | COMPLETED | — | .ases/evidence/PHASE-23-verify.md |
| TAR-0095 | PHASE-24 | Listas de modelos do /modelo: Claude 5.5, Codex GPT-6/5.6, Kimi K3.1 (IDs da CLI) | PLANNED | — | — |

COMPLETED exige evidência ou test run aprovado (o engine recusa o contrário). NOT_RUN ≠ PASS.
