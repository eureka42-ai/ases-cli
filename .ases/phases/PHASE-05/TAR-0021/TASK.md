# TAR-0021 — DAG de dependências

| Campo | Valor |
|---|---|
| task_id | TAR-0021 |
| phase_id | PHASE-05 |
| priority | 90 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | nenhuma |
| related_reqs | AER-REQ-041, AER-REQ-042, AER-REQ-037 |
| review_policy | revisão humana antes do merge |

**Escopo:** adicionar dependências depois da criação com rejeição de ciclo (caminho explicativo); elegibilidade só com dependências COMPLETED

## Critérios de aceite
- [ ] A→B→C→A rejeitado com caminho
- [ ] dependente não fica elegível antes da dependência concluir

## Testes
- [ ] packages/scheduler/test/dag.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
