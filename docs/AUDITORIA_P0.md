# Auditoria dos requisitos P0 sem tarefa rastreada (TAR-0063, 23/11/2026)

**Contexto:** no `TRACEABILITY.csv`, 43 dos 144 AER-REQ P0 não estavam ligados a nenhuma tarefa. O §21.3 do DoD exige "nenhum P0 aberto sem justificativa e aprovação de exceção". Cada item abaixo foi verificado no código e nos testes desta data.

**Legenda:**
- **COBERTO:** há teste ou checagem automática.
- **PARCIAL:** parte coberta, lacuna declarada.
- **NÃO IMPLEMENTADO:** exige implementar, ou uma exceção aprovada pelo responsável.

## COBERTO (31: 26 na auditoria + 5 implementados em 24/11/2026)
| REQ | Evidência |
|---|---|
| 008 desinstalar sem excluir projetos | `scripts/pack-smoke.mjs`, CI nos 8 alvos: "uninstall não apaga dados do projeto" |
| 009 sem servidor HTTP/navegador | Regra `no-network-server` em `scripts/check-boundaries.mjs` + `test/boundaries.test.mjs`. O único listener é o IPC local (UDS/Named Pipe) |
| 012 localizar a raiz do projeto | `packages/project-store/test/project-store.test.ts` "finds the root from a subdirectory". Root via symlink: não testado |
| 015 CONFIG.json sem valores de segredo | Segredos só no SecretStore, por keyId. `test/e2e/security.test.mjs` varre **todos** os arquivos do `.ases/` (inclusive CONFIG.json) atrás do token |
| 017 init respeita arquivos existentes | project-store.test "second run changes no byte, keeps user edits and user files" |
| 019 ID estável ao renomear a pasta | project-store.test "project id survives renaming/moving the folder" (novo) |
| 023 PHASE.md com escopo/critérios/dependências | `PHASE.md` gerado pelo engine; `test/e2e/methodology.test.mjs` |
| 024 fase não conclui com tarefa pendente | `packages/persistence/test/store.test.ts` "phase cannot complete with open tasks" |
| 028 fases referenciam requisitos | `PHASE.md` "Requisitos da fase" (união das tarefas); e2e da metodologia |
| 030 relatório ao concluir a fase | `PHASE.md` "Relatório de conclusão" (testes, evidências, exceções) |
| 032 TASK.md com objetivo/escopo/critérios/dependências | `TASK.md` gerado; e2e da metodologia (requisitos com aceite) |
| 034 nova tentativa não sobrescreve a anterior | `packages/scheduler/test/continuity.test.ts`, `test/e2e/continuity.test.mjs` (ATT-0001 e ATT-0002 preservadas) |
| 035 provider por tentativa | `TASK.md` "Tentativas" (provider por attempt); continuity.test |
| 038 tarefa concluída só reabre com auditoria | `packages/contracts/test/state-machine.test.ts`: COMPLETED é terminal; reabrir = nova tarefa + CHANGE |
| 040 cancelamento reconcilia processo e worktree | `test/e2e/run.test.mjs` (/cancel → CANCELLED após reconciliação), `test/e2e/daemon.test.mjs` (neto encerrado) |
| 054 escrita no checkout principal | Agentes só rodam em worktree; worker.test "nada no checkout principal" |
| 058 checkpoint com refs verificáveis | Commit por tentativa em `ases/TAR/ATT`; `merge-base --is-ancestor` nos testes de continuidade |
| 066 logs sem chaves | `test/e2e/security.test.mjs` (varredura do `.ases/`), testes de `redactText` |
| 122 chaves no SecretStore nativo | `packages/platform-core/test/secrets.test.ts` (Keychain isolado; Linux sem D-Bus falha fechado; Windows indisponível) |
| 129 AER não destrói sessão do CLI oficial | O AER não tem login/logout e nunca chama `logout` dos clientes; os probes são só `--version` e status (testes dos adapters) |
| 163 sem flags de permissão irrestrita | `claude.test.ts`, `codex.test.ts`, `acp.test.ts` ("never --dangerously-*") |
| 165 sem interpolação de shell | Regras `no-shell-true`/`no-child-process-exec` + `test/boundaries.test.mjs`; `spawn` com `shell:false` |
| 167 texto de ferramenta não eleva instrução | `acp.test.ts` "prompt injection (fixture MALICIOUS.md)" (novo): `execute` continua negado; o handoff é marcado como dado |
| 172 update sem perder dados | `packages/persistence/test/migrations.test.ts` (backup verificado antes, rollback de migração falha, recusa banco mais novo) |
| 238 doctor reporta suporte por SO | `test/e2e/bins.test.mjs`, `providers.test.mjs` (sem os CLIs no PATH), CI nos 3 SOs |
| 250 imagem de marca preservada, sem fontes tipográficas | CI `shasum -c branding/MANIFESTO_IMAGENS_SHA256.txt`; `scripts/pack.mjs` recusa .ttf/.otf/.woff no pacote |

