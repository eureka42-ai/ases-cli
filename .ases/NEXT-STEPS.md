# Próximos passos (atualizado 23/11/2026, PHASE-07 em andamento)

**Local do projeto:** `~/Projetos/eureka42/ases-cli` (clone de `eureka42-ai/ases-cli`, privado). A cópia antiga em `~/Desktop/ASES CLI` está numa pasta sincronizada pelo iCloud e **não deve mais ser usada**: o iCloud criou cópias de conflito de arquivos do `.ases/`, e o banco SQLite corre risco lá. Abra o Claude Code na pasta nova.

**Quem escreve o `.ases/`:** só o engine (`.ases/db/ases.sqlite`, local e não versionado). `scripts/ases-dev.mjs` faz apenas `verify`. Comandos: `ases` (TUI) ou `printf '/comando\n/exit\n' | ases --no-tui` em scripts.

1. **PHASE-06: COMPLETED** (23/11/2026, CI 8/8 run 45192505934; `.ases/evidence/PHASE-06-verify.md`, ADR-0012).
   - Teste manual do simulador: `/task new PHASE-XX t --provider simulator[:hang|fail|approval|auth-expired|garbage|escape]`, depois `/task move TAR-XXXX READY` e `/run --parallel 2`, com `ases-tar` noutro terminal.
2. **PHASE-07: COMPLETED** (23/11/2026). Aprovada pelo responsável e integrada em `main` (`ca47806`).
   - CI Linux/Windows 6/6 (run 45220306651). macOS não rodou no CI (os jobs ficaram na fila sem máquina); verificado só localmente, darwin-arm64, 215/215.
   - Claude 2.1.330 e Codex 0.170.0 VERIFIED com smoke real (`.ases/evidence/TAR-0035-smoke-real.md`). Termos para **distribuição** ainda não confirmados com os vendors.
3. **PHASE-08: em andamento** (branch `ases/PHASE-08`). TAR-0037 a 0042 estão em REVIEW, aguardando aprovação.
   - **Smoke real** (`.ases/evidence/TAR-0041-smoke-real.md`):
     - Kimi **VERIFIED** em 1.50.0, inclusive pelo motor;
     - OpenCode com `AUTH_EXPIRED` (a chave de API expirou);
     - Google não instalado.
   - **Pendências do responsável para completar a matriz:**
     - criar uma chave nova no OpenCode Console;
     - instalar o Gemini CLI (`npm i -g @google/gemini-cli`) e fazer login.
     - Depois disso, repetir o smoke dos dois.
4. **Pendências do responsável:**
   - Licença (bloqueia publicação).
   - Excluir/apagar a pasta antiga do Desktop quando quiser (tudo está no GitHub; o único arquivo não versionado lá era `.Rhistory`, que não é do projeto).
5. **Restauração a partir do espelho** (clone novo sem banco → `DB_MISSING`): planejada no Project Passport (PHASE-11). Até lá, este Mac é o dono do banco.

Verificação rápida: `npm run verify && node scripts/ases-dev.mjs verify`.
