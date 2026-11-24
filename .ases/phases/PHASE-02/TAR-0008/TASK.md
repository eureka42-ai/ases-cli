<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# TAR-0008 — Máquina de estados de tarefa e fase

| Campo | Valor |
|---|---|
| task_id | TAR-0008 |
| phase_id | PHASE-02 |
| estado | COMPLETED (v1) |
| prioridade / risco | 50 / MODERATE |
| provider | — |
| dependências | TAR-0006 |
| extensões | — |
| recursos | — |

## Objetivo / escopo
Máquina de estados de tarefa e fase

## Requisitos e critérios de aceite
- AER-REQ-022
- AER-REQ-031
- AER-REQ-033
- AER-REQ-039

## Tentativas
- nenhuma

## Testes executados
- nenhum (validação NÃO concluída)

## Evidências, revisões e handoffs
- EVIDENCE .ases/evidence/PHASE-02-verify.md (sha256 9078cb150986…) — importado do .ases/ interino
- EVIDENCE packages/contracts/test/state-machine.test.ts (sha256 7ef7438974c2…) — importado do .ases/ interino
- EVIDENCE packages/persistence/test/store.test.ts (sha256 c7e08996485c…) — importado do .ases/ interino

## Critério de saída
COMPLETED só com evidência ou test run aprovado, depois de REVIEW → APPROVED → MERGING (o engine recusa o contrário).
