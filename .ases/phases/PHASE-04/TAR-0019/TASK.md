# TAR-0019 — ases-tar: detalhe da tarefa

| Campo | Valor |
|---|---|
| task_id | TAR-0019 |
| phase_id | PHASE-04 |
| priority | 80 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0018 |
| related_reqs | AER-REQ-085, AER-REQ-094, AER-REQ-098 |
| review_policy | revisão humana antes do merge |

**Escopo:** Enter abre detalhe (estado, versão, requisitos, dependências, histórico por seq); Esc volta; progresso indeterminado sem milestones

## Critérios de aceite
- [ ] detalhe mostra eventos da tarefa
- [ ] sem porcentagem fictícia

## Testes
- [ ] apps/ases-tar/test/*.test.tsx

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
