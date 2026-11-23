# TAR-0003 — Contratos de projeto

| Campo | Valor |
|---|---|
| task_id | TAR-0003 |
| phase_id | PHASE-01 |
| priority | 90 |
| risk | LOW |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0002 |
| related_reqs | AER-REQ-010, AER-REQ-013, AER-REQ-021, AER-REQ-031 |
| review_policy | revisão humana antes do merge |

**Escopo:** packages/contracts: IDs PHASE/TAR/ATT, versões independentes, estados, schema Zod do MANIFEST.json

## Critérios de aceite
- [ ] IDs formatam/expandem sem colisão (101 fases)
- [ ] Manifest rejeita paths absolutos e campos desconhecidos
- [ ] Versões app/protocol/schema separadas

## Testes
- [ ] packages/contracts/test/contracts.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
