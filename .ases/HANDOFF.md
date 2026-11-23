# Handoff AER

<!-- AUTO:BEGIN (gerado pelo engine do AER; não editar) -->
- Último evento válido: seq 233 em 2026-11-23T14:28:05.311Z
- Git: branch `ases/PHASE-07`, HEAD `9b2bb10`
- Concluídas: 31 de 36
- Abertas: TAR-0032 (REVIEW), TAR-0033 (PLANNED), TAR-0034 (PLANNED), TAR-0035 (PLANNED), TAR-0036 (PLANNED)
- Comando para retomar: `ases` nesta pasta (ou `ases --no-tui` em scripts); monitor: `ases-tar`
<!-- AUTO:END -->

## Notas da sessão

(editar ao fim de cada sessão)

### Sessão 22/11/2026 — PHASE-01
- **Feito:** monorepo npm workspaces (ADR-0001); `@aer/contracts`; `@aer/platform-core` + adapters macOS/Windows/Linux; lint de fronteiras; vitest; workflow CI; `.ases/` via `scripts/ases-dev.mjs`; docs PRODUCT/ARCHITECTURE.
- **Testes realmente executados (macOS arm64, Node 22.19.0):** `npm run verify` → lint OK, typecheck OK, 34/34 testes PASS. `ases-dev verify` → 13 eventos, 0 problemas. Hashes das fontes OK.
- **NÃO executados:** CI em Windows/Linux/macOS (sem remoto); qualquer teste em Windows/Linux real; bins `ases`/`ases-tar` (não existem).
- **Decisões aprovadas:** npm workspaces em vez de pnpm; `npm install` local.
- **Riscos:** `.npmrc` com `legacy-peer-deps` (bug do npm 10.9), então peers precisam ser declarados à mão; nome de arquivo com `:` quebra o checkout no Windows; histórico JSONL interino (não é SQLite).
- **Próxima operação segura:** revisão humana, depois primeiro commit, ver `NEXT-STEPS.md`.

### Sessão 22/11/2026 — PHASE-02 (branch `ases/PHASE-02`)
- **Feito:**
  - ADR-0002 (`node:sqlite`).
  - `@aer/persistence`: migração v1, backup `VACUUM INTO`, `ProjectStore` com CAS + evento na mesma transação, IDs globais, eventos append-only (triggers), idempotência por `eventId`, snapshot com cursor, paginação, export/verify JSONL.
  - Contratos: hash canônico, envelope de evento, payloads críticos, máquina de estados §5.1/§5.2.
  - Código passou a usar imports `.ts` (type stripping nativo do Node ≥ 22.18; `engines` atualizado).
- **Testes realmente executados (macOS arm64, Node 22.19.0, SQLite 3.50.4):** `npm run verify` → 64/64 PASS. Suíte multiprocesso (8 escritores, corrida de 10, crash antes do COMMIT) → PASS 3x seguidas.
- **Defeito real achado e corrigido:** lacuna de `seq` com `ON CONFLICT DO NOTHING` + AUTOINCREMENT.
- **NÃO executados:** Windows/Linux reais; CI.
- **Riscos:** `node:sqlite` experimental (aviso suprimido; ADR-0002); o banco ainda não está conectado ao `.ases/` real deste projeto (corte na PHASE-03).

### Sessão 22/11/2026 — PHASE-03 (branch `ases/PHASE-03`)
- **Feito:**
  - `packages/ipc` (JSON-RPC NDJSON, handshake, papéis control/monitor, subscribe sem corrida, backpressure, timeouts).
  - `packages/project-store` (`init` não destrutivo, sessão `0600`, loader do adapter).
  - `packages/branding` (marca mínima).
  - `apps/ases-cli` (engine embutido como escritor único + modo linha + `init`/`doctor`) e `apps/ases-tar` (texto/JSONL, filtros, reconexão).
  - Build `tsc -b`; ADR-0003; `docs/API.md`.
- **Testes realmente executados (macOS arm64, Node 22.19.0):**
  - `npm run verify` → 101/101 PASS (3 execuções seguidas).
  - E2E com processos reais: evento do `ases` visto no `ases-tar`, segundo `ases` recusado, crash por SIGKILL + reinício sem lacuna/duplicata, filtro `--task`, saída JSONL/texto sem ANSI.
  - Pty via `script`: cor, `NO_COLOR` e fallback ASCII conferidos.
- **Defeitos reais corrigidos:** `ases` não saía após `/exit` com stdin em pipe; pty com 0 colunas.
- **NÃO executados:** Windows/Linux reais; terminal interativo humano; CI.
- **Riscos:** Named Pipe sem ACL verificada (Windows); `.ases/` deste repo continua interino (engine recusa abri-lo); espelho JSONL reescrito inteiro a cada mutação.

