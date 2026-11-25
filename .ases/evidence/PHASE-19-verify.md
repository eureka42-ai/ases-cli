# PHASE-19: verificação da 1.1.1 (24/11/2026)

**CI run 45519453101:** 8/8 (macOS 2/2, Windows 3/3 com ConPTY, Linux 3/3). Local: 405 passed, 8 skipped (só Windows).

**O que mudou:**
- **Conversa no estilo do Claude Code:** `>` para você, `●` verde para a IA e `●` laranja para as ações ao vivo.
- **O que mudou no projeto:** diff +/− por arquivo.
- **Pensando:** `✻` com uma palavra criativa e o tempo correndo. É um relógio opcional pelo AER-REQ-246, desligado com `--no-animation`, em CI e com TERM=dumb. `Esc` interrompe.
- **ases-tar:** mostra a IA e a ação de cada tarefa, mais a linha da principal.
- **Tela inicial "Onde vamos trabalhar?":** Esta pasta, Mesa, escolher ou um recente. O init é automático, e o ases-tar segue o último projeto.
- **Autorização única das IAs:** fica só na config pessoal.
- **Assistente:** ganhou o modo híbrido e a opção de digitar o comando de teste.
- **README do GitHub.**

**Testes principais:**
- `chat-format.test.ts`, `tui-chat.test.tsx`, `start-screen.test.tsx`;
- `ases-tar format.test.ts` e `tui.test.tsx`;
- `chat-review-fixes.test.ts` (autorização única), `git-bridge` (`turnDiff`), `no-animation.test.ts` (ticker guardado);
- pty e ConPTY.

**Defeitos achados no caminho:**
- Os testes gravavam na config pessoal real. A config foi limpa e os testes passaram a usar uma config isolada.
- O ConPTY reescreve inverso e esmaecido como códigos de cor. Sem cor, nenhum dos dois é usado.

**Não verificado:** a tela com uma IA real (os testes usam o simulador).
