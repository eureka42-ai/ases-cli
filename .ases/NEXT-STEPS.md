# Próximos passos (atualizado 23/11/2026, PHASE-07 em andamento)

**Local do projeto:** `~/Projetos/eureka42/ases-cli` (clone de `eureka42-ai/ases-cli`, privado). A cópia antiga em `~/Desktop/ASES CLI` está numa pasta sincronizada pelo iCloud e **não deve mais ser usada**: o iCloud criou cópias de conflito de arquivos do `.ases/`, e o banco SQLite corre risco lá. Abra o Claude Code na pasta nova.

**Quem escreve o `.ases/`:** só o engine (`.ases/db/ases.sqlite`, local e não versionado). `scripts/ases-dev.mjs` faz apenas `verify`. Comandos: `ases` (TUI) ou `printf '/comando\n/exit\n' | ases --no-tui` em scripts.

1. **PHASE-06: COMPLETED** (23/11/2026, CI 8/8 run 45192505934; `.ases/evidence/PHASE-06-verify.md`, ADR-0012).
   - Teste manual do simulador: `/task new PHASE-XX t --provider simulator[:hang|fail|approval|auth-expired|garbage|escape]`, depois `/task move TAR-XXXX READY` e `/run --parallel 2`, com `ases-tar` noutro terminal.
2. **PHASE-07: COMPLETED** (23/11/2026). Aprovada pelo responsável e integrada em `main` (`ca47806`).
   - CI Linux/Windows 6/6 (run 45220306651). macOS não rodou no CI (os jobs ficaram na fila sem máquina); verificado só localmente, darwin-arm64, 215/215.
   - Claude 2.1.330 e Codex 0.170.0 VERIFIED com smoke real (`.ases/evidence/TAR-0035-smoke-real.md`). Termos para **distribuição** ainda não confirmados com os vendors.
3. **PHASE-08: COMPLETED** (23/11/2026). Aprovada pelo responsável e integrada em `main` (`a5cd051`).
   - Contratos VERIFIED com smoke real: Kimi 1.50.0, OpenCode 2.4.1 e Google via Antigravity CLI 1.5.13 (`.ases/evidence/TAR-0041-smoke-real.md`, ADR-0013).
   - CI Linux/Windows 6/6 (run 45232756904). macOS só local, 234/234.

4. **PHASE-09: COMPLETED** (23/11/2026). Aprovada pelo responsável e integrada em `main` (`b0e753b`).
   - ASES-300/500 executável (ADR-0014, `docs/METODOLOGIA.md`); o gate da fase foi verificado no e2e.
   - CI Linux/Windows 6/6 (run 45245602246); o macOS foi cancelado pelo GitHub sem runner (só local, 248/248).

5. **PHASE-10: COMPLETED** (23/11/2026). Aprovada pelo responsável e integrada em `main` (`26295d4`). Segurança e extensões (ADR-0015).
6. **PHASE-11: COMPLETED** (23/11/2026). Aprovada pelo responsável e integrada em `main` (`26295d4`). Continuidade, test runs, revisão, resume e usage (ADR-0016).
7. **PHASE-12: em andamento** (branch `ases/PHASE-12`).
   - **Feito:** TAR-0061/0062 (em andamento).
     - Pacote npm único e autocontido (`scripts/pack.mjs`, `docs/INSTALL.md`).
     - Smoke instala/roda/desinstala offline num prefixo temporário (`scripts/pack-smoke.mjs`).
     - Comandos pelo PATH: CI Windows (pwsh, PowerShell, cmd), Linux (bash, pwsh); local macOS (bash, zsh). Run 45262002469: Linux/Windows 6/6.
   - **Falta:**
     - TAR-0059/0060: ADR e lifecycle do motor residente (start/stop/status; a TUI sai sem perder tarefas; IPC `control` já existe).
     - TAR-0063: hardening e auditoria do DoD (§21).
       - **43 requisitos P0 sem tarefa rastreada.** Para cada um: ligar a teste/evidência existente, implementar, ou registrar exceção com aprovação do responsável.
       - Revisão de segurança, licenças (terceiros embutidos no pacote) e conformidade de autenticação.
8. **Decisões do responsável (23/11/2026):**
   - **Licença:** CC BY-NC-ND 4.0, Open Access (`LICENSE`; `package.json` com `CC-BY-NC-ND-4.0`). AER-REQ-210 atendido.
   - **Termos dos providers:** o responsável declarou que todos os vendors autorizaram a orquestração. A declaração está registrada; os documentos de autorização não estão no repositório.
   - **Pasta antiga do Desktop:** o responsável vai apagar.
   - **Pendente:** conferir o limite de gasto/cota de Actions da organização `eureka42-ai`, porque os jobs macOS ficam na fila sem máquina.
9. **Restauração a partir do espelho** (clone novo sem banco → `DB_MISSING`): sem fase alocada (Project Passport, §14.12, pós-MVP); a PHASE-11 não cobriu isso. Até lá, este Mac é o dono do banco.

Verificação rápida: `npm run verify && node scripts/ases-dev.mjs verify`.
