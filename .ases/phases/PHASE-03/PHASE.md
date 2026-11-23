# PHASE-03 — Dois executáveis e IPC

Status: ver `STATUS.json` e `.ases/STATUS.md`
Requisitos: AER-REQ-004, AER-REQ-011, AER-REQ-240, AER-REQ-241, AER-REQ-245, AER-REQ-247, AER-REQ-014, AER-REQ-071, AER-REQ-072, AER-REQ-078, AER-REQ-080, AER-REQ-228, AER-REQ-070, AER-REQ-074, AER-REQ-075, AER-REQ-076, AER-REQ-077, AER-REQ-073, AER-REQ-079, AER-REQ-170, AER-REQ-090, AER-REQ-091, AER-REQ-093, AER-REQ-094, AER-REQ-099, AER-REQ-191
Entrada: repositório sem modificações destrutivas; fontes com SHA-256 conferido
Tarefas: TAR-0011, TAR-0012, TAR-0013, TAR-0014, TAR-0015
Dependências (DAG): TAR-0011 ← ∅; TAR-0012 ← TAR-0011; TAR-0013 ← TAR-0012; TAR-0014 ← TAR-0012; TAR-0015 ← TAR-0013+TAR-0014
Riscos: dependências npm de terceiros; matriz Windows/Linux não executável neste host (NOT_RUN)
Gate: ases e ases-tar em processos distintos; evento emitido no ases aparece no ases-tar; ases-tar não consegue mutar; reconexão sem lacuna/duplicata
Evidência: `.ases/evidence/`
Aprovador: humano responsável
