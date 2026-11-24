# AER 1.1.0: console de conversa com IA principal e orquestração em paralelo

**Data:** 24/11/2026. **Estado:** desenho aguardando a aprovação do responsável.
**Requisitos:** AER-REQ-082 (escolher provider por comando), AER-REQ-083 (manual/automático/híbrido) e o §8/§11 do `ASES_CLI_MD_MESTRE.md`, que descreve o `ases` como "chat textual interativo, escolha manual/automática/híbrida de agentes".

## 1. Intenção
O responsável instalou a 1.0.1 e esperava um console como o Claude Code, não um gerenciador de tarefas por comandos.

**O que ele quer:**
- **Conversar em texto livre** com uma **IA principal escolhida por ele**, e poder trocá-la.
- **A principal conversa e reparte o trabalho:** ela responde às ideias e divide o trabalho em tarefas.
- **Paralelo:** as **outras IAs instaladas** executam as tarefas **ao mesmo tempo**, para acelerar.
- **Comandos `/…`** para tudo.
- **O logo EUREKA42 bem grande, em verde**, ao abrir.

O plano mestre já previa esse chat. Ele ficou sem fase marcada para fazer (AER-REQ-083 está "sem fase alocada" e `/agent` está em `PLANNED_SLASH`).

## 2. Objetivos, fora do escopo e o que contaria como fracasso
**Objetivos**
1. **Conversa sem tarefa:** o `ases` abre num chat. O texto sem `/` vai para a IA principal, e a resposta aparece no próprio chat.
2. **Pedido de trabalho:** a principal devolve um **plano**, com as tarefas e a IA sugerida para cada uma. Por padrão, o AER mostra o plano e espera a aprovação. Com `/auto`, dispara direto.
3. **Execução:** as tarefas aprovadas rodam pelo motor atual (worktrees, consentimento, leases), em paralelo entre IAs diferentes.
4. **Fechamento:** ao final, a principal recebe os resultados e responde com um resumo no chat.
5. **Troca de principal:** `/main <ia>` troca a principal sem perder o contexto.
6. **Logo:** o logo grande em blocos, verde, ao abrir.

**Fora do escopo (1.1.0)**
- A principal chamar ferramentas do AER no meio da conversa (abordagem B, via MCP). Fica para depois.
- Falar direto com as APIs dos modelos (exige chave paga e foge do uso das IAs oficiais).
- Merge automático na branch do usuário. A aprovação continua humana: `/approve`.
- Roteamento "inteligente" do PHASE-13/Brain. Aqui quem sugere a IA é a principal, e o usuário pode trocar.

**O que contaria como fracasso, mesmo funcionando**
- A principal editar arquivos do projeto do usuário. Ela só lê.
- Rodar uma IA real sem consentimento, ou gastar cota em silêncio.
- O chat parecer funcionar quando a IA não respondeu de verdade. Erro ou falta de resposta aparece como erro, nunca como texto inventado.
- Prometer um paralelismo que os termos não permitem.

## 3. Restrições já existentes (não mudam)
- **Sem login:** o AER nunca faz login. Usa as IAs oficiais já logadas (`probe()` mostra READY).
- **Consentimento por IA real:** hoje é o `/run --consent`. No chat, vale **um consentimento por IA por sessão do `ases`**, pedido na primeira vez em que aquela IA vai rodar, com a mensagem "usa a sua conta e cota de X".
- **Paralelismo:** `parallel_sessions` é 1 por IA por padrão (termos de uso individual). O ganho vem de IAs diferentes ao mesmo tempo. O scheduler já tem `maxPerProvider`, e `/limit <ia> N` só aumenta esse limite com confirmação explícita.
- **Sem shell e sem rede:** os processos são abertos sem shell, e não há servidor nem MCP nas sessões. O MCP continua desligado.
- **Engine:** é o escritor único. Tudo vira evento auditável, e o `ases-tar` acompanha.

