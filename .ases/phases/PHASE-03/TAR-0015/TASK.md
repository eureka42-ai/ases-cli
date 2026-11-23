# TAR-0015 — E2E com dois processos reais

| Campo | Valor |
|---|---|
| task_id | TAR-0015 |
| phase_id | PHASE-03 |
| priority | 85 |
| risk | HIGH |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0013, TAR-0014 |
| related_reqs | AER-REQ-090, AER-REQ-091, AER-REQ-093, AER-REQ-094, AER-REQ-099, AER-REQ-191 |
| review_policy | revisão humana antes do merge |

**Escopo:** spawn de ases e ases-tar reais; evento criado no ases visto no ases-tar; derrubar e reabrir o ases; filtros --task/--phase

## Critérios de aceite
- [ ] PIDs distintos
- [ ] evento visto em ordem de seq
- [ ] RECONNECTING e retomada sem duplicata

## Testes
- [ ] test/e2e/two-processes.test.mjs

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
