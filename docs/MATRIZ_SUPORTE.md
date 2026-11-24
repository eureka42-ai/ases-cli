# Matriz de suporte (run 45447285906, commit 229639c)

Gerada por `scripts/support-matrix.mjs` a partir dos jobs reais do CI. NOT_RUN não é PASS.

| Alvo | Nível | Node | Runner | Estado |
|---|---|---|---|---|
| darwin-arm64 | TARGET | 22.x | macos-latest | NOT_RUN |
| darwin-arm64 | TARGET | 24.x | macos-latest | NOT_RUN |
| linux-arm64 | TARGET | 22.x | ubuntu-24.04-arm | PASS |
| linux-x64 | TARGET | 22.x | ubuntu-latest | PASS |
| linux-x64 | TARGET | 24.x | ubuntu-latest | PASS |
| win32-arm64 | TARGET | 22.x | windows-11-arm | PASS |
| win32-x64 | TARGET | 22.x | windows-latest | PASS |
| win32-x64 | TARGET | 24.x | windows-latest | PASS |

| Alvo | Resultado do alvo |
|---|---|
| darwin-arm64 | NOT_RUN |
| linux-arm64 | PASS |
| linux-x64 | PASS |
| win32-arm64 | PASS |
| win32-x64 | PASS |

## Notas (24/11/2026)
- **darwin-arm64:** os jobs de macOS do GitHub foram cancelados na fila (NOT_RUN). O responsável aceitou para a 1.0.0 a verificação local (macOS Apple Silicon, Node 22.19.0): `npm run verify` com 283 passed, e o pacote instalado pelo `pack-smoke`. O último run com macOS 8/8 no CI é o 45304163008.
- **arm64 de Windows e Linux:** TARGET desde 24/11/2026, por decisão do responsável (AER-REQ-239).
- **TUI no ConPTY do Windows:** `test/e2e/conpty.test.mjs` 3/3 em windows-latest (Node 22 e 24) e windows-11-arm neste run.
