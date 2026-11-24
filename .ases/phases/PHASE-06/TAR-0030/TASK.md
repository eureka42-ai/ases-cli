<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# TAR-0030 — Ciclo de vida do worker: spawn, timeout, cancelamento e árvore de processos

| Campo | Valor |
|---|---|
| task_id | TAR-0030 |
| phase_id | PHASE-06 |
| estado | COMPLETED (v9) |
| prioridade / risco | 50 / MODERATE |
| provider | — |
| dependências | TAR-0027 |
| extensões | — |
| recursos | — |

## Objetivo / escopo
Ciclo de vida do worker: spawn, timeout, cancelamento e árvore de processos

## Requisitos e critérios de aceite
- AER-REQ-105
- AER-REQ-106
- AER-REQ-109

## Tentativas
- nenhuma

## Testes executados
- nenhum (validação NÃO concluída)

## Evidências, revisões e handoffs
- EVIDENCE packages/scheduler/test/worker.test.ts (sha256 5aca1a5015ae…)
- EVIDENCE packages/platform-core/test/process.test.ts (sha256 47a8b8d36f66…)
- EVIDENCE .ases/evidence/PHASE-06-verify.md (sha256 c7f8fd9b2424…)

## Critério de saída
COMPLETED só com evidência ou test run aprovado, depois de REVIEW → APPROVED → MERGING (o engine recusa o contrário).
