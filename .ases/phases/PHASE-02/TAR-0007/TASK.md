# TAR-0007 — Event store transacional

| Campo | Valor |
|---|---|
| task_id | TAR-0007 |
| phase_id | PHASE-02 |
| priority | 80 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0006 |
| related_reqs | AER-REQ-061, AER-REQ-062, AER-REQ-063, AER-REQ-064, AER-REQ-065, AER-REQ-069, AER-REQ-074 |
| review_policy | revisão humana antes do merge |

**Escopo:** append idempotente por eventId, seq monotônica, payload sha256 canônico, eventos imutáveis, paginação e snapshot com cursor

## Critérios de aceite
- [ ] UPDATE/DELETE de eventos rejeitado
- [ ] eventId repetido altera zero linhas
- [ ] snapshot traz snapshotSeq consistente
- [ ] leitura paginada

## Testes
- [ ] packages/persistence/test/events.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
