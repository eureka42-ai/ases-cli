# TAR-0001 — Auditar ambiente local

| Campo | Valor |
|---|---|
| task_id | TAR-0001 |
| phase_id | PHASE-01 |
| priority | 100 |
| risk | LOW |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | nenhuma |
| related_reqs | AER-REQ-001, AER-REQ-002, AER-REQ-003, AER-REQ-204 |
| review_policy | revisão humana antes do merge |

**Escopo:** Detectar SO, arquitetura, Node, gerenciadores, Git e CLIs de provedores sem alterar o ambiente

## Critérios de aceite
- [ ] Sistema e arquitetura detectados
- [ ] Ferramentas com versões registradas
- [ ] Ausências marcadas sem instalação automática

## Testes
- [ ] T-AER-001: evidência .ases/evidence/TAR-0001-environment.md

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
