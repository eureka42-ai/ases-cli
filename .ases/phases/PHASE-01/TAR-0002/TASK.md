# TAR-0002 — Monorepo TypeScript (npm workspaces)

| Campo | Valor |
|---|---|
| task_id | TAR-0002 |
| phase_id | PHASE-01 |
| priority | 95 |
| risk | LOW |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0001 |
| related_reqs | AER-REQ-005, AER-REQ-006, AER-REQ-007 |
| review_policy | revisão humana antes do merge |

**Escopo:** package.json com workspaces, engines e lockfile; tsconfig strict; lint de fronteiras; vitest

## Critérios de aceite
- [ ] engines.node fixado
- [ ] tsc strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes passa
- [ ] lint de fronteiras passa e detecta violações em fixture
- [ ] package-lock.json versionado

## Testes
- [ ] npm run lint
- [ ] npm run typecheck
- [ ] test/boundaries.test.mjs

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
