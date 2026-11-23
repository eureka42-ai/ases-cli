# TAR-0011 — CLI shell ases/ases-tar + build + marca mínima

| Campo | Valor |
|---|---|
| task_id | TAR-0011 |
| phase_id | PHASE-03 |
| priority | 95 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | nenhuma |
| related_reqs | AER-REQ-004, AER-REQ-011, AER-REQ-240, AER-REQ-241, AER-REQ-245, AER-REQ-247 |
| review_policy | revisão humana antes do merge |

**Escopo:** apps/ases-cli e apps/ases-tar (util.parseArgs), build tsc -b, ases init não destrutivo, --version/--help, cabeçalho ⌘ Eureka42 com NO_COLOR/ASCII

## Critérios de aceite
- [ ] bins executam a partir do build JS
- [ ] init duas vezes preserva arquivos
- [ ] --json/pipe sem ANSI nem banner

## Testes
- [ ] test/e2e/bins.test.mjs
- [ ] packages/branding/test/*.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
