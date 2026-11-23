# Usando a metodologia ASES-300/500 no AER

Fluxo mínimo, dentro de `ases` (ou `ases --no-tui`):

1. **`/ases import`**:
   - copia as fontes ASES para `.ases/sources/` (SHA-256 conferido);
   - coloca `REQ-001..300` na matriz, com o texto literal;
   - **`/gate G0`** confirma as fontes e os 300 requisitos.
2. **`/spec`:** mostra a próxima rodada da entrevista ASES-500 (até 6 lacunas, sem repetir o que já foi respondido). Responda com:
   - `/spec answer A.1 <texto>` → CONFIRMED;
   - `/spec propose A.2 <texto>` → PROPOSED (recomendação ainda não aprovada);
   - `/spec validate …` → VALIDATION_REQUIRED, e `/spec open …` → OPEN;
   - `/spec na G <justificativa>` → trilha inteira N/A (p.ex. "sem IA").
3. **Requisitos do projeto** (`REQ-301+`):
   - criar: `/req add HIGH DEC-0001 <título> :: <critério de aceite verificável>`;
   - aprovar: `/req approve REQ-301 <responsável>`.
4. **`/gate G1`:** passa quando nada está OPEN/PROPOSED/VALIDATION_REQUIRED e todos os requisitos de domínio estão aprovados e têm aceite.
5. **Fases e tarefas:** `/task new PHASE-01 <título> --reqs REQ-301,REQ-019`. Com a matriz ativa, tarefa sem requisito é recusada.
6. **Estado:**
   - `PASS`: `/req set REQ-301 PASS --evidence <arquivo>` (só com evidência);
   - `N/A`: `/req set REQ-116 N/A <justificativa>`. Num requisito CORE, também `--approved-by <nome>`.
7. **Mudar algo aprovado ou confirmado:**
   - criar o CHANGE: `/change new --approved-by <nome> --targets REQ-302,A.1 <motivo>`;
   - aplicar: `/req edit REQ-302 --change CHANGE-0001 :: <novo critério>` ou `/spec change CHANGE-0001 A.1 <nova resposta>`.

**Arquivos gerados:**
- `.ases/REQUIREMENTS-MATRIX.csv`;
- `.ases/DECISIONS.md`;
- `.ases/TRACEABILITY.csv` (requisito → fase → tarefa → teste/evidência).

**Limitações:** a ASES-500 é uma consolidação **para validação**, não um original homologado. A entrevista usa as perguntas literais da fonte e não gera perguntas com IA.
