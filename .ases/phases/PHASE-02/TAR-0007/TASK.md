<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# TAR-0007 — Event store transacional

| Campo | Valor |
|---|---|
| task_id | TAR-0007 |
| phase_id | PHASE-02 |
| estado | COMPLETED (v1) |
| prioridade / risco | 50 / MODERATE |
| provider | — |
| dependências | TAR-0006 |
| extensões | — |
| recursos | — |

## Objetivo / escopo
Event store transacional

## Requisitos e critérios de aceite
- AER-REQ-061
- AER-REQ-062
- AER-REQ-063
- AER-REQ-064
- AER-REQ-065
- AER-REQ-069
- AER-REQ-074

## Tentativas
- nenhuma

## Testes executados
- nenhum (validação NÃO concluída)

## Evidências, revisões e handoffs
- EVIDENCE .ases/evidence/PHASE-02-verify.md (sha256 9078cb150986…) — importado do .ases/ interino
- EVIDENCE packages/persistence/test/store.test.ts (sha256 c7e08996485c…) — importado do .ases/ interino

## Critério de saída
COMPLETED só com evidência ou test run aprovado, depois de REVIEW → APPROVED → MERGING (o engine recusa o contrário).
