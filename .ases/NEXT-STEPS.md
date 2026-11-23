# Próximos passos (atualizado 22/11/2026, fim da sessão PHASE-01)

1. **Revisão humana da PHASE-01** (tarefas em REVIEW). Aprovado, fazer o primeiro commit em `main` e então:
   `node scripts/ases-dev.mjs set TAR-000N COMPLETED --evidence .ases/evidence/PHASE-01-verify.md` (N=1..5) e `set PHASE-01 COMPLETED`.
2. **Decisões pendentes do responsável:**
   - Renomear `branding/references/Estudo de Marca Eureka42: Quatro Variações.png` (o `:` é inválido no Windows), atualizando os manifestos de hash.
   - Licença (bloqueia publicação; não bloqueia desenvolvimento).
   - Remoto Git para rodar o CI (`.github/workflows/ci.yml`, hoje NOT_RUN).
3. **PHASE-02** (só depois do commit, que é pré-requisito de worktree): criar as tarefas TAR-0006..0010 em `scripts/aer-plan.json` e rodar `node scripts/ases-dev.mjs init` (só cria o que falta).
   - Primeiro o ADR-0002, sobre o driver SQLite: `node:sqlite` (Node 22.19, experimental) vs pacote nativo com prebuilds. Critério: rodar nos três SO sem flag `--experimental`.
   - Depois `packages/persistence` + `packages/event-log`: migração 1 (phases antes de tasks), transação estado+evento, `seq` monotônica, importação de `.ases/HISTORY.jsonl` como seed.
4. **PHASE-03**: `apps/ases-cli` e `apps/ases-tar` (bins), IPC UDS usando `createLocalIpcEndpoint`, evento visto no segundo terminal.

Verificação rápida a qualquer momento: `npm run verify && node scripts/ases-dev.mjs verify`.
