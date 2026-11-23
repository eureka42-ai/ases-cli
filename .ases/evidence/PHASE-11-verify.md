# PHASE-11 — verificação (2026-11-23, sessão Claude Code)

**Ambiente:** darwin-arm64, Node v22.19.0, branch `ases/PHASE-11` (empilhada sobre `ases/PHASE-10`, ainda não aprovada).

## Gate: alternar uma tarefa entre dois providers sem perder arquivos, testes e histórico
**e2e** (`test/e2e/continuity.test.mjs`, bins compilados, POSIX):
1. **Tentativa 1 (`simulator`):** vai a REVIEW e escreve `SIMULATED/TAR-0001.md`.
2. **`/test TAR-0001 node -e …`:**
   - pede `APR-…` (EXEC_TESTS);
   - depois de `/approval grant`, dá `exit 0`, com o log em `.ases/evidence/TAR-0001-test-01.log`.
3. **`/handoff TAR-0001 claude …`:**
   - grava `.ases/handoffs/TAR-0001-H01.md` (com o test run; sem e-mail);
   - "próxima tentativa parte de <ponta da ATT-0001>"; tarefa READY.
4. **Tentativa 2 (`claude`, falso binário oficial):**
   - sem `--consent`: `BLOCKED CONSENT_REQUIRED`;
   - com `--consent`: REVIEW.
   - A branch ATT-0002 tem **os dois** arquivos (`SIMULATED/TAR-0001.md` e `NOTA.md`), e a ATT-0001 é ancestral dela.
   - As instruções da ATT-0002 contêm o HANDOFF.
5. **Revisão:**
   - o autor (`simulator`) não revisa;
   - `/review TAR-0002 simulator:review` dá **APPROVED**;
   - `simulator:review-write` dá **INVALID (REVIEWER_WROTE)**: o arquivo do revisor não está nem na branch da tarefa nem no checkout, e a tarefa continua REVIEW.
6. **`/usage`:** tokens do `claude` com a fonte `claude stream-json result`; o simulador separado. **`/resume` 2×:** "nada a recuperar", sem tentativas novas.

**Unidade** (`packages/scheduler/test/continuity.test.ts`, todos os SOs; simulador sob dois ids):
- a cadeia de checkpoints, o handoff com test run e o `merge-base --is-ancestor`;
- o pacote de contexto ≤ orçamento, com ponteiro para a fonte;
- recovery de lease vencido: as sobras viram checkpoint "NÃO verificado"; 2º resume dá `[]`;
- revisão independente: autor recusado, APPROVED e INVALID com a escrita descartada.

## `npm run verify`
```text
boundaries: OK
 Test Files  45 passed (45)
      Tests  268 passed (268)
```
