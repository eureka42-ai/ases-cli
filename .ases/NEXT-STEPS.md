# Próximos passos (atualizado 23/11/2026, PHASE-06 em REVIEW)

**Local do projeto:** `~/Projetos/eureka42/ases-cli` (clone de `eureka42-ai/ases-cli`, privado). A cópia antiga em `~/Desktop/ASES CLI` está numa pasta sincronizada pelo iCloud e **não deve mais ser usada**: o iCloud criou cópias de conflito de arquivos do `.ases/`, e o banco SQLite corre risco lá. Abra o Claude Code na pasta nova.

**Quem escreve o `.ases/`:** só o engine (`.ases/db/ases.sqlite`, local e não versionado). `scripts/ases-dev.mjs` faz apenas `verify`. Comandos: `ases` (TUI) ou `printf '/comando\n/exit\n' | ases --no-tui` em scripts.

1. **PHASE-06: implementada, em REVIEW** (branch `ases/PHASE-06`, 23/11/2026; ver `.ases/evidence/PHASE-06-verify.md` e ADR-0012).
   - Falta: revisão humana, commit, CI nos 8 alvos e, depois, TAR-0027..0031 → APPROVED → merge → COMPLETED e PHASE-06 → VERIFYING → COMPLETED.
   - Teste manual: `/task new PHASE-XX t --provider simulator` (ou `simulator:hang|fail|approval|auth-expired|garbage|escape`), `/task move TAR-XXXX READY`, `/run --parallel 2` e `ases-tar` noutro terminal.
2. **PHASE-07:** Claude Code e Codex oficiais sobre `AgentProvider` (TAR-0032+). Antes de começar, pesquisar flags e termos atuais (sem inventar argumentos).
3. **Pendências do responsável:**
   - Licença (bloqueia publicação).
   - Excluir/apagar a pasta antiga do Desktop quando quiser (tudo está no GitHub; o único arquivo não versionado lá era `.Rhistory`, que não é do projeto).
4. **Restauração a partir do espelho** (clone novo sem banco → `DB_MISSING`): planejada no Project Passport (PHASE-11). Até lá, este Mac é o dono do banco.

Verificação rápida: `npm run verify && node scripts/ases-dev.mjs verify`.
