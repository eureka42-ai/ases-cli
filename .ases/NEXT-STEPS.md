# Próximos passos (atualizado 22/11/2026, fim da PHASE-03 técnica)

1. **Revisão humana da PHASE-03** (branch `ases/PHASE-03`, worktree `.worktrees/PHASE-03`, tarefas em REVIEW). Aprovado:
   - `git merge --ff-only ases/PHASE-03` em `main`;
   - TAR-0011..0015 `APPROVED → MERGING → COMPLETED` e `PHASE-03 COMPLETED` via `scripts/ases-dev.mjs --root <repo>`;
   - `git worktree remove .worktrees/PHASE-03`.
2. **Experimentar** (macOS), num projeto qualquer, fora deste repositório:
   - `npm run build` no repo AER;
   - no projeto: `node <repo>/apps/ases-cli/bin/ases.js init`, depois `node <repo>/apps/ases-cli/bin/ases.js`;
   - noutro terminal, na mesma pasta: `node <repo>/apps/ases-tar/bin/ases-tar.js`.
   (`npm link` deixaria `ases`/`ases-tar` globais, mas é instalação global e exige aprovação.)
3. **Decisões pendentes do responsável:**
   - Renomear o PNG com `:` (inválido no Windows).
   - Licença.
   - Remoto Git/CI.
4. **PHASE-04** (TAR-0016..0020): TUI Ink, que exige aprovar as dependências `ink` + `react`.
   - `tui-shared`, home/chat do `ases`, live/overview/task detail do `ases-tar`.
   - Teclado (`Tab`/`?`/`Esc`), resize, 40x16/80x24/120x35, `NO_COLOR`.
5. **Corte do `.ases/` deste repositório para o engine:** exige tabelas `artifacts`/`test_runs` (evidência no banco). Importar `HISTORY.jsonl` como seed (`docs/DATA.md`) e aposentar `scripts/ases-dev.mjs` como escritor. Propor na PHASE-05.

Verificação rápida: `npm run verify && node scripts/ases-dev.mjs verify`.