## 4. Abordagens consideradas
| | Como funciona | Prós | Contras |
|---|---|---|---|
| **A. Turnos com plano (escolhida)** | Cada mensagem gera uma execução **READ_ONLY** da principal (o mesmo modo do `/review`), com o histórico no prompt. A resposta traz o texto e, se houver, um bloco de plano em JSON. O AER valida o plano, cria as tarefas e roda o `/run` | Reusa contratos já testados (claude `-p stream-json`, codex `exec --json`, ACP). O AER fica no controle e tudo é testável com o simulador | A principal só reage entre uma rodada e outra |
| B. A principal comanda por ferramentas (MCP) | O AER expõe as ferramentas "criar tarefa", "status" e "diff" à principal | Mais fluido | Exige ligar o MCP (hoje desligado), o suporte varia por IA e é difícil de testar. Fica para depois |
| C. API direta dos modelos | O AER chama as APIs | Controle total | Chave paga e foge das IAs oficiais. **Descartada** |

O responsável escolheu a A, depois de recomendada, e também definiu que **é ele quem escolhe a principal e pode trocá-la**.

## 5. O desenho
### 5.1 Conversa (engine)
- **Novo agregado `Conversation`:** id `CNV-XXXX`, a principal atual e o modo (`manual`, `auto` ou `hybrid`).
- **Novos eventos:** `ConversationStarted`, `ChatMessageAdded` (role user/main/system, provider e texto redigido), `MainProviderChanged`, `PlanProposed`, `PlanDecided` (approved/edited/cancelled), `ChatTurnFailed`.
  - Tudo vai para o event store.
  - O texto passa pelo `redactText`.
  - O histórico fica local, com a sensibilidade do §10.2 do mestre: nunca segredo em claro.
- **Um turno:**
  1. O AER monta o prompt com o **papel de principal**: contexto do projeto (nome, fases e tarefas abertas), a lista das IAs READY e livres, o formato do plano e as últimas N mensagens. Se o histórico ficar grande, entra um resumo.
  2. A principal roda em `READ_ONLY` numa worktree de leitura no HEAD, como o `/review`, com timeout.
  3. Só o texto final é usado. O stream aparece ao vivo no chat como "pensando…", e o resto vai para o `ases-tar`.
