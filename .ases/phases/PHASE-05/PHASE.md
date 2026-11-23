# PHASE-05 — Scheduler, DAG e isolamento Git

Status: ver `STATUS.json` e `.ases/STATUS.md`
Requisitos: AER-REQ-041, AER-REQ-042, AER-REQ-037, AER-REQ-043, AER-REQ-044, AER-REQ-045, AER-REQ-046, AER-REQ-047, AER-REQ-050, AER-REQ-051, AER-REQ-052, AER-REQ-053, AER-REQ-060, AER-REQ-164, AER-REQ-055, AER-REQ-056, AER-REQ-057, AER-REQ-059, AER-REQ-192, AER-REQ-158, AER-REQ-186, AER-REQ-189, AER-REQ-036, AER-REQ-181
Entrada: repositório sem modificações destrutivas; fontes com SHA-256 conferido
Tarefas: TAR-0021, TAR-0022, TAR-0023, TAR-0024, TAR-0025, TAR-0026
Dependências (DAG): TAR-0021 ← ∅; TAR-0022 ← TAR-0021; TAR-0023 ← TAR-0022; TAR-0024 ← TAR-0023; TAR-0025 ← TAR-0022+TAR-0024; TAR-0026 ← TAR-0022
Riscos: dependências npm de terceiros; matriz Windows/Linux não executável neste host (NOT_RUN)
Gate: duas tarefas paralelas em worktrees separadas, uma bloqueada por dependência, conflito simulado sem merge automático, reserva sem duplicação entre processos
Evidência: `.ases/evidence/`
Aprovador: humano responsável
