# Próximos passos (atualizado 22/11/2026, fim da PHASE-02 técnica)

1. **Revisão humana da PHASE-02** (branch `ases/PHASE-02`, worktree `.worktrees/PHASE-02`, tarefas em REVIEW). Aprovado:
   `git -C "<repo>" merge --ff-only ases/PHASE-02`; depois `set TAR-0006..0010 APPROVED → MERGING → COMPLETED` via `scripts/ases-dev.mjs` e `set PHASE-02 COMPLETED`; por fim remover o worktree (`git worktree remove .worktrees/PHASE-02`).
2. **Decisões pendentes do responsável** (continuam abertas):
   - Renomear `branding/references/Estudo de Marca Eureka42: Quatro Variações.png`, inválido no Windows.
   - Licença.
   - Remoto Git para rodar o CI.
3. **PHASE-03** (TAR-0011..0015), em novo worktree `ases/PHASE-03`:
   - `apps/ases-cli` e `apps/ases-tar` (bins `ases`/`ases-tar`, `--version`/`--help` sem ANSI em pipe/NO_COLOR).
   - Build JS (`tsc` com `rewriteRelativeImportExtensions`) para os bins.
   - `ases init` usando `ProjectStore` em `.ases/db/ases.sqlite` com permissões `0700/0600` via `PlatformAdapter`.
   - Importar `.ases/HISTORY.jsonl` interino como seed (regras em `docs/DATA.md`) e aposentar `scripts/ases-dev.mjs` como escritor.
   - IPC UDS JSON-RPC (`rpc.handshake`, `project.snapshot`, `project.subscribe`), com endpoint read-only para o `ases-tar`.
   - E2E com dois processos reais: evento emitido no `ases` e visto no `ases-tar`.

Verificação rápida: `npm run verify && node scripts/ases-dev.mjs verify`.
