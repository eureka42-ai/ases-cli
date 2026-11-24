# Matriz de suporte (run 45411121443, commit ad0e4ac)

Gerada por `scripts/support-matrix.mjs` a partir dos jobs reais do CI. NOT_RUN não é PASS.

| Alvo | Nível | Node | Runner | Estado |
|---|---|---|---|---|
| darwin-arm64 | TARGET | 22.x | macos-latest | NOT_RUN |
| darwin-arm64 | TARGET | 24.x | macos-latest | NOT_RUN |
| linux-arm64 | CONDITIONAL | 22.x | ubuntu-24.04-arm | PASS |
| linux-x64 | TARGET | 22.x | ubuntu-latest | PASS |
| linux-x64 | TARGET | 24.x | ubuntu-latest | PASS |
| win32-arm64 | CONDITIONAL | 22.x | windows-11-arm | PASS |
| win32-x64 | TARGET | 22.x | windows-latest | PASS |
| win32-x64 | TARGET | 24.x | windows-latest | PASS |

| Alvo | Resultado do alvo |
|---|---|
| darwin-arm64 | NOT_RUN |
| linux-arm64 | PASS (CONDITIONAL: não anunciado como suportado) |
| linux-x64 | PASS |
| win32-arm64 | PASS (CONDITIONAL: não anunciado como suportado) |
| win32-x64 | PASS |
## Notas
- **macOS (darwin-arm64):** os jobs do GitHub ficaram na fila e foram cancelados sem rodar (NOT_RUN no CI). A verificação local é feita no Apple Silicon do responsável, a cada fase: `npm run verify` e `pack-smoke` (evidências em `.ases/evidence/PHASE-*-verify.md`). O último run com macOS 8/8 foi o 45304163008 (`24aedaa`).
- **TUI interativa no Windows Terminal/ConPTY:** NOT_RUN (`docs/SUPORTE_TERMINAIS_WINDOWS.md`).
- **arm64 de Windows e Linux:** passam no CI, mas continuam CONDITIONAL até decisão do responsável (AER-REQ-239).
- Para atualizar: `node scripts/support-matrix.mjs <run-id> --out docs/MATRIZ_SUPORTE.md`. Todo run do CI também publica a matriz no resumo.
