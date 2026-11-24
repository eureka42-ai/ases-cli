<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-15 — Portabilidade Windows e Linux verificada

- **Estado:** COMPLETED (v6)
- **Requisitos da fase** (união das tarefas): AER-REQ-122, AER-REQ-225, AER-REQ-227, AER-REQ-229, AER-REQ-230, AER-REQ-233, AER-REQ-234, AER-REQ-238, AER-REQ-239

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0065 — SecretStore Windows (Credential Manager, segredo só por stdin, falha fechado) | COMPLETED | — | — | AER-REQ-122, AER-REQ-229 |
| TAR-0066 — ACL do runtime dir e do Named Pipe no Windows verificadas (icacls) | COMPLETED | — | — | AER-REQ-227 |
| TAR-0067 — Caminhos Windows: UNC, junction, letra de unidade, acentos e espaços | COMPLETED | — | — | AER-REQ-230 |
| TAR-0068 — Matriz de suporte publicada por SO/arquitetura com PASS/FAIL/NOT_RUN e doctor | COMPLETED | — | — | AER-REQ-225, AER-REQ-233, AER-REQ-238, AER-REQ-239 |
| TAR-0069 — TUI em ConPTY/Windows Terminal ou registro NOT_RUN honesto | CANCELLED | — | — | AER-REQ-234 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).

## Relatório de conclusão
- **TAR-0065** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0066** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0067** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0068** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0069** CANCELLED: sem test run; 1 evidência(s) · **exceção: cancelada**
- Motivo registrado na conclusão: aprovada pelo responsável; main em 0ec6d60 (seq 618)
