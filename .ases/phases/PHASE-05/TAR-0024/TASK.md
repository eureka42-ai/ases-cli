# TAR-0024 — Fila de merge serializada

| Campo | Valor |
|---|---|
| task_id | TAR-0024 |
| phase_id | PHASE-05 |
| priority | 85 |
| risk | HIGH |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0023 |
| related_reqs | AER-REQ-055, AER-REQ-056, AER-REQ-057, AER-REQ-059 |
| review_policy | revisão humana antes do merge |

**Escopo:** merge só com checkout limpo e no branch alvo; um merge por vez (lock no banco); conflito → abort seguro + CONFLICT; nunca reset --hard/clean/force

## Critérios de aceite
- [ ] alterações humanas não commitadas preservadas byte a byte
- [ ] conflito termina em CONFLICT sem merge
- [ ] dois merges não simultâneos

## Testes
- [ ] packages/git-bridge/test/merge.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
