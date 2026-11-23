# TAR-0025 — Concorrência e recuperação do scheduler

| Campo | Valor |
|---|---|
| task_id | TAR-0025 |
| phase_id | PHASE-05 |
| priority | 85 |
| risk | HIGH |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0022, TAR-0024 |
| related_reqs | AER-REQ-045, AER-REQ-046, AER-REQ-192 |
| review_policy | revisão humana antes do merge |

**Escopo:** processos reais disputando reservas; crash com lease ativo; reabertura reconcilia sem duplicar

## Critérios de aceite
- [ ] 20 processos, 1 vencedor por tarefa
- [ ] lease vencido após crash vira BLOCKED com motivo

## Testes
- [ ] packages/scheduler/test/multiprocess.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
