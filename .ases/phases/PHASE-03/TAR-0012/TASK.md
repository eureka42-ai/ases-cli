<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# TAR-0012 — Servidor IPC local (UDS / Named Pipe)

| Campo | Valor |
|---|---|
| task_id | TAR-0012 |
| phase_id | PHASE-03 |
| estado | COMPLETED (v1) |
| prioridade / risco | 50 / MODERATE |
| provider | — |
| dependências | TAR-0011 |
| extensões | — |
| recursos | — |

## Objetivo / escopo
Servidor IPC local (UDS / Named Pipe)

## Requisitos e critérios de aceite
- AER-REQ-014
- AER-REQ-071
- AER-REQ-072
- AER-REQ-078
- AER-REQ-080
- AER-REQ-228

## Tentativas
- nenhuma

## Testes executados
- nenhum (validação NÃO concluída)

## Evidências, revisões e handoffs
- EVIDENCE .ases/evidence/PHASE-03-verify.md (sha256 edc1d8123fb5…) — importado do .ases/ interino
- EVIDENCE packages/ipc/test/ipc.test.ts (sha256 7e4bf00323a3…) — importado do .ases/ interino
- EVIDENCE docs/ADRs/ADR-0003.md (sha256 ac2613b19e40…) — importado do .ases/ interino

## Critério de saída
COMPLETED só com evidência ou test run aprovado, depois de REVIEW → APPROVED → MERGING (o engine recusa o contrário).
