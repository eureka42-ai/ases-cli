# TAR-0022 — Leases com fencing e scheduler

| Campo | Valor |
|---|---|
| task_id | TAR-0022 |
| phase_id | PHASE-05 |
| priority | 85 |
| risk | HIGH |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0021 |
| related_reqs | AER-REQ-043, AER-REQ-044, AER-REQ-045, AER-REQ-046, AER-REQ-047, AER-REQ-050 |
| review_policy | revisão humana antes do merge |

**Escopo:** migração 2 (leases, attempts, recursos); reserva transacional com fencing token; heartbeat; expiração → BLOCKED/UNKNOWN sem duplicata; limites globais/por provider; rationale persistido

## Critérios de aceite
- [ ] corrida entre processos: um vencedor
- [ ] token antigo rejeitado
- [ ] nunca mais RUNNING/RESERVED que o limite
- [ ] decisão com rationale no evento

## Testes
- [ ] packages/scheduler/test/*.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