### Sessão 22/11/2026 — CHANGE-0001/0002 + PHASE-04 (branch `ases/PHASE-04`)
- **Decisões confirmadas:**
  - CHANGE-0001: macOS Intel fora do escopo; alvos = darwin-arm64, win32, linux; AER-REQ-003 = N/A.
  - CHANGE-0002: PNG de marca renomeado (o `:` era inválido no Windows), bytes idênticos.
  - Instalação de ink/react autorizada.
- **Feito:**
  - `@aer/tui-shared`.
  - TUI do `ases` (sessão + painel + prompt com histórico + ajuda + Ctrl+C duplo; modo linha fora de TTY).
  - TUI do `ases-tar` (projeção local, eventos ao vivo, detalhe, `r` relê, filtros).
  - Guarda de alvo suportado.
  - CI corrigido (build antes dos E2E; Node 22/24; arm64 condicional).
  - ADR-0011; `docs/TUI-UX.md` com quadros reais.
- **Testes realmente executados (darwin-arm64, Node 22.19.0):** `npm run verify` → 128/128 PASS (127/127 em 3 execuções seguidas antes dos últimos ajustes). E2E em pty real (macOS `script`): TUI do `ases` cria fase por teclado e sai com Ctrl+C duplo; TUI do `ases-tar` mostra LIVE + evento e sai com `q`; `NO_COLOR` sem códigos de cor.
- **NÃO executados:** Linux/Windows reais; terminais humanos; CPU em repouso.
- **Riscos:**
  - `.npmrc` `legacy-peer-deps` (o peer opcional `react-devtools-core` do Ink não é instalado; só é usado com `DEV=true`).
  - A reticência `…` do Ink no modo ASCII.
  - O `.ases/` deste repositório continua interino.

### Sessão 22/11/2026 — publicação, CI real, PHASE-05 e corte
- **Repositório:** `eureka42-ai/ases-cli` (privado). CI no GitHub Actions: macOS arm64, Windows x64/arm64, Ubuntu x64/arm64; Node 22 e 24.
- **Primeiro CI real:** 8/8 falhando, por 4 causas reais, todas corrigidas:
  - Ink em CI só desenha o último quadro;
  - o harness do pty não matava o grupo de processos;
  - CRLF quebrava o hashbang no Windows;
  - EBUSY ao apagar bancos abertos no Windows.
  - Depois disso, 8/8 verdes.
- **PHASE-05** (scheduler, leases com fencing, worktrees, fila de merge, gate de evidência, corte): CI 8/8 verde (run 45095195993). Windows com 6 testes NOT_RUN (pty e só-POSIX).
- **Corte do `.ases/`:** `ases migrate-interim` importou 157 eventos (prefixo byte a byte preservado), 5 fases, 26 tarefas e 56 evidências. A partir do seq 159 o engine é o escritor.
- **Achado operacional:** `~/Desktop` sincronizado pelo iCloud gerou 15 cópias de conflito (" 2") de arquivos do `.ases/`; estavam desatualizadas e foram apagadas. O projeto foi clonado em `~/Projetos/eureka42/ases-cli`, e o `doctor` e o início do `ases` agora avisam sobre pastas sincronizadas.

### Sessão 23/11/2026 — PHASE-06 (branch `ases/PHASE-06`, sem commit)
- **Feito:**
  - `@aer/provider-sdk`: contrato `AgentProvider` v1, NDJSON incremental, normalização estrita e redação.
  - `@aer/provider-simulator`: processo Node real com cenários, sempre SIMULATED.
  - `spawnManagedProcess`/`terminateProcessTree` no PlatformAdapter.
  - `runAttempt`/`runQueue` no scheduler.
  - `/run`, `/cancel` e `/task new --reqs/--provider/--resources` no `ases`; saída cancela e reconcilia.
  - ADR-0012.
- **Testes realmente executados (darwin-arm64, Node 22.19.0):** `npm run verify` → 188/188 PASS, e mais 3 rodadas → 188/188. `ases-dev verify` → 0 problemas.
- **CI:** run 45191096847 (98d1889) com 4/8 falhas. Corrigidas: `/cancel` no modo linha, backup com nome colidindo entre processos, BUSY no `BEGIN IMMEDIATE`. Run 45192505934 (7adb48b): **8/8 verde** (188, ou 181 + 7 pulados no Windows).
- **NÃO executados:** providers reais; caminho SIGINT no Windows.
- **Estado:** aprovadas pelo responsável em 23/11/2026; `ases/PHASE-06` integrada em `main` por fast-forward (343f25a); TAR-0027..0031 e PHASE-06 COMPLETED.
- **Riscos:**
  - Engine morto com SIGKILL deixa o agente órfão (supervisor na PHASE-12).
  - No Windows, só o pid raiz é confirmado após `taskkill`.
  - Pedido de aprovação = BLOCKED até `/approval` (PHASE-10).
- **Próxima operação segura:** PHASE-07 (ver NEXT-STEPS).
