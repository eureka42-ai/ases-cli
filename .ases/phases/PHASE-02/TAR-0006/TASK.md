# TAR-0006 — Schema SQLite e migrações

| Campo | Valor |
|---|---|
| task_id | TAR-0006 |
| phase_id | PHASE-02 |
| priority | 90 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | nenhuma |
| related_reqs | AER-REQ-010, AER-REQ-018, AER-REQ-236 |
| review_policy | revisão humana antes do merge |

**Escopo:** ADR-0002 (driver); packages/persistence: migração 1 (phases antes de tasks), FKs, WAL, busy_timeout, backup antes de migrar

## Critérios de aceite
- [ ] Migração aplica em banco vazio e é idempotente ao reabrir
- [ ] Backup verificado antes de migrar banco existente
- [ ] FKs ON e CHECKs de estado ativos

## Testes
- [ ] packages/persistence/test/migrations.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
