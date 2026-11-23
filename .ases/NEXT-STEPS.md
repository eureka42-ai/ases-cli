# Próximos passos (atualizado 22/11/2026, após PHASE-05 e o corte para o engine)

**Local do projeto:** `~/Projetos/eureka42/ases-cli` (clone de `eureka42-ai/ases-cli`, privado). A cópia antiga em `~/Desktop/ASES CLI` está numa pasta sincronizada pelo iCloud e **não deve mais ser usada**: o iCloud criou cópias de conflito de arquivos do `.ases/`, e o banco SQLite corre risco lá. Abra o Claude Code na pasta nova.

**Quem escreve o `.ases/`:** só o engine (`.ases/db/ases.sqlite`, local e não versionado). `scripts/ases-dev.mjs` faz apenas `verify`. Comandos: `ases` (TUI) ou `printf '/comando\n/exit\n' | ases --no-tui` em scripts.

1. **PHASE-06** (MVP técnico, última antes do marco multi-IA): `provider-sdk` (contrato `AgentProvider`, §7.2) e `provider-simulator` determinístico rotulado `SIMULATED`.
   - O simulador executa tarefas reservadas pelo scheduler dentro da worktree da tentativa.
   - Eventos normalizados; cancelamento com reconciliação da árvore de processos (`spawnManagedProcess`/`terminateProcessTree` no `PlatformAdapter`); `approval_request`; usage `UNKNOWN`.
   - Comando `/run [PHASE] [--parallel N]` no `ases`; `ases-tar` acompanhando. Gate: §21.2 completo.
   - Registrar as tarefas pelo engine: `/phase new`, `/task new`, `/dep add`.
2. **Pendências do responsável:**
   - Licença (bloqueia publicação).
   - Excluir/apagar a pasta antiga do Desktop quando quiser (tudo está no GitHub; o único arquivo não versionado lá era `.Rhistory`, que não é do projeto).
3. **Restauração a partir do espelho** (clone novo sem banco → `DB_MISSING`): planejada no Project Passport (PHASE-11). Até lá, este Mac é o dono do banco.

Verificação rápida: `npm run verify && node scripts/ases-dev.mjs verify`.
