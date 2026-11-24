# PHASE-16: verificação parcial (24/11/2026, sessão Claude Code)

**Ambiente:** darwin-arm64, Node v22.19.0, branch `ases/PHASE-16`.
- **CI run 45420199279 (`3f21d92`):** Windows 3/3 e Linux 3/3 (x64 e arm64). macOS na fila.
- **Local:** `npm run verify` deu 283 passed e 3 skipped (os 3 testes só de Windows).

| TAR | Entrega | Evidência |
|---|---|---|
| 0071 | Cor em 24/8/4 bits pelo terminal (`colorDepth` nas capacidades; `fgCode`) | `branding.test.ts` "approximates the palette…": nenhum escape truecolor abaixo de 24 bits; `platform.test.ts` |
| 0072 | Temas `contrast` (negrito+inverso na cor do terminal) e `auto` (teal/contrast/mono pela profundidade) | `branding.test.ts` com a razão WCAG medida (tabela em `docs/BRANDING_EUREKA42.md`): todos ≥ 3:1 em pelo menos um fundo; blue 2,88 no preto e gold 2,56 no branco ficam registrados |
| 0073 | Precedência CLI > `.ases/CONFIG.json` > config global > `auto`; valor inválido cita a origem | `branding.test.ts`, `project-store.test.ts`; smoke manual com os bins (`--theme pink` exit 2, `ui.theme` inválido no projeto exit 1, CLI válido vence) |
| 0074 | `--no-animation` aceito; teste que falha se as TUIs ganharem timer de desenho; largura 50 também no `ases` | `tui-shared/test/no-animation.test.ts`; `apps/ases-cli/test/tui.test.tsx` 40/50/80/120 |
| 0075 | Gate de release | Rascunho em `docs/RELEASE_NOTES_RASCUNHO.md`; aguarda decisões (versão, publicação npm, macOS) |
| 0070 | TUI no ConPTY | NOT_RUN (`docs/SUPORTE_TERMINAIS_WINDOWS.md`) |
