# PHASE-04 — TUI utilizável + marca Eureka42

Status: ver `STATUS.json` e `.ases/STATUS.md`
Requisitos: AER-REQ-240, AER-REQ-243, AER-REQ-248, AER-REQ-100, AER-REQ-081, AER-REQ-084, AER-REQ-085, AER-REQ-087, AER-REQ-088, AER-REQ-090, AER-REQ-092, AER-REQ-096, AER-REQ-099, AER-REQ-203, AER-REQ-094, AER-REQ-098, AER-REQ-089, AER-REQ-201, AER-REQ-244, AER-REQ-245, AER-REQ-246
Entrada: repositório sem modificações destrutivas; fontes com SHA-256 conferido
Tarefas: TAR-0016, TAR-0017, TAR-0018, TAR-0019, TAR-0020
Dependências (DAG): TAR-0016 ← ∅; TAR-0017 ← TAR-0016; TAR-0018 ← TAR-0016; TAR-0019 ← TAR-0018; TAR-0020 ← TAR-0017+TAR-0018+TAR-0019
Riscos: dependências npm de terceiros; matriz Windows/Linux não executável neste host (NOT_RUN)
Gate: TUIs em 40x16, 80x24 e 120x35 sem quebra; resize; teclado; marca Eureka42 com fallback e sem ANSI em NO_COLOR; pty E2E
Evidência: `.ases/evidence/`
Aprovador: humano responsável
