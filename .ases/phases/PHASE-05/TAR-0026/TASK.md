# TAR-0026 — Evidências no banco e corte do .ases/ interino

| Campo | Valor |
|---|---|
| task_id | TAR-0026 |
| phase_id | PHASE-05 |
| priority | 80 |
| risk | HIGH |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0022 |
| related_reqs | AER-REQ-158, AER-REQ-186, AER-REQ-189, AER-REQ-036, AER-REQ-181 |
| review_policy | revisão humana antes do merge |

**Escopo:** tabelas artifacts/test_runs; COMPLETED exige evidência; importação do HISTORY.jsonl interino; STATUS/TRACEABILITY/HANDOFF gerados pelo engine; aposentar scripts/ases-dev.mjs como escritor

## Critérios de aceite
- [ ] COMPLETED sem evidência negado
- [ ] histórico interino importado com eventId e seq preservados
- [ ] ases abre este repositório

## Testes
- [ ] packages/persistence/test/legacy.test.ts
- [ ] test/e2e/cutover.test.mjs

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
