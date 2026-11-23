# TAR-0017 — ases: home + sessão TUI

| Campo | Valor |
|---|---|
| task_id | TAR-0017 |
| phase_id | PHASE-04 |
| priority | 80 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0016 |
| related_reqs | AER-REQ-081, AER-REQ-084, AER-REQ-085, AER-REQ-087, AER-REQ-088, AER-REQ-090 |
| review_policy | revisão humana antes do merge |

**Escopo:** TUI Ink do ases: cabeçalho com projeto/engine, log da sessão, painel de fases/tarefas, prompt com histórico, Tab/?/Esc/Ctrl+L, Ctrl+C duplo; fallback modo linha fora de TTY

## Critérios de aceite
- [ ] prompt único com histórico
- [ ] Ctrl+C informa destino do engine
- [ ] fora de TTY cai no modo linha

## Testes
- [ ] apps/ases-cli/test/*.test.tsx
- [ ] test/e2e/pty.test.mjs

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