- **Formato do plano:** no fim da resposta, um bloco cercado por ```` ```aer-plan ````, com JSON validado por zod:
  `{ "tasks": [{ "title": string, "instructions": string, "provider": ProviderId, "dependsOn"?: number[] }] }`.
  - **Plano inválido ou provider indisponível:** o AER mostra o erro e **não executa nada**.
  - **Sem bloco de plano:** a resposta é só conversa.
- **Plano aprovado:**
  1. Cria uma fase por conversa (`Conversa CNV-XXXX`), ou reusa a dela, e uma tarefa por item, já com `--provider` e as instruções.
  2. Move as tarefas para READY e dispara o scheduler com o `maxPerProvider` configurado.
  3. As dependências viram ordem: uma tarefa só fica READY quando as de que depende chegam a REVIEW.
- **Fechamento:** quando todas as tarefas do plano chegam a REVIEW, FAILED ou BLOCKED, o AER faz um **turno automático de resumo**. A principal recebe o status, os arquivos alterados e os testes, e responde no chat. **Nada é integrado sem `/approve`.**
- **`/main <ia>`:** emite `MainProviderChanged`. O próximo turno usa a nova IA com o mesmo histórico, ou com o resumo dele. As sessões das IAs não são reaproveitadas (`--no-session-persistence` continua).
- **Principal padrão:**
  - **Na primeira vez:** a primeira IA READY na ordem claude, codex, kimi, opencode e google, **sempre mostrada** ao usuário.
  - **Persistência:** a escolha vai para `.ases/CONFIG.json` (`chat.main`) ou para a config global.
  - **Sem nenhuma IA real READY:** só o simulador (cenário `chat`, rotulado SIMULADO).
- **Modo:**
  - `manual` (padrão): o plano espera `[Enter]` executar, `[e]` editar a IA ou o título das tarefas, `[n]` cancelar.
  - `auto`: executa sem perguntar, mas o consentimento por IA continua valendo.
  - `hybrid`: auto quando todas as IAs do plano já têm consentimento na sessão e o plano tem até 3 tarefas; senão pergunta.

### 5.2 Simulador
- **Novo cenário `chat` no `provider-simulator`:** responde de forma determinística e emite um `aer-plan` quando a mensagem pede trabalho. É ele que permite testar ponta a ponta sem conta.
- **Mensagens:** toda saída do simulador no chat leva o rótulo `[SIMULADO]`.

### 5.3 TUI (`ases`)
**Tela:**
- **No topo:** o logo grande (5.5), depois a linha de status: `principal: claude · modo: manual · IAs: codex ✓ kimi ✓ opencode ✓ google ✓`.
- **No meio:** o histórico da conversa (você e principal), os planos em caixas com as teclas de decisão, e o progresso das tarefas do plano numa linha por tarefa (`TAR-0012 codex RUNNING 1m20s`).
- **Embaixo:** o prompt `você>`. O texto sem `/` vai para o chat; com `/`, é comando.

**O que muda e o que continua:**
- **Aviso antigo:** some o "Chat com agentes ainda não implementado".
- **Modo `--no-tui`:** continua igual. O texto sem `/` passa a ir para o chat também, para teste e uso por script.

### 5.4 Comandos novos (os atuais continuam)
| Comando | Efeito |
|---|---|
| `/main [ia]` | Mostra ou troca a principal. Também aceita `/agent [ia]`, como no plano mestre |
| `/new` | Nova conversa |
| `/history [n]` | Mostra as mensagens anteriores |
| `/clear` | Limpa a tela, sem apagar o histórico |
| `/compact` | Pede à principal um resumo, que passa a ser o contexto |
| `/plan` | Mostra o plano pendente ou o último |
| `/go` | Executa o plano pendente |
| `/edit <n> provider=<ia>\|title=<…>` | Edita um item do plano pendente |
| `/cancel` sem TAR | Descarta o plano pendente. Com TAR, mantém o comportamento atual |
| `/auto`, `/manual`, `/hybrid` | Modo de execução |
| `/agents` | Tabela das IAs: instalada, logada, versão, VERIFIED/UNVERIFIED, livre ou ocupada, consentimento na sessão |
| `/assign TAR-X <ia>` | Troca a IA de uma tarefa ainda não iniciada. Se já parou, usa o `/handoff` |
| `/limit <ia> <n>` | Sessões simultâneas daquela IA. Acima de 1 pede confirmação ("verifique os termos da sua conta") |
| `/status` | Resumo: conversa, plano e tarefas ativas |
| `/approve TAR-X` | Integra o resultado (merge da branch da tentativa). Já existe hoje via APPROVED/MERGING; o comando é o atalho |
| `/reject TAR-X [motivo]` | Pede retrabalho (TaskReworkRequested) |
| `/stop` | Cancela todas as tarefas em execução da conversa |
| `/doctor` | O mesmo que `ases doctor`, dentro da sessão |
| `/theme <t>`, `/logo <modo>` | Muda o tema ou o logo na sessão. `--save` grava no CONFIG |

**Já existentes e mantidos:** `/diff`, `/review`, `/usage`, `/tasks`, `/phases`, `/run`, `/handoff`, `/resume`, `/test`, `/help`. O `/help` é reorganizado por grupo: Conversa, Plano, IAs, Trabalho, Projeto, Uso e ajuda.

### 5.5 Logo grande (aprovado pelo responsável: "ficou perfeito, coloque em verde")
- **Novo modo `banner`:** é o EUREKA 42 em blocos, no estilo ANSI Shadow, com 6 linhas de cerca de 70 colunas, mais uma linha `⌘  ASES Engineering Runtime · principal: X · N IAs prontas`. É exatamente o desenho que o responsável aprovou.
- **Cor:** verde **`#22C55E`**, que é a decisão do construtor, pois o responsável pediu só "verde".
  - **Contraste:** cerca de 9:1 no fundo preto e 2,3:1 no branco, medido no teste e registrado como o blue/gold. No fundo claro, o tema `contrast` resolve.
  - **Tema:** entra como tema `green` e passa a ser o `auto` padrão quando a profundidade de cor é 24/8 bits. O teal continua disponível.
  - **Profundidade de cor:** 256 cores usa o cubo mais próximo, 16 cores usa o verde do ANSI (32), `NO_COLOR` e `mono` saem sem cor.
