# Próximos passos (atualizado 22/11/2026, fim da PHASE-04 técnica)

1. **Revisão da PHASE-04** (branch `ases/PHASE-04`, worktree `.worktrees/PHASE-04`, tarefas em REVIEW). Aprovado:
   - `git merge --ff-only ases/PHASE-04` em `main`;
   - TAR-0016..0020 `APPROVED → MERGING → COMPLETED` e `PHASE-04 COMPLETED` (`scripts/ases-dev.mjs --root <repo>`);
   - `git worktree remove .worktrees/PHASE-04`.
2. **Experimentar as TUIs** (Apple Silicon):
   - `npm run build`;
   - num projeto de teste: `node <repo>/apps/ases-cli/bin/ases.js init` e depois `node <repo>/apps/ases-cli/bin/ases.js`;
   - noutro terminal, na mesma pasta: `node <repo>/apps/ases-tar/bin/ases-tar.js`.
3. **Pendências do responsável:**
   - Licença (bloqueia publicação).
   - Remoto Git para rodar o CI (macOS arm64, Windows x64/arm64, Ubuntu x64/arm64; Node 22 e 24). É a forma mais barata de transformar os NOT_RUN de Windows/Linux em resultado real.
4. **PHASE-05** (TAR-0021..0025): DAG com detecção de ciclo, leases com fencing, Git worktree por tarefa/attempt, fila de merge serializada, testes de concorrência.
   - Incluir aqui as tabelas `artifacts`/`test_runs` e o **corte do `.ases/` deste repositório para o engine**: importar `HISTORY.jsonl` como seed (`docs/DATA.md`) e aposentar `scripts/ases-dev.mjs` como escritor.

Verificação rápida: `npm run verify && node scripts/ases-dev.mjs verify`.
