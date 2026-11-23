# PHASE-09 — verificação (2026-11-23, sessão Claude Code)

**Ambiente:** darwin-arm64, Node v22.19.0, branch `ases/PHASE-09`.

## Gate da fase: entrevista → 2 fases e 3 tarefas rastreáveis
Teste `test/e2e/methodology.test.mjs`, que usa os bins compilados num projeto temporário novo:
- **`/ases import`:**
  - 3 fontes copiadas byte a byte, com o SHA-256 conferido;
  - 300 REQ gerais na matriz;
  - `/gate G0` dá FAIL antes do import e PASS depois.
- **Entrevista:**
  - a 1ª rodada traz A.1–A.6;
  - depois de responder A.1, propor A.2 e marcar a trilha G como N/A, a 2ª rodada não repete A.1/A.2 e começa em A.3.
- **`/gate G1`:**
  - FAIL com `PROPOSED: A.2` e sem requisitos de domínio;
  - PASS depois de confirmar A.2 e criar e aprovar REQ-301..303.
- **CHANGE:** editar o REQ-302 aprovado sem CHANGE é recusado; com o `CHANGE-0001` citando o REQ-302, passa.
- **Tarefas:**
  - 2 fases e 3 tarefas criadas com `--reqs`;
  - tarefa sem requisito: recusada;
  - tarefa com `REQ-999` inexistente: recusada.
- **Estado dos requisitos:**
  - `PASS` sem evidência é recusado;
  - `PASS --evidence evidencia.md` passa;
  - `N/A` em REQ-001 (CORE) sem aprovação é recusado; com `--approved-by`, passa.
- **Relatórios:**
  - `TRACEABILITY.csv` liga REQ-301 → PHASE-01 → TAR-0001;
  - `REQUIREMENTS-MATRIX.csv` tem 303 linhas, com evidência e aprovação;
  - `DECISIONS.md` mostra o SUPERSEDED e o CHANGE.

## No próprio AER
`/ases import` e `/gate G0` no repositório do AER deram **PASS**. A migração v2 → v3 do banco real fez backup antes (`.ases/db/ases.sqlite.bak-v2-…`). Os 300 REQ gerais estão `PENDING` no AER; a avaliação de aplicabilidade não foi feita nesta fase.

## `npm run verify`
```text
boundaries: OK
 Test Files  40 passed (40)
      Tests  248 passed (248)
```
