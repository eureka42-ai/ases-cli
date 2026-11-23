# TAR-0016 — tui-shared: tema, marca, badges, painéis, ajuda

| Campo | Valor |
|---|---|
| task_id | TAR-0016 |
| phase_id | PHASE-04 |
| priority | 90 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | nenhuma |
| related_reqs | AER-REQ-240, AER-REQ-243, AER-REQ-248, AER-REQ-100 |
| review_policy | revisão humana antes do merge |

**Escopo:** packages/tui-shared com Ink: contexto de UI (cor/Unicode/tema), cabeçalho de marca, badges de estado distinguíveis sem cor, painéis com borda ASCII de fallback, overlay de atalhos, hook de tamanho de terminal, renderização de teste com largura fixa

## Critérios de aceite
- [ ] estados distinguíveis sem cor
- [ ] bordas ASCII sem Unicode
- [ ] mesmos tokens nos dois apps

## Testes
- [ ] packages/tui-shared/test/*.test.tsx

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
