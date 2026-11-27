# AER 1.x: notas de versão

## 1.7.0 (27/11/2026): ESAA: cadeia, problemas e exportação
- **Cadeia de integridade:** cada evento passa a carregar o SHA-256 do anterior (tabela `event_chain`, também só de acréscimo). O `/verificar` refaz a cadeia e aponta o primeiro evento alterado. `/verificar fixar` guarda o elo atual na configuração pessoal, fora do projeto, e detecta até a reescrita completa do histórico. Bancos antigos ganham a cadeia ao abrir: a migração 7 roda com backup.
- **Registro de problemas** (`/problemas`, `/problema`):
  - todo bloqueio num plano (fora do limite, ou testes falhando depois de 2 refações) vira um problema, com sintoma e como reproduzir;
  - a IA principal vê os problemas abertos;
  - `/problema corrigir ISS-XXXX` pede a correção à principal, como o *hotfix* do ESAA;
  - `/problema resolver ISS-XXXX <como>` fecha o problema, o que só uma pessoa faz.
- **`/exportar-esaa`:** grava `.ases/esaa/.roadmap/activity.jsonl` no formato do próprio ESAA (log 0.4.2), com as tarefas (`task.create`, `claim`, `complete`, `review`), os problemas (`issue.report`, `issue.resolve`) e as lições. Para auditar: `esaa --root .ases/esaa project` e `esaa --root .ases/esaa verify`.

