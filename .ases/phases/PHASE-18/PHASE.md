<!-- GERADO pelo engine do AER a partir do banco; não editar -->
# PHASE-18 — Chat com IA principal e orquestração em paralelo (1.1.0)

- **Estado:** COMPLETED (v5)
- **Requisitos da fase** (união das tarefas): AER-REQ-065, AER-REQ-082, AER-REQ-083, AER-REQ-110, AER-REQ-123, AER-REQ-174, AER-REQ-180, AER-REQ-187, AER-REQ-225, AER-REQ-234, AER-REQ-240, AER-REQ-247

## Tarefas e dependências (DAG)
| Tarefa | Estado | Provider | Depende de | Requisitos |
|---|---|---|---|---|
| TAR-0078 — Banner EUREKA42 verde, tema green, /sobre e eureka42.org | COMPLETED | — | — | AER-REQ-240, AER-REQ-247 |
| TAR-0079 — Config chat por camadas (principal, modo, limites, revisão, teste, autorizações) | COMPLETED | — | — | AER-REQ-083 |
| TAR-0080 — Eventos, migração 5 e store da conversa | COMPLETED | — | — | AER-REQ-065 |
| TAR-0081 — Simulador de chat e múltiplos simuladores | COMPLETED | — | — | AER-REQ-110 |
| TAR-0082 — Parser aer-plan e atribuição explicada de IAs | COMPLETED | — | — | AER-REQ-082 |
| TAR-0083 — Ponto de restauração e /desfazer | COMPLETED | — | — | AER-REQ-180 |
| TAR-0084 — Turno de chat da principal com fila | COMPLETED | — | — | AER-REQ-123 |
| TAR-0085 — Execução do plano: paralelo, testes, refação, troca automática e revisão cruzada | COMPLETED | — | — | AER-REQ-187 |
| TAR-0086 — Comandos simples em português com aliases | COMPLETED | — | — | AER-REQ-082, AER-REQ-083 |
| TAR-0087 — TUI de chat, menu /, plano, autorização e assistente | COMPLETED | — | — | AER-REQ-234 |
| TAR-0088 — ases update e /atualizar | COMPLETED | — | — | AER-REQ-174 |
| TAR-0089 — Bins, documentação, e2e do chat e release 1.1.0 | COMPLETED | — | — | AER-REQ-225 |

## Critérios
- **Entrada:** tarefas com requisitos ligados e dependências sem ciclo.
- **Encerramento:** todas as tarefas COMPLETED ou CANCELLED (o engine recusa concluir a fase com tarefa aberta).

## Relatório de conclusão
- **TAR-0078** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0079** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0080** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0081** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0082** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0083** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0084** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0085** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0086** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0087** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0088** COMPLETED: sem test run; 1 evidência(s)
- **TAR-0089** COMPLETED: sem test run; 1 evidência(s)
- Motivo registrado na conclusão: 1.1.0 aprovada pelo responsável (seq 811)
