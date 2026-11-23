# TAR-0009 — Exportação JSONL e recuperação

| Campo | Valor |
|---|---|
| task_id | TAR-0009 |
| phase_id | PHASE-02 |
| priority | 80 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0007 |
| related_reqs | AER-REQ-036, AER-REQ-067, AER-REQ-068, AER-REQ-192 |
| review_policy | revisão humana antes do merge |

**Escopo:** espelho HISTORY.jsonl derivado por seq com escrita atômica; verificação de gaps/duplicatas/hash; falha de export não invalida transação

## Critérios de aceite
- [ ] Rebuild produz ordem idêntica
- [ ] Linha adulterada detectada
- [ ] Export interrompido não trunca arquivo válido

## Testes
- [ ] packages/persistence/test/export.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
