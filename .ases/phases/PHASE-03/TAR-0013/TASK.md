# TAR-0013 — Cliente IPC e assinatura de eventos

| Campo | Valor |
|---|---|
| task_id | TAR-0013 |
| phase_id | PHASE-03 |
| priority | 80 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0012 |
| related_reqs | AER-REQ-070, AER-REQ-074, AER-REQ-075, AER-REQ-076, AER-REQ-077 |
| review_policy | revisão humana antes do merge |

**Escopo:** cliente com timeout por chamada, snapshot+subscribe fromSeq, backlog sem corrida, leitor lento não trava o engine

## Critérios de aceite
- [ ] evento aparece 1 vez
- [ ] reconexão recupera lacuna sem duplicar
- [ ] consumidor lento recebe resyncRequired

## Testes
- [ ] packages/ipc/test/*.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
