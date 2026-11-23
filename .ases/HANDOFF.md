# Handoff AER

<!-- AUTO:BEGIN (gerado por scripts/ases-dev.mjs refresh; não editar) -->
- Último evento válido: seq 131 em 2026-11-23T01:15:18.507Z
- Git: branch `ases/PHASE-05`, HEAD `698d52f`
- Concluídas: TAR-0001, TAR-0002, TAR-0003, TAR-0004, TAR-0005, TAR-0006, TAR-0007, TAR-0008, TAR-0009, TAR-0010, TAR-0011, TAR-0012, TAR-0013, TAR-0014, TAR-0015, TAR-0016, TAR-0017, TAR-0018, TAR-0019, TAR-0020
- Abertas: TAR-0021 (PLANNED), TAR-0022 (PLANNED), TAR-0023 (PLANNED), TAR-0024 (PLANNED), TAR-0025 (PLANNED), TAR-0026 (PLANNED)
- Comando para retomar: `node scripts/ases-dev.mjs refresh` e ler `.ases/NEXT-STEPS.md` (o `ases resume` ainda não existe)
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
