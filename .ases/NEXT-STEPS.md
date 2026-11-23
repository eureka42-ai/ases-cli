# Próximos passos (atualizado 23/11/2026, PHASE-07 em andamento)

**Local do projeto:** `~/Projetos/eureka42/ases-cli` (clone de `eureka42-ai/ases-cli`, privado). A cópia antiga em `~/Desktop/ASES CLI` está numa pasta sincronizada pelo iCloud e **não deve mais ser usada**: o iCloud criou cópias de conflito de arquivos do `.ases/`, e o banco SQLite corre risco lá. Abra o Claude Code na pasta nova.

**Quem escreve o `.ases/`:** só o engine (`.ases/db/ases.sqlite`, local e não versionado). `scripts/ases-dev.mjs` faz apenas `verify`. Comandos: `ases` (TUI) ou `printf '/comando\n/exit\n' | ases --no-tui` em scripts.

1. **PHASE-06: COMPLETED** (23/11/2026, CI 8/8 run 45192505934; `.ases/evidence/PHASE-06-verify.md`, ADR-0012).
   - Teste manual do simulador: `/task new PHASE-XX t --provider simulator[:hang|fail|approval|auth-expired|garbage|escape]`, depois `/task move TAR-XXXX READY` e `/run --parallel 2`, com `ases-tar` noutro terminal.
2. **PHASE-07: COMPLETED** (23/11/2026). Aprovada pelo responsável e integrada em `main` (`ca47806`).
   - CI Linux/Windows 6/6 (run 45220306651). macOS não rodou no CI (os jobs ficaram na fila sem máquina); verificado só localmente, darwin-arm64, 215/215.
   - Claude 2.1.330 e Codex 0.170.0 VERIFIED com smoke real (`.ases/evidence/TAR-0035-smoke-real.md`). Termos para **distribuição** ainda não confirmados com os vendors.
3. **PHASE-08: em andamento** (branch `ases/PHASE-08`). TAR-0037 a 0042 estão em REVIEW, aguardando aprovação do responsável.
   - **Smoke real** (`.ases/evidence/TAR-0041-smoke-real.md`), pelo adapter e pelo motor, com os contratos VERIFIED:
     - Kimi 1.50.0;
     - OpenCode 2.4.1;
     - Google via Antigravity CLI (`agy`) 1.5.13.
   - **Matriz dos cinco ecossistemas completa** (`docs/PROVIDERS.md`). Termos: autorização declarada pelo responsável.
   - **Próximo:** aprovação; merge em `main`; PHASE-08 COMPLETED; depois PHASE-09 (ASES-300/500 e rastreabilidade).
4. **Decisões do responsável (23/11/2026):**
   - **Licença:** CC BY-NC-ND 4.0, Open Access (`LICENSE`; `package.json` com `CC-BY-NC-ND-4.0`). AER-REQ-210 atendido.
   - **Termos dos providers:** o responsável declarou que todos os vendors autorizaram a orquestração. A declaração está registrada; os documentos de autorização não estão no repositório.
   - **Pasta antiga do Desktop:** o responsável vai apagar.
   - **Pendente:** conferir o limite de gasto/cota de Actions da organização `eureka42-ai`, porque os jobs macOS ficam na fila sem máquina.
5. **Restauração a partir do espelho** (clone novo sem banco → `DB_MISSING`): planejada no Project Passport (PHASE-11). Até lá, este Mac é o dono do banco.

Verificação rápida: `npm run verify && node scripts/ases-dev.mjs verify`.
