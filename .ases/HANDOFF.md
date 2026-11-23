# Handoff AER

<!-- AUTO:BEGIN (gerado por scripts/ases-dev.mjs refresh; não editar) -->
- Último evento válido: seq 19 em 2026-11-23T00:10:38.446Z
- Git: branch `main`, HEAD `277c38a`
- Concluídas: TAR-0001, TAR-0002, TAR-0003, TAR-0004, TAR-0005
- Abertas: nenhuma
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
