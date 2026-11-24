<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# TAR-0031 — /run e /cancel ponta a ponta com ases-tar

| Campo | Valor |
|---|---|
| task_id | TAR-0031 |
| phase_id | PHASE-06 |
| estado | COMPLETED (v9) |
| prioridade / risco | 50 / MODERATE |
| provider | — |
| dependências | TAR-0028, TAR-0029, TAR-0030 |
| extensões | — |
| recursos | — |

## Objetivo / escopo
/run e /cancel ponta a ponta com ases-tar

## Requisitos e critérios de aceite
- AER-REQ-043
- AER-REQ-101
- AER-REQ-105

## Tentativas
- nenhuma

## Testes executados
- nenhum (validação NÃO concluída)

## Evidências, revisões e handoffs
- EVIDENCE test/e2e/run.test.mjs (sha256 11bef7fd7974…)
- EVIDENCE .ases/evidence/PHASE-06-verify.md (sha256 c7f8fd9b2424…)
- EVIDENCE .ases/evidence/PHASE-06-verify.md (sha256 e399886cffa7…) — CI 8/8 run 45192505934

## Critério de saída
COMPLETED só com evidência ou test run aprovado, depois de REVIEW → APPROVED → MERGING (o engine recusa o contrário).
