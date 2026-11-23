# PHASE-01 — Repositório e bootstrap seguro

Status: ver `STATUS.json` e `.ases/STATUS.md`
Requisitos: AER-REQ-001, AER-REQ-002, AER-REQ-003, AER-REQ-204, AER-REQ-005, AER-REQ-006, AER-REQ-007, AER-REQ-010, AER-REQ-013, AER-REQ-021, AER-REQ-031, AER-REQ-011, AER-REQ-016, AER-REQ-151, AER-REQ-181, AER-REQ-190, AER-REQ-195, AER-REQ-225, AER-REQ-226, AER-REQ-227, AER-REQ-228, AER-REQ-229, AER-REQ-233
Entrada: repositório sem modificações destrutivas; fontes com SHA-256 conferido
Tarefas: TAR-0001, TAR-0002, TAR-0003, TAR-0004, TAR-0005
Dependências (DAG): TAR-0001 ← ∅; TAR-0002 ← TAR-0001; TAR-0003 ← TAR-0002; TAR-0004 ← TAR-0002; TAR-0005 ← TAR-0002
Riscos: dependências npm de terceiros; matriz Windows/Linux não executável neste host (NOT_RUN)
Gate: npm install autorizado; lint, typecheck e testes básicos passando
Evidência: `.ases/evidence/`
Aprovador: humano responsável
