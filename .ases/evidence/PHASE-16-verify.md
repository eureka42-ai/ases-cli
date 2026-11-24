# PHASE-16: verificação (24/11/2026, sessão Claude Code)

**Ambiente:** darwin-arm64, Node v22.19.0, branch `ases/PHASE-16`.
- **CI run 45447285906 (`229639c`):** Windows 3/3 e Linux 3/3 (x64 e arm64), com `conpty.test.mjs` 3/3 nos três jobs de Windows. Os jobs de macOS foram cancelados na fila (NOT_RUN).
- **Local (macOS Apple Silicon):** `npm run verify` deu 283 passed e 6 skipped (os testes só de Windows, incluindo os 3 do ConPTY). `pack.mjs` e `pack-smoke.mjs` OK com `eureka42-ai-aer-1.0.0.tgz`.

**Decisões do responsável (24/11/2026):**
- a versão é 1.0.0;
- o pacote é publicado no npm pela conta `eureka42-ai`, como `@eureka42-ai/aer`, porque o escopo `@eureka42` não existe no registro;
- o macOS fica com verificação local;
- o `node-pty` foi aprovado, só para o CI do Windows;
- os alvos arm64 de Windows/Linux passam a TARGET.

| TAR | Entrega | Evidência |
|---|---|---|
| 0071 | Cor em 24/8/4 bits pelo terminal (`colorDepth` nas capacidades; `fgCode`) | `branding.test.ts` "approximates the palette…": nenhum escape truecolor abaixo de 24 bits; `platform.test.ts` |
| 0072 | Temas `contrast` (negrito+inverso na cor do terminal) e `auto` (teal/contrast/mono pela profundidade) | `branding.test.ts` com a razão WCAG medida (tabela em `docs/BRANDING_EUREKA42.md`): todos ≥ 3:1 em pelo menos um fundo; blue 2,88 no preto e gold 2,56 no branco ficam registrados |
| 0073 | Precedência CLI > `.ases/CONFIG.json` > config global > `auto`; valor inválido cita a origem | `branding.test.ts`, `project-store.test.ts`; smoke manual com os bins (`--theme pink` exit 2, `ui.theme` inválido no projeto exit 1, CLI válido vence) |
| 0074 | `--no-animation` aceito; teste que falha se as TUIs ganharem timer de desenho; largura 50 também no `ases` | `tui-shared/test/no-animation.test.ts`; `apps/ases-cli/test/tui.test.tsx` 40/50/80/120 |
| 0075 | Gate de release: versão 1.0.0, matriz (`docs/MATRIZ_SUPORTE.md`, run 45447285906), notas (`docs/RELEASE_NOTES_1.0.0.md`), pacote único autocontido para todas as plataformas | `pack-smoke` nos 6 jobs do CI e local; publicação registrada abaixo |
| 0070 | TUI no ConPTY real (`node-pty@1.1.0`, só no CI do Windows, com `AER_REQUIRE_CONPTY=1`) | `test/e2e/conpty.test.mjs` 3/3 em windows-latest (Node 22 e 24) e windows-11-arm |
