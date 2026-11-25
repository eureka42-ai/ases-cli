# PHASE-20: verificação da 1.1.2 (24/11/2026)

- **CI run 45529392214:** 8/8. Local: 416 passed. O pack-smoke deu OK.
- **Abertura limpa:** a tela é limpa e mostra só a pergunta da pasta; depois, o logo e o chat. O modo do assistente ficou explicado.
- **Codex numa pasta sem Git:** passa `--skip-git-repo-check`, e o erro mostra o motivo que a IA deu. O plano sem Git avisa antes de começar.
- **`/modelo`:** seletor por IA, aplicado à principal e às tarefas.
  - Claude por `--model`, Codex por `-m`, e Kimi e Google por ACP `session/set_model`. O OpenCode é só leitura.
  - As listas vêm das CLIs (`claude --help`, `agy models`, `opencode models`), conferidas na máquina do responsável.
- **Não verificado com IA real:** a troca de modelo pelo ACP (testada só com um agente falso) e o `--skip-git-repo-check` com o Codex de verdade.