## PARCIAL (8): EXCEÇÃO APROVADA pelo responsável em 24/11/2026, lacuna registrada para depois do MVP
| REQ | O que existe | Lacuna |
|---|---|---|
| 025 bloqueio de fase explícito | Motivo e tarefas pendentes no `PHASE.md` | O `ases-tar` não mostra o motivo |
| 048 rate limit adia o provider | `RATE_LIMITED` → tarefa BLOCKED; não há retry automático, então não há loop | Sem cooldown temporizado |
| 049 retry com limite e backoff | Não existe retry automático (nenhum loop possível) | `maxAttempts` do CONFIG não é lido |
| 082 escolher provider por comando | `--provider` na tarefa e `/handoff` para trocar | Sem `/agent` |
| 086 operação pendente com risco e efeito | `/approval` mostra escopo, sujeito e efeito | Sem nível de risco; sem modal na TUI |
| 128 MCP/providers só com escopos aprovados | Instalar/iniciar extensão exige aprovação por hash | MCP não é carregado nas sessões, então não há pedido de escopo extra para testar |
| 171 timeouts e limites de bytes | Timeout com a árvore encerrada; linha NDJSON ≤ 1 MiB (`LINE_TOO_LONG`) | Sem teto de bytes **totais** de stdout |
| 174 nada sai para terceiros por padrão | Sem telemetria; sem servidor; só o provider escolhido | Sem teste de rede com endpoint falso |
| 230 caminhos Windows/POSIX | Espaços e Unicode em todos os e2e (`ç`, `ã`) nos 3 SOs | UNC, junction, `subst` e DACL testados no Windows real desde a PHASE-15 (`test/e2e/windows-paths.test.mjs`); SMB remoto não testado |
| 234 TUI sem navegador nos terminais | pty em macOS/Linux; modo linha sem TTY nos 3 SOs (CI) | ConPTY/Windows Terminal testado desde a PHASE-16 (`test/e2e/conpty.test.mjs`); conhost antigo só no roteiro manual |

## NÃO IMPLEMENTADO (4): EXCEÇÃO APROVADA pelo responsável em 24/11/2026, fica para depois do MVP
| REQ | Situação |
|---|---|
| 020 precedência de config (global/projeto/execução) | O `CONFIG.json` existe, mas o engine não lê camadas de config |
| 026 novo plano gera evento e arquivo (`/plan`, §13.5) | `/plan` sem fase alocada |
| 027 reordenar fases sem renumerar | `sort_order` existe no banco; não há comando |
| 029 mudança de fase com CHANGE e diff de plano | CHANGE existe para requisitos e decisões, não para o plano de fases |
| 083 modos auto/manual/hybrid | Não implementado (sem fase alocada) |
| 095 `ases-tar --errors` | Declarado como não implementado na ajuda do `ases-tar` |
| 097 visualizar diff não modifica a worktree | Não existe `/diff`; o diff interno (`git diff --stat`) é só leitura |

Os 2 P0 "em aberto com tarefa" são os da própria PHASE-12 (004/232: pacote npm; 233: CI) e fecham com ela.
