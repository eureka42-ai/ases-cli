# Próximos passos (atualizado 23/11/2026, PHASE-07 em andamento)

**Local do projeto:** `~/Projetos/eureka42/ases-cli` (clone de `eureka42-ai/ases-cli`, privado). A cópia antiga em `~/Desktop/ASES CLI` está numa pasta sincronizada pelo iCloud e **não deve mais ser usada**: o iCloud criou cópias de conflito de arquivos do `.ases/`, e o banco SQLite corre risco lá. Abra o Claude Code na pasta nova.

**Quem escreve o `.ases/`:** só o engine (`.ases/db/ases.sqlite`, local e não versionado). `scripts/ases-dev.mjs` faz apenas `verify`. Comandos: `ases` (TUI) ou `printf '/comando\n/exit\n' | ases --no-tui` em scripts.

1. **PHASE-06: COMPLETED** (23/11/2026, CI 8/8 run 45192505934; `.ases/evidence/PHASE-06-verify.md`, ADR-0012).
   - Teste manual do simulador: `/task new PHASE-XX t --provider simulator[:hang|fail|approval|auth-expired|garbage|escape]`, depois `/task move TAR-XXXX READY` e `/run --parallel 2`, com `ases-tar` noutro terminal.
2. **PHASE-07: em andamento** (branch `ases/PHASE-07`). TAR-0032/33/34/36 estão em REVIEW; **TAR-0035 está BLOCKED, aguardando consentimento**.
   - Adapters prontos com contrato **UNVERIFIED** (`docs/PROVIDERS.md`). Nenhuma chamada real foi feita.
   - **Para destravar:** aceite do responsável para o smoke (consome cota do Claude Pro e do ChatGPT) e uma posição sobre os termos de uso (`docs/PROVIDERS_PESQUISA.md`).
   - **Smoke previsto:** fase de teste com 1 tarefa `claude` e 1 `codex` só de leitura (`/run --consent claude,codex`), capturando o stream bruto como fixture redigida.
3. **Pendências do responsável:**
   - Licença (bloqueia publicação).
   - Excluir/apagar a pasta antiga do Desktop quando quiser (tudo está no GitHub; o único arquivo não versionado lá era `.Rhistory`, que não é do projeto).
4. **Restauração a partir do espelho** (clone novo sem banco → `DB_MISSING`): planejada no Project Passport (PHASE-11). Até lá, este Mac é o dono do banco.

Verificação rápida: `npm run verify && node scripts/ases-dev.mjs verify`.
