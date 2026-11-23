# TAR-0004 — Bootstrap de .ases/

| Campo | Valor |
|---|---|
| task_id | TAR-0004 |
| phase_id | PHASE-01 |
| priority | 90 |
| risk | LOW |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0002 |
| related_reqs | AER-REQ-011, AER-REQ-016, AER-REQ-151, AER-REQ-181 |
| review_policy | revisão humana antes do merge |

**Escopo:** scripts/ases-dev.mjs (interino até o motor): init não destrutivo, eventos JSONL com seq e sha256, STATUS/HANDOFF/TRACEABILITY gerados

## Critérios de aceite
- [ ] init duas vezes não altera hashes
- [ ] MANIFEST com SHA-256 das fontes
- [ ] STATUS.md, HANDOFF.md, NEXT-STEPS.md presentes
- [ ] histórico com seq contínua e hash verificável

## Testes
- [ ] test/ases-dev.test.mjs
- [ ] node scripts/ases-dev.mjs verify

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
