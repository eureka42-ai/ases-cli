# TUI no Windows Terminal / ConPTY (TAR-0069 → TAR-0070, AER-REQ-234)

**Estado: PASS no CI** (run 45447285906: windows-latest com Node 22 e 24, e windows-11-arm).

O e2e `test/e2e/conpty.test.mjs` abre as TUIs num **ConPTY real** pelo `node-pty@1.1.0`. A dependência nativa foi aprovada pelo responsável em 24/11/2026.
- **Onde o node-pty entra:** só o CI do Windows instala, com `npm install --no-save`. Ele não vai para o lockfile nem para o pacote publicado.
- **Sem harness, sem skip:** com `AER_REQUIRE_CONPTY=1`, a falta do harness falha o teste em vez de pulá-lo.

O que o teste cobre:
1. **`ases` com `WT_SESSION`:** a variável é a que o Windows Terminal define. Esperado:
   - o logo com ⌘, em teal truecolor;
   - o `?` abre a ajuda e o `Esc` fecha;
   - um comando digitado cria uma fase;
   - o redimensionamento para 40 colunas redesenha a tela;
   - `Ctrl+C` duas vezes sai com código 0.
2. **`ases-tar`:** fica LIVE, mostra a tarefa criada por um `ases` em outro processo, e `q` sai com 0.
3. **`NO_COLOR`:** nenhuma cor sai, a ajuda continua completa e a saída é limpa.

**Não coberto pelo teste:** o conhost antigo (fallback `E42`) e o Windows PowerShell 5.1 como host do terminal. O roteiro abaixo continua valendo para esses casos.

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