## 1.6.0 (27/11/2026): integração com o ESAA
Peças do [ESAA](https://github.com/elzobrito/ESAA-Core), do Prof. Elzo Brito, agora dentro do AER:
- **Lições sugeridas:** a IA principal sugere lições num bloco `aer-licao`. O ASES também sugere quando uma tarefa é bloqueada, por sair do limite ou por testes falhando depois de 2 refações. A lição sugerida fica **PROPOSED** e só vale depois de `/licao aprovar LES-XXXX`. `/licoes` mostra as sugeridas e de onde vieram.
- **Limites de escrita por tipo de tarefa:**
  - `docs` só altera documentação;
  - `test` só altera arquivos de teste;
  - `review` não altera nada;
  - `code` e `other` continuam livres dentro da worktree.
  - Fora do limite, a tarefa vai para BLOCKED com `BOUNDARY_VIOLATION` e a lista dos arquivos, antes dos testes e da revisão. A IA principal é avisada dessa regra ao montar planos.
- **`/verificar` (`/verify`):** refaz o estado de fases, tarefas e lições a partir do histórico, confere a sequência e o hash de cada evento e aponta qualquer diferença.
- **`/metricas` (`/metrics`):** tentativas, % de acerto, refações, tempo médio e tokens de cada IA, calculados do histórico do projeto.
- A 1.5.0 não chegou a ser publicada no npm; a 1.6.0 traz tudo dela.

## 1.5.0 (26/11/2026): lições aprendidas (ESAA) e as bases do projeto
- **Lições aprendidas**, a primeira peça do [ESAA](https://github.com/elzobrito/ESAA-Core), do Prof. Elzo Brito:
  - `/licao <texto>` registra uma lição. Ela entra nas instruções de **toda tarefa** e da **IA principal**, e as IAs param de repetir o mesmo erro.
  - `/licoes` lista as lições, e `/licao arquivar LES-0001` tira uma lição de uso.
  - Cada passo vira evento no histórico. O banco migra para a versão 6, com backup automático.
- **`/sobre` e README:** o ASES-300/500 é dos Profs. Raul el Greco e Giuseppe Favato, e o ESAA, do Prof. Elzo Brito. Há uma nova seção, "As bases: ASES-300/500 e ESAA", sobre o que cada um é e por que juntar os dois.
- **`ases update`:** passa a pedir a versão ao registro do npm, sem usar o cache local. Antes, logo depois de uma publicação, ele dava "No matching version found".

## 1.4.0 (26/11/2026): projetos em qualquer máquina
- **Novo projeto:** na tela "Onde vamos trabalhar?", você digita o nome e o AER cria `~/Projetos Eureka42/<nome>`. Em seguida pergunta onde guardar: **só nesta máquina** (padrão), **GitHub** (repositório privado), **nuvem** ou **GitHub e nuvem**. Só aparecem as opções que funcionam nesta máquina.
- **Nuvem:** Google Drive, OneDrive, Mega, Dropbox e as demais do [rclone](https://rclone.org). O login é feito uma vez com `rclone config`; o AER nunca vê a senha. O projeto vai para `<nuvem>:Projetos Eureka42/<nome>`. **Conectar uma nuvem** (tela inicial) e **`/conectar google|onedrive|dropbox`** abrem o navegador para o login.
- **O contexto vai junto:** o projeto continua rodando numa pasta local (sincronizar a pasta ao vivo corrompe o banco). Ao sair, o AER grava uma cópia consistente do banco em `.ases/snapshot/` e envia o projeto. Na outra máquina, essa cópia é restaurada sozinha e o histórico continua de onde parou.
- **Abrir de outra máquina:** a tela inicial lista os projetos da nuvem e do GitHub (marcados com o tópico `ases-project`) e baixa o escolhido para `~/Projetos Eureka42`. A tela mostra o que está conectado (nuvem e GitHub).
- **`/sincronizar` (`/sync`):** liga GitHub, nuvem, os dois ou desliga, e envia na hora. Se faltar algo (rclone, login), diz o que fazer.
- **Aprovações pedidas pela IA:** o pedido agora aparece em `/approval` com número (APR-XXXX). Concedido, a tarefa volta sozinha para a fila e o próximo `/run` executa a operação aprovada, uma única vez.
- **Idioma da máquina:** a interface (menu do `/`, ajuda, tela inicial, seletor de modelos, cabeçalho) segue o idioma da máquina: português, inglês ou espanhol. No menu em inglês os comandos aparecem como `/model`, `/help`, `/sync`… Os comandos em português e em inglês funcionam sempre. Para fixar: `/config idioma pt|en|es|auto`. Em inglês, `/model` passa a ser o seletor de modelos (a IA principal é `/agent`).
- **Cabeçalho:** a principal aparece com o modelo em uso, ex.: `principal: google (gemini-3.8-flash-low)`. Logo abaixo, o estado da nuvem e do GitHub e se este projeto é enviado ao sair.
- **`/modelo`:** IAs não instaladas aparecem em cinza, com "(não instalada)".
- **Menu do `/`:** Enter executa a opção destacada (antes executava o texto digitado pela metade, ex.: `/mod`).
- **Projeto novo já nasce com Git** (com um primeiro commit): os planos em paralelo usam uma cópia por IA e recusavam pasta sem Git.
- **Simulador fora do trabalho real:** com uma IA real como principal, o simulador não recebe tarefas nem faz a revisão cruzada (num teste real, uma tarefa foi parar nele e outra foi "aprovada" por ele).
- **IAs instaladas fora do PATH:** o AER também procura em `~/.local/bin` e `~/.opencode/bin` (o OpenCode aparecia como não instalado).
- **Envio mais rápido e avisado:** a nuvem recebe vários arquivos ao mesmo tempo, e a saída mostra "enviando o projeto para…" enquanto envia.
- **Cores:** o "pensando…" e as atividades usavam um laranja fixo; agora seguem o tema (verde Eureka42 por padrão).
- **Testes:** o teste de pseudo-terminal declara `COLORTERM` e não depende mais do terminal de quem roda.

## 1.3.1 (25/11/2026): listas de modelos atualizadas
- **`/modelo` com as listas atuais:**
  - **Claude:** Opus 5.5, Opus 5, Sonnet 5.5, Haiku 5.5 e Fable 5.2, além dos aliases `fable`, `opus` e `sonnet`.
  - **Codex:** a linha GPT-6 (6.2 Astra, 6.2 Sol, 6.1 Sol, 6.1 Terra, 6 Astra, 6 Sol, 6 Luna, 6 Cyber) e a 5.6. A antiga linha `-codex`, desligada, não aparece.
  - **Kimi:** K3.1 Pro, K3.1 Pro Highspeed e K3, com e sem raciocínio, nos IDs da própria CLI (`kimi-code/…`). Os IDs da API não valem na CLI.
  - **Outro modelo:** continua dando para digitar o nome.

## 1.3.0 (25/11/2026): /iniciar-projeto
- **`/iniciar-projeto`:** a metodologia guiada, do zero, no próprio chat.
  1. **Preparação:** cria o Git, se faltar, e importa e confere as fontes (G0).
  2. **Entrevista ASES-500:** uma pergunta por vez, com progresso. Resposta livre = confirmada; também `/proposta`, `/na motivo` e `/pular`.
  3. **Requisitos do sistema:** `título :: critério de aceite`, que viram REQ-301+, aprovados com o seu nome.
  4. **ASES-300:** os 300 requisitos gerais, um por vez. `Enter` = se aplica, `/na motivo` = não se aplica, `/aplicar-resto` aceita os que faltam.
  5. **Fechamento:** roda o **G1** e oferece criar o repositório no **GitHub** pelo `gh`. Ele é **privado por padrão** e só é criado com `/github sim`.
  - **Retomada:** `/sair-entrevista` pausa, e `/iniciar-projeto` continua de onde parou.

## 1.2.1 (25/11/2026): Cursor seguro e verificado
- **Shell barrado antes de executar:** num teste real, o Cursor rodou `ls` mesmo com `--sandbox enabled`. Agora o AER coloca `deny: Shell(*)` no `.cursor/cli.json` só durante a execução. No teste real com a regra, o Cursor **recusou** o comando ("Command blocked by permissions configuration").
  - **O arquivo do usuário:** um `.cursor/cli.json` que já exista volta intacto, byte a byte, mesmo com erro, e antes de o trabalho ser salvo.
  - **Tentativa barrada:** fica só registrada.
  - **Shell que chegue a executar:** interrompe o agente como violação.
- **Arquivos fora do projeto:** o Cursor leu sozinho uma "skill" em `~/.claude`. Qualquer acesso dele fora da pasta do projeto agora interrompe o agente como violação.
- **Cursor VERIFIED na versão 2026.11.22:** dois testes reais (escrita, e shell barrado) viraram fixtures, sem dados pessoais.

> A 1.2.0 não deve ser usada com o Cursor: publique a 1.2.1.

## 1.2.0 (25/11/2026): Cursor
- **Nova IA: Cursor** (`cursor-agent`), pelo modo oficial sem tela (`-p --output-format stream-json`).
  - **Usos:** principal, executora de tarefas e revisora (`--mode ask`, só leitura).
  - **Modelo:** `/modelo` lista os modelos com `cursor-agent models` e aplica com `--model`.
  - **Login:** o AER confere com `cursor-agent status` e nunca faz login por você.
  - **Segurança:**
    - no modo `-p` o Cursor tem acesso ao shell, então o AER liga `--sandbox enabled`;
    - o AER nunca passa `--force`/`--yolo`;
    - **qualquer tentativa de usar o shell interrompe o agente na hora** e a tarefa falha com `SECURITY_VIOLATION`.
  - **Contrato:** veio da documentação oficial (na 1.2.1, conferido com saída real).
- **Segurança geral:** qualquer IA cujo adaptador relate uma violação é interrompida na hora (antes só falhava no fim).

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