- **Escolha do modo:** o banner aparece com 72 colunas ou mais e Unicode. Abaixo disso entra o `full` atual, depois o `compact` e o `minimal`. Sem Unicode, um banner ASCII com `#` e `=` do mesmo tamanho.
- **Onde aparece:** só no `ases`, uma vez, no topo. O `ases-tar` mantém o compacto.
- **Tokens:** o `BRANDING_EUREKA42.md` e o `BRAND_TOKENS.json` ganham `green` e `banner`. As referências de imagem da marca não mudam.

## 6. Testes e evidência
- **Unidade:**
  - parser do `aer-plan` (válido, inválido, provider inexistente, `dependsOn` com ciclo);
  - montagem do prompt (histórico truncado e resumo);
  - modos manual, auto e hybrid;
  - `/limit` e `maxPerProvider`;
  - banner (largura, sem truecolor abaixo de 24 bits, `NO_COLOR`, ASCII).
- **e2e com o simulador:** texto livre, plano, `/go`, 3 tarefas em paralelo em 2 IAs simuladas e o resumo no chat. Também: `/main` trocando a principal no meio, e `/auto`.
- **pty e ConPTY:** a TUI abre com o banner, uma mensagem vira plano, e `Enter` executa.
- **Smoke real:** opcional, manual, com consentimento do responsável. É um turno de chat com o claude e com o codex como principal, registrado em `.ases/evidence/`, sem afirmar nada que não tenha rodado.

## 7. Entrega
- **Versão:** 1.1.0 (minor: funcionalidade nova, sem quebra).
- **Fase e branch:** PHASE-18, `ases/PHASE-18`.
- **Publicação:** publica o responsável, pelo Terminal (Touch ID).

## 8. Deixado ao construtor
- O texto exato do prompt de papel da principal e o N do histórico (sugestão: 20 mensagens e cerca de 24 KB).
- O layout fino da TUI e os nomes internos de módulos e eventos.
- A dívida conhecida: o prompt vai no argv do claude, como hoje. Se o tamanho incomodar (limite do argv no Windows, cerca de 32 KB), passar por stdin quando o `SpawnOptions` aceitar.

## 9. Decisões tomadas pelo construtor (para o responsável conferir)
1. A principal **só lê** e não edita arquivos.
2. O consentimento vale **por IA, por sessão do `ases`**.
3. O modo padrão é `manual` (o plano pergunta), com `/auto` e `/hybrid` disponíveis.
4. O verde é `#22C55E`, e o tema `green` vira o padrão.
5. Ao fim de um plano, a principal faz um resumo automático; a integração continua pelo `/approve`.
6. Uma fase "Conversa CNV-XXXX" por conversa, para manter a rastreabilidade das tarefas criadas pelo chat.
7. **A principal não recebe tarefas por padrão.** O prompt pede que ela distribua às outras IAs, para que um turno de chat não dispute a mesma sessão com uma tarefa, por causa do limite de 1 por IA.
   - Se o usuário der uma tarefa à principal via `/edit` ou `/assign`, ela passa a valer como executora daquela vez.
   - Enquanto essa tarefa roda, os turnos de chat esperam e mostram "principal ocupada com TAR-X".
8. **Só uma IA instalada:** ela é principal e executora, e as regras do item 7 valem do mesmo jeito.
