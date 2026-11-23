# TAR-0020 — Acessibilidade, larguras e smoke em pty

| Campo | Valor |
|---|---|
| task_id | TAR-0020 |
| phase_id | PHASE-04 |
| priority | 85 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0017, TAR-0018, TAR-0019 |
| related_reqs | AER-REQ-088, AER-REQ-089, AER-REQ-201, AER-REQ-244, AER-REQ-245, AER-REQ-246 |
| review_policy | revisão humana antes do merge |

**Escopo:** golden/larguras 40/50/80/120 nas duas TUIs, NO_COLOR sem ANSI de cor, resize, E2E em pseudo-terminal real (script) no macOS/Linux

## Critérios de aceite
- [ ] nenhuma linha excede a largura
- [ ] NO_COLOR sem códigos de cor
- [ ] pty: criar fase pela TUI e sair com Ctrl+C duplo

## Testes
- [ ] test/e2e/pty.test.mjs

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
