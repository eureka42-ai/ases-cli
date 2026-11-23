# TAR-0014 — Monitor somente leitura

| Campo | Valor |
|---|---|
| task_id | TAR-0014 |
| phase_id | PHASE-03 |
| priority | 90 |
| risk | HIGH |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0012 |
| related_reqs | AER-REQ-073, AER-REQ-079, AER-REQ-170 |
| review_policy | revisão humana antes do merge |

**Escopo:** token de monitor separado do de controle; métodos mutantes negados no servidor, inclusive montados à mão

## Critérios de aceite
- [ ] RPC mutante com token de monitor → FORBIDDEN
- [ ] sem token → UNAUTHENTICATED

## Testes
- [ ] packages/ipc/test/*.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
