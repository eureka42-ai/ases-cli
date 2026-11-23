# TAR-0008 — Máquina de estados de tarefa e fase

| Campo | Valor |
|---|---|
| task_id | TAR-0008 |
| phase_id | PHASE-02 |
| priority | 80 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0006 |
| related_reqs | AER-REQ-022, AER-REQ-031, AER-REQ-033, AER-REQ-039 |
| review_policy | revisão humana antes do merge |

**Escopo:** tabela de transições §5.1 em contracts; transição com CAS de versão + evento na mesma transação; alocação global de TAR/PHASE

## Critérios de aceite
- [ ] Saltos inválidos rejeitados
- [ ] Conflito de versão rejeitado
- [ ] IDs TAR globais entre fases

## Testes
- [ ] packages/contracts/test/state-machine.test.ts
- [ ] packages/persistence/test/tasks.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
