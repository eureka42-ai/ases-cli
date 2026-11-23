# TAR-0018 — ases-tar: overview + eventos ao vivo

| Campo | Valor |
|---|---|
| task_id | TAR-0018 |
| phase_id | PHASE-04 |
| priority | 80 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0016 |
| related_reqs | AER-REQ-092, AER-REQ-096, AER-REQ-099, AER-REQ-203 |
| review_policy | revisão humana antes do merge |

**Escopo:** TUI Ink do ases-tar: projeção local por eventos, painel fases/tarefas, timeline por seq, badge LIVE/RECONNECTING/OFFLINE, r relê sem reiniciar execução

## Critérios de aceite
- [ ] projeção igual ao snapshot após eventos
- [ ] badge muda ao perder o engine
- [ ] sem polling: atualiza por evento

## Testes
- [ ] apps/ases-tar/test/*.test.tsx

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
