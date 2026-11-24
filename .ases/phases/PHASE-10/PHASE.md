<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-10 — Segurança e registry de extensões

- **Estado:** COMPLETED (v5)
- **Requisitos da fase** (união das tarefas): AER-REQ-131, AER-REQ-132, AER-REQ-133, AER-REQ-134, AER-REQ-135, AER-REQ-136, AER-REQ-138, AER-REQ-139, AER-REQ-140, AER-REQ-161, AER-REQ-162, AER-REQ-166, AER-REQ-168, AER-REQ-169, AER-REQ-173, AER-REQ-175, AER-REQ-229

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0048 — Policy engine: escopos, deny-by-default, approvals por hash com escopo e validade (/approval) | COMPLETED | — | — | AER-REQ-161, AER-REQ-162, AER-REQ-169, AER-REQ-173 |
| TAR-0049 — SecretStore nativo (Keychain macOS, libsecret Linux; Windows explícito) | COMPLETED | — | — | AER-REQ-166, AER-REQ-229 |
| TAR-0050 — Skill registry: discovery, frontmatter seguro, hash, preview, import por referência | COMPLETED | — | — | AER-REQ-131, AER-REQ-132, AER-REQ-133, AER-REQ-140 |
| TAR-0051 — MCP bridge: discovery, inspeção, allowlist, health sob timeout, namespace | COMPLETED | — | — | AER-REQ-135, AER-REQ-136 |
| TAR-0052 — Plugin manager: scan de supply chain, compatibilidade, instalação delegada ao CLI oficial | COMPLETED | — | — | AER-REQ-134, AER-REQ-138, AER-REQ-139, AER-REQ-168 |
| TAR-0053 — Testes de segurança do gate (plugin inseguro, Claude-only, logs redigidos) | COMPLETED | — | — | AER-REQ-140, AER-REQ-166, AER-REQ-175 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).

## Relatório de conclusão
- **TAR-0048** COMPLETED: sem test run; 2 evidência(s)
- **TAR-0049** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0050** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0051** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0052** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0053** COMPLETED: sem test run; 1 evidência(s)
- Motivo registrado na conclusão: CI Linux/Windows 6/6 run 45254652196; macOS 22.x passou (seq 500)
