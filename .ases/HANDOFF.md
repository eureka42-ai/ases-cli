# Handoff AER

<!-- AUTO:BEGIN (gerado por scripts/ases-dev.mjs refresh; não editar) -->
- Último evento válido: seq 72 em 2026-11-23T00:33:45.813Z
- Git: branch `ases/PHASE-03`, HEAD `b41ef16`
- Concluídas: TAR-0001, TAR-0002, TAR-0003, TAR-0004, TAR-0005, TAR-0006, TAR-0007, TAR-0008, TAR-0009, TAR-0010
- Abertas: TAR-0011 (REVIEW), TAR-0012 (REVIEW), TAR-0013 (REVIEW), TAR-0014 (REVIEW), TAR-0015 (REVIEW)
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
