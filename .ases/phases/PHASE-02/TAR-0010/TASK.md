# TAR-0010 — Suíte transacional multiprocesso

| Campo | Valor |
|---|---|
| task_id | TAR-0010 |
| phase_id | PHASE-02 |
| priority | 85 |
| risk | HIGH |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0007, TAR-0008 |
| related_reqs | AER-REQ-045, AER-REQ-062, AER-REQ-063, AER-REQ-191 |
| review_policy | revisão humana antes do merge |

**Escopo:** processos Node reais concorrendo no mesmo banco; crash antes do COMMIT; reabertura após crash

## Critérios de aceite
- [ ] N processos não duplicam seq nem perdem eventos
- [ ] Crash antes do COMMIT não deixa estado nem evento
- [ ] Corrida de transição: exatamente um vencedor

## Testes
- [ ] packages/persistence/test/multiprocess.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
