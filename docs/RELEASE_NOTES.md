# AER 1.x: notas de versão

## 1.1.2 (24/11/2026)
- **Abertura limpa:** ao rodar `ases`, a tela é limpa e aparece só a pergunta **"Onde vamos trabalhar?"**. Depois da escolha, a tela é limpa de novo e entram o logo e o chat.
- **`/modelo`:** escolhe o modelo de cada IA num seletor: `←` `→` escolhe a IA, `↑` `↓` o modelo, Espaço seleciona, Esc fecha. Também dá para usar `/modelo <ia> <modelo>`. O modelo escolhido vale para a principal e para as tarefas daquela IA, e fica na sua config pessoal.
  - **De onde vêm as listas:** `claude --help` (fable, opus, sonnet), `agy models` (Google) e `opencode models`. No Codex e no Kimi, você digita o nome.
  - **Como o AER aplica:** `--model` no Claude, `-m` no Codex, e `session/set_model` pelo ACP no Kimi e no Google. Modelo recusado vira erro claro (`MODEL_UNAVAILABLE`).
  - **OpenCode 2.4.1:** não troca de modelo pelo ACP. A lista aparece, e a escolha fica no `opencode.json` dele.
- **Codex numa pasta sem Git (por exemplo, a Mesa):** o Codex se recusava a rodar e o chat só mostrava "exit 1". O AER passa a enviar `--skip-git-repo-check`; o isolamento continua sendo o sandbox `-s` do AER. Quando uma IA falha, a mensagem agora traz o motivo que ela deu, sem repetir o código.
- **Planos sem Git:** numa pasta sem Git, o plano avisa antes de começar que as tarefas em paralelo precisam de Git (`git init` e um primeiro commit). A conversa com a principal continua funcionando.
- **Assistente:** a pergunta do modo diz "(escolha uma)" e explica cada opção (manual, automático, híbrido).

## 1.1.1 (24/11/2026): conversa no estilo do Claude Code e ases-tar mostrando quem faz o quê
- **Conversa:**
  - sua mensagem aparece com `>` em cinza, e a resposta da IA com `●` verde;
  - uma linha em branco separa as mensagens;
  - listas, **negrito** e blocos de código aparecem formatados, e as linhas longas quebram por palavra.
- **Enquanto a IA trabalha:**
  - cada ação aparece na hora, com `●` laranja ("Lendo src/app.ts", "Editando README.md");
  - a linha de "pensando" mostra uma palavra criativa em laranja e o tempo correndo, por exemplo `✻ Matutando… (claude · 18 s · Esc para interromper)`;
  - `Esc` interrompe a IA.
  - **Quando o relógio não corre:** ele é opcional (AER-REQ-246) e fica parado com `--no-animation`, em CI, com `TERM=dumb` e com `ASES_REDUCED_MOTION=1`.
- **O que mudou:** depois de cada edição da principal, cada arquivo aparece com `+N −M` e as linhas alteradas, em verde (+) e vermelho (−). `/desfazer` volta tudo.
- **Prompt:** fica numa caixa arredondada embaixo.
- **`ases-tar`:**
  - cada ação aparece em português e na hora: qual IA, qual tarefa e o que está fazendo;
  - a lista de tarefas mostra quem está fazendo cada uma e a última ação dela;
  - uma linha mostra o que a principal do chat está fazendo agora.
- **Sem `ases init`:** ao abrir, o `ases` pergunta **"Onde vamos trabalhar?"**, com as opções Esta pasta, **Mesa**, Escolher uma pasta… ou um projeto recente. A pasta escolhida vira projeto sozinha. O `ases-tar` aberto fora de um projeto acompanha o último projeto aberto.
- **Autorização das IAs uma vez só:**
  - o assistente pergunta uma vez se o AER pode usar as IAs instaladas, com a sua conta e cota;
  - a resposta fica **só na sua config pessoal**, e um projeto baixado nunca liga isso;
  - `/config revogar todas` desliga.
- **Assistente:** ganhou o modo **híbrido** e a opção de **digitar o seu comando de teste**, e explica por que algumas IAs não aparecem na escolha.

## 1.1.0 (24/11/2026): console de conversa com IA principal e orquestração em paralelo
- **Chat:** o `ases` abre num chat com a **IA principal** escolhida por você (`/ia`). Ela conversa, lê, planeja e edita o projeto.
  - **Restauração:** antes de cada turno o AER grava um ponto de restauração, e `/desfazer` volta.
  - **Sem Git:** o chat funciona, só o `/desfazer` fica indisponível.
- **Orquestração:** um pedido grande vira um **plano**. O ASES divide as tarefas entre as **outras** IAs, explica cada escolha e as executa **em paralelo**, cada uma numa worktree.
- **Qualidade automática:**
  - **revisão cruzada** por outra IA;
  - **troca automática** de IA em limite de cota, login expirado ou travamento (até 2 por tarefa);
  - **testes obrigatórios**: uma tarefa só fica pronta com o comando de teste passando (até 2 refações).
