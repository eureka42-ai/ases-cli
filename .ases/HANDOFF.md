# Handoff AER

<!-- AUTO:BEGIN (gerado pelo engine do AER; não editar) -->
- Último evento válido: seq 914 em 2026-11-25T03:30:05.441Z
- Git: branch `ases/PHASE-24`, HEAD `d63f921`
- Concluídas: 94 de 95
- Abertas: nenhuma
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

### Sessão 23/11/2026 — PHASE-07 parcial (branch `ases/PHASE-07`)
- **Feito:**
  - TAR-0032: pesquisa (`docs/PROVIDERS_PESQUISA.md`).
  - TAR-0033/0034: `@aer/provider-claude` e `@aer/provider-codex`, contrato UNVERIFIED.
  - TAR-0036: `ases doctor` com estado de contrato, `docs/PROVIDERS.md`.
  - `/run --consent`: sem aceite nada roda, nem o probe. Paralelismo 1 por provider real. Credenciais isoladas por provider.
  - `runAgentProcess` comum ao simulador e aos adapters.
- **Nenhuma chamada real a provider:** sem consentimento para consumir cota. Os testes usam falsos binários com o formato documentado.
- **Testes:** `npm run verify` 211/211 (darwin-arm64), e mais 2 rodadas 211/211.
- **Atualização (mesma data):** o responsável deu todos os consentimentos (cota e termos, para uso local). TAR-0035 feita: 6 chamadas reais mínimas + smoke pelo motor (`claude` e `codex` → REVIEW, com commit na worktree). Fixtures reais redigidas versionadas. Contrato VERIFIED só em claude 2.1.330 e codex 0.170.0. `rate_limit_event` mapeado. Achado: o Codex pode editar via shell sem emitir `file_change`; o diff da worktree é a fonte autoritativa. Evidência: `.ases/evidence/TAR-0035-smoke-real.md`. `npm run verify` 215/215.
- **Fechamento:** o responsável aprovou e autorizou a integração. Fast-forward de `main` para `ca47806`; TAR-0032..0036 e PHASE-07 COMPLETED. CI Linux/Windows 6/6 (run 45220306651), depois de corrigir dois flakes de teste: Ctrl+C no pty antes do raw mode do Ink, e EBUSY na limpeza de temp no Windows. macOS sem runner no CI; verificado só localmente (215/215).
- **Próxima operação segura:** iniciar a PHASE-08 numa branch `ases/PHASE-08`.

### Sessão 23/11/2026 — PHASE-08 parcial (branch `ases/PHASE-08`)
- **Feito:**
  - TAR-0037: pesquisa (`docs/PROVIDERS_PESQUISA_PHASE08.md`). O `kimi --print` aprova tudo sozinho, e por isso o AER usa ACP.
  - TAR-0038/39/40: `@aer/provider-acp` (cliente ACP v1, política de permissão, adapters kimi/opencode/google), contrato UNVERIFIED. `spawnManagedProcess` e `runAgentProcess` ganharam stdin em pipe, opcional.
  - TAR-0042: matriz de paridade (`docs/PROVIDERS.md`) e ADR-0013.
- **Real, sem prompt:** versões, ajuda e handshake ACP (`initialize` + `session/new`) de kimi 1.50.0 e opencode 1.19.6. Os dois saem com 0 no fim do stdin.
- **Testes:** `npm run verify` 226/226 (darwin-arm64).
- **Atualização:** o responsável autorizou tudo. Smoke real feito (`.ases/evidence/TAR-0041-smoke-real.md`):
  - **Kimi 1.50.0 VERIFIED**, pelo adapter e pelo motor. Achado: o Kimi não manda `kind`/`locations`; o caminho vem do `diff` do pedido de permissão.
  - **OpenCode:** chave de API expirada → `AUTH_EXPIRED`. A classificação foi corrigida.
  - **Gemini:** a instalação global foi bloqueada pelo controle de permissões desta sessão; o responsável instala.
  - `npm run verify` 229/229.
- **Depois:**
  - O responsável renovou a chave do OpenCode, que foi atualizado para a 2.4.1. Essa versão removeu `acp --cwd` → adapter ajustado → **VERIFIED 2.4.1**.
  - O Gemini CLI não loga mais em planos individuais (migração para o Antigravity), e o provider `google` passou a usar `agy acp --sandbox` → **VERIFIED 1.5.13**.
  - OpenCode e Antigravity juntos pelo motor: os dois em REVIEW, com commit.
  - `npm run verify` 234/234.
- **Fechamento:** aprovado pelo responsável. A licença CC BY-NC-ND 4.0 foi aplicada. Fast-forward de `main` para `a5cd051`; TAR-0037..0042 e PHASE-08 COMPLETED.
- **Próxima operação segura:** iniciar a PHASE-09 numa branch `ases/PHASE-09`.

### Sessão 23/11/2026 — PHASE-09 (branch `ases/PHASE-09`)
- **Feito:**
  - `@aer/ases-methodology`: parser literal dos REQ-001..300, trilhas A–J e gates G0/G1.
  - Migração v3 com matriz, decisões e CHANGE; as regras ficam no store.
  - Comandos `/ases import`, `/spec`, `/req`, `/reqs`, `/change` e `/gate`; relatórios `REQUIREMENTS-MATRIX.csv` e `DECISIONS.md`.
  - Repositório público, por decisão do responsável; o CI macOS voltou a rodar.
- **Testes:** `npm run verify` 248/248. O e2e do gate da fase passou.
- **Fechamento:** aprovado pelo responsável. Fast-forward de `main` para `b0e753b`; TAR-0043..0047 e PHASE-09 COMPLETED. CI Linux/Windows 6/6; o macOS foi cancelado sem runner (15 min na fila).
- **Próxima operação segura:** iniciar a PHASE-10 numa branch `ases/PHASE-10`.

### Sessão 23/11/2026 — PHASE-10 (branch `ases/PHASE-10`)
- **Feito:**
  - `@aer/security`: policy engine com escopos do §12.3, deny-by-default e approvals por hash (validade, uso único, vínculo à tarefa).
  - Scanner de supply chain; Skills/MCP/plugins (plugins só pelo CLI oficial).
  - Compatibilidade por provider, com trava no worker (`--ext`).
  - Migração v4 (approvals, extensions, task_extensions); comandos `/approval` e `/ext`.
  - SecretStore nativo: Keychain via `security -i` pelo stdin; `secret-tool` no Linux; Windows indisponível de propósito. CLI `ases secret`.
- **Testes:** `npm run verify` 262/262; os testes de segurança foram repetidos 2×.
- **Pendente:** revisão humana das TAR-0048..0053.
- **Próxima operação segura:** CI da branch; aprovação; merge.

### Sessão 23/11/2026 — PHASE-11 (branch `ases/PHASE-11`, sobre a `ases/PHASE-10`)
- **Feito:**
  - Continuidade: cada tentativa parte da ponta da anterior; `/handoff` grava HANDOFF e checkpoint de recuperação.
  - Pacote de contexto com orçamento.
  - `/test`: test run real com aprovação EXEC_TESTS.
  - `/review`: independente, read-only; quem escreve é INVALID.
  - `/resume`: idempotente. `/usage`: por provider.
- **Testes:** `npm run verify` 268/268. Os gates passaram no e2e (POSIX) e na unidade (todos os SOs).
- **Fechamento:** o responsável aprovou as PHASE-10 e PHASE-11. Fast-forward de `main` para `26295d4`; TAR-0048..0058 e as duas fases COMPLETED.
- **Próxima operação segura:** iniciar a PHASE-12 numa branch `ases/PHASE-12`.

