# TAR-0023 — Git worktree por tarefa/attempt

| Campo | Valor |
|---|---|
| task_id | TAR-0023 |
| phase_id | PHASE-05 |
| priority | 85 |
| risk | HIGH |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0022 |
| related_reqs | AER-REQ-051, AER-REQ-052, AER-REQ-053, AER-REQ-060, AER-REQ-164 |
| review_policy | revisão humana antes do merge |

**Escopo:** packages/git-bridge via git CLI sem shell: worktree + branch ases/TAR-XXXX/ATT-XXXX, base commit registrado, validação de caminho contra ../ e symlink

## Critérios de aceite
- [ ] duas tarefas em worktrees distintas
- [ ] branch e base no attempt
- [ ] escape por ../ ou symlink bloqueado

## Testes
- [ ] packages/git-bridge/test/*.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
