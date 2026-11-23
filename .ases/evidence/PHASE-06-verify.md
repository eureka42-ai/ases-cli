# PHASE-06 — verificação (2026-11-23, sessão Claude Code)

**Ambiente realmente usado:** darwin-arm64, Node v22.19.0, git 2.50.1, branch `ases/PHASE-06` (sem commit no momento da medição).

## `npm run verify` (lint + typecheck + build + testes)
```text
> node scripts/check-boundaries.mjs
boundaries: OK
 Test Files  33 passed (33)
      Tests  188 passed (188)
exit=0
```
Suíte completa repetida mais 3 vezes: 188/188 nas três. Depois das execuções, nenhum processo `hang` do simulador ficou vivo (`ps`: 0).

## Testes novos desta fase (29, todos PASS)
| Tarefa | Arquivo | O que prova |
|---|---|---|
| TAR-0027 | `packages/provider-simulator/test/simulator.test.ts` (probe) | contrato v1, capacidades com fonte e data (AER-REQ-101/110) |
| TAR-0028 | `packages/provider-simulator/test/simulator.test.ts` | determinismo; probe só com `--version` (falso binário registra as chamadas, AER-REQ-102); versão não suportada bloqueia (103); simulador ausente → PROVIDER_UNAVAILABLE (108) |
| TAR-0029 | `packages/provider-sdk/test/stream.test.ts` | NDJSON byte a byte com UTF-8 cortado (104); JSON inválido/linha longa; formato desconhecido = PARSE_ERROR; agente não pode declarar `exit`; redação |
| TAR-0030 | `packages/platform-core/test/process.test.ts`, `packages/scheduler/test/worker.test.ts` | `; rm` literal com shell:false (109); exit code real (105); neto morto após terminateProcessTree (106); destinos FAILED/BLOCKED/CANCELLED/REVIEW; AUTH_EXPIRED ≠ RATE_LIMITED (107); fuga de path bloqueada |
| TAR-0031 | `test/e2e/run.test.mjs` | bins reais: `/run --parallel 2` com A e B em paralelo e C esperando A; `ases-tar` (outro processo) recebe eventos `simulated: true`; branches `ases/TAR-*/ATT-*`; SIGINT cancela a tarefa `hang` e informa |

## Defeitos reais encontrados durante a fase
1. Pipes são assíncronos no macOS: `process.exit` logo depois de `stdout.write` podia truncar a saída do simulador → o simulador espera o flush.
2. Otimização própria (pular o espelho quando o `seq` não muda) deixava STATUS.md velho, porque `recordArtifact` não gera evento (pego pelo `cutover.test.mjs`) → revertida; o worker ganhou um caminho de leitura que não republica.
3. `engine.info.lastSeq` depois de `stop()` leria um banco fechado → `stop()` devolve o seq final.

## CI run 45191096847 (commit 98d1889): 4/8 falharam, corrigido em seguida
Linux 3/3 e macOS Node 24 passaram. Falharam:
- **Windows (3 alvos), `test/e2e/run.test.mjs`:** o teste mandava SIGINT ao `ases`; o Windows não entrega SIGINT, o processo era morto.
  O teste expôs um defeito de produto: no modo linha, `/cancel` ficava na fila atrás do `/run`.
  Correção: `/run` roda em segundo plano, `/cancel` responde na hora, e `/exit` e o fim da entrada esperam os runs. O E2E usa `/cancel` em todos os SOs; o caminho por SIGINT só roda fora do Windows.
- **macOS Node 22, `migrations.test.ts` (PHASE-02):** dois processos migrando no mesmo milissegundo geravam o mesmo nome de backup e o `VACUUM INTO` colidia (`table projects already exists`).
  Reprodução local: 9 erros em 40 rodadas de 6 processos. Correção: nome com pid e sufixo aleatório. Depois da correção: 0 erros em 40 rodadas.
- **Windows arm64, `multiprocess.test.ts` (PHASE-02):** `BEGIN IMMEDIATE` devolveu BUSY sem passar pelo `busy_timeout`. Correção: `ProjectStore.tx` usa o mesmo `withBusyRetry` da abertura.

Depois das correções, local: `npm run verify` 188/188; os testes de concorrência e o E2E do `/run` passaram 15 vezes seguidas (antes, 1 falha em 15).

## CI run 45192505934 (commit 7adb48b): 8/8 verde
| alvo / Node | testes |
|---|---|
| darwin-arm64 22.x / 24.x | 188 passed (188) |
| linux-x64 22.x / 24.x | 188 passed (188) |
| linux-arm64 22.x | 188 passed (188) |
| win32-x64 22.x / 24.x | 181 passed, 7 skipped (188) |
| win32-arm64 22.x | 181 passed, 7 skipped (188) |

Os 7 pulados no Windows são anteriores a esta fase: 3 E2E em pty, 3 só-POSIX (0700, 0600, socket órfão) e o teste do iCloud Desktop (d17d37b). Ficam **NOT_RUN** no Windows.
Os 4 testes de processo desta fase (`process.test.ts`, inclusive o neto encerrado via `taskkill /T`), o worker e o E2E do `/run` (com `/cancel`) **rodaram e passaram** nos três Windows.

## NÃO executados (NOT_RUN, não é PASS)
- O caminho SIGINT do E2E não roda no Windows (o SO não entrega SIGINT a processo filho).
- No Windows, `terminateProcessTree` confirma apenas o pid raiz após `taskkill /T`.
- Providers reais: nenhum (PHASE-07). Nenhuma IA, rede ou custo foi usado; toda saída de agente é `SIMULATED`.
