# TUI no Windows Terminal / ConPTY (TAR-0069, AER-REQ-234)

**Estado: NOT_RUN.** O CI do Windows testa o modo linha sem TTY (`--no-tui`, `--json`, `--follow --format jsonl`). A TUI interativa (Ink em raw mode num ConPTY) **não tem teste automático**, porque o projeto não tem harness de pseudo-terminal para Windows. No macOS e no Linux, o e2e `test/e2e/pty.test.mjs` usa `script`; no Windows ele é pulado.

Adicionar um harness ConPTY (por exemplo `node-pty`) é dependência nova com binário nativo, e exige revisão do responsável (CLAUDE.md). Até lá, o suporte da TUI no Windows não é anunciado como testado.

## Roteiro manual (Windows Terminal + PowerShell 7 e Windows PowerShell 5.1)
Faça cada passo numa pasta com espaço e acento, por exemplo `C:\Users\<você>\Projetos\teste ç`.

1. `ases init --name teste`, depois `ases`.
   - Esperado: logo Eureka42 com ⌘ (ou `E42` no conhost antigo).
   - O `?` abre a ajuda e o `Esc` fecha.
2. Em outro painel, na mesma pasta: `ases-tar`.
   - Esperado: o status muda para LIVE.
3. No `ases`, rode `/phase new P`, `/task new PHASE-01 t --provider simulator`, `/task move TAR-0001 READY` e `/run`.
   - Esperado: o `ases-tar` mostra os eventos ao vivo e a tarefa chega a REVIEW.
4. Redimensione a janela para cerca de 40 colunas.
   - Esperado: o logo cai para a versão compacta ou mínima, sem quebrar linha.
5. Faça `Ctrl+C` no `ases-tar` e depois `/exit` no `ases`.
   - Esperado: os dois saem sem erro, e `Get-Process node` não mostra processo do AER sobrando.
6. Repita com `$env:NO_COLOR=1`.
   - Esperado: nenhuma cor, e o texto continua completo.

Registre o resultado (PASS/FAIL, versão do Windows e do terminal) em `.ases/evidence/` para mudar o estado.