- **Comandos simples em português**, com alias em inglês e menu ao digitar `/`: `/ia`, `/ias`, `/plano`, `/auto`, `/tarefas`, `/ver`, `/aceitar`, `/refazer`, `/trocar`, `/desfazer`, `/parar`, `/nova`, `/config`, `/atualizar` e `/sobre`. Os comandos técnicos seguem em `/ajuda avançado`.
- **Assistente de primeiro uso** (sem IA): detecta as IAs e pergunta a principal, o modo, o limite e o comando de teste.
- **Logo:** banner **EUREKA 42** grande, em verde (`#22C55E`, tema `green`, padrão do `auto`).
- **Sobre:** `/sobre`, `ases about` e `ases-tar --about`. `eureka42.org` aparece no banner, no `--help` e no `--version`.
- **Atualização:** `ases update` e `/atualizar` instalam a versão mais nova do npm. O npm só é consultado quando você pede.
- **Segurança:**
  - uma IA real só roda com a sua autorização por sessão (`/config consentir`);
  - a principal nunca escreve em `.git`, `.ases` ou segredos;
  - nada entra no projeto sem `/aceitar`.
- **Correção:** `/aceitar` e o merge ignoram os arquivos do engine em `.ases/` ao checar se o checkout está sujo.

**Limitação conhecida:** uma tarefa que depende de outra do mesmo plano começa do HEAD e não vê as mudanças da anterior até o `/aceitar`.

## 1.0.1 (24/11/2026)
- **Correção (Windows):** os providers instalados com `npm install -g`, como `claude.cmd` e `codex.cmd`, não eram encontrados e o `ases doctor` não os mostrava como READY.
  - **Causa:** o Node não executa `.cmd` sem shell, e o AER não usa shell.
  - **Correção:** o AER lê o alvo do shim do npm (o script JS, rodado pelo Node, ou o `.exe`) e executa esse alvo direto, ainda sem shell. Qualquer outro `.cmd` continua recusado.

## 1.0.0 (TAR-0075, 24/11/2026)

**Instalar:** `npm install -g @eureka42-ai/aer`, publicado pela conta npm `eureka42-ai`. O mesmo pacote existe como `.tgz` autocontido, gerado por `node scripts/pack.mjs`, que instala sem rede.

## O que vem nesta versão
- **Dois comandos:** `ases` (TUI e comandos) e `ases-tar` (monitor somente leitura, ao vivo, por IPC local; sem servidor de rede).
- **Motor local:** event store SQLite com migrações e backup; tarefas com leases e fencing; worktree Git por tentativa; checkpoints; motor residente (`ases daemon`).
- **Providers** (consentimento por run, `/run --consent`; o AER nunca faz login):

  | Provider | Status | Versão verificada |
  |---|---|---|
  | Claude Code | VERIFIED | 2.1.330 |
  | Codex | VERIFIED | 0.170.0 |
  | Kimi | VERIFIED | 1.50.0 |
  | OpenCode | VERIFIED | 2.4.1 |
  | Google, via Antigravity CLI | VERIFIED | 1.5.13 |

  O simulador serve para testar tudo sem conta.
- **Metodologia ASES-300/500:** os 300 requisitos literais, entrevista por trilhas, decisões, CHANGE e gates G0/G1. O ASES-500 sai com o selo "PARA VALIDAÇÃO".
- **Segurança:**
  - políticas deny-by-default, com aprovações ligadas ao hash da operação;
  - registry de extensões com inspeção e compatibilidade por provider;
  - redação de segredos;
  - SecretStore nativo: Keychain no macOS, Credential Manager no Windows, Secret Service no Linux.
- **Continuidade:** handoff entre providers sem perder arquivos; `/test` real; `/review` independente; `/resume`; `/usage` por provider; `/diff` só leitura.
- **Marca Eureka42:**
  - logo em 4 modos;
  - temas teal/blue/purple/gold/mono/contrast/auto, com cor em 24/8/4 bits;
  - precedência CLI > projeto > global;
  - `NO_COLOR` e `--json` limpos.

## Plataformas
A matriz por alvo está em `docs/MATRIZ_SUPORTE.md`, gerada dos jobs reais do CI.

| Alvo | Situação |
|---|---|
| Windows x64, Linux x64 | PASS no CI (Node 22 e 24), incluindo o pacote instalado, os shells e, no Windows, a TUI num ConPTY real |
| Windows arm64, Linux arm64 | PASS no CI, **suportados** desde esta versão |
| macOS Apple Silicon | Verificado na máquina do responsável (decisão de 24/11/2026). Os jobs de macOS do CI foram cancelados na fila (NOT_RUN); o último 8/8 no CI foi o run 45304163008 |
| macOS Intel | Fora do escopo (CHANGE-0001) |

## Limitações conhecidas
- **TUI no Windows:** coberta no ConPTY/Windows Terminal (CI). O conhost antigo e o PowerShell 5.1 como host só têm o roteiro manual (`docs/SUPORTE_TERMINAIS_WINDOWS.md`).
- **Sem supervisor do SO:** reboot ou queda do motor exigem `/resume` (ADR-0017).
- **Exceções P0 aprovadas para depois desta versão** (`docs/AUDITORIA_P0.md`): 020, 025, 026, 029, 049, 082, 083, 086, 128, 174, e 230 (SMB remoto).
- **Uso de tokens:** sem dados de uso para os providers ACP; só o que cada cliente reporta é mostrado.
- **Constrained Language Mode no Windows:** o AER falha fechado (ADR-0018).

## Licença
- **AER:** CC BY-NC-ND 4.0.
- **Terceiros embutidos:** 41 pacotes MIT/ISC/CC0, com os avisos em `THIRD_PARTY_LICENSES.md` dentro do pacote.
