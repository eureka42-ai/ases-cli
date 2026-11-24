# AER 1.1.0: console de conversa com IA principal e orquestração em paralelo

**Data:** 24/11/2026. **Estado:** lista de comandos aprovada pelo responsável (24/11/2026); desenho completo aguardando aprovação final.
**Requisitos:** AER-REQ-082 (escolher provider por comando), AER-REQ-083 (manual/automático/híbrido) e o §8/§11 do `ASES_CLI_MD_MESTRE.md`, que descreve o `ases` como "chat textual interativo, escolha manual/automática/híbrida de agentes".
- **Roteiro 1.2/1.3:** PHASE-13 (Brain, Swarm, Arena), PHASE-14 (Time Machine) e Project Passport (§14.12).

## 1. Intenção (palavras do responsável)
O responsável instalou a 1.0.1 e achou "muito diferente do que imaginei". O que ele quer:
- **"Uma CLI como aqui"**, ou seja, como o Claude Code.
- **"Uma principal que responderá as ideias"**, escolhida por ele e trocável a qualquer momento.
- **"A principal lê, planeja e edita"**, e responde no chat.
- **"O ASES dividirá em tarefas e dividirá as tarefas entre as outras IAs"**, que trabalham ao mesmo tempo, "acelerando o trabalho".
- **Comandos `/…` "mais simples e intuitivos".**
- **O logo EUREKA42 "BEM GRANDE", em verde.** O desenho foi aprovado com "ficou perfeito".

O plano mestre já previa esse chat. Ele ficou sem fase marcada para fazer (AER-REQ-083 "sem fase alocada", `/agent` em `PLANNED_SLASH`).

## 2. Objetivos, fora do escopo e o que contaria como fracasso
**Objetivos (1.1.0)**
1. **Assistente de primeiro uso:** detecta as IAs, pergunta a principal, o modo e o limite, e grava tudo. Não usa IA nenhuma.
2. **Chat em texto livre:** a principal responde, lê e **edita direto no projeto**. Há um ponto de restauração antes de cada turno que edita, e `/desfazer` volta.
3. **Pedido grande:** a principal devolve a lista de tarefas. O **ASES escolhe a IA de cada tarefa**, entre as outras, livres e prontas, e dispara tudo em paralelo, cada tarefa na sua worktree.
4. **Revisão cruzada automática** de cada tarefa por outra IA.
5. **Troca automática** de IA quando a cota acaba ou a IA trava.
6. **Pronto só com testes passando.** Se falhar, a tarefa volta sozinha para a IA, até 2 vezes.
7. **Resumo:** a principal resume no chat. As tarefas entram no projeto com `/aceitar`.
8. **Comandos:** poucos, em português, com alias em inglês e menu ao digitar `/`.
9. **Logo:** o logo grande em blocos, verde.

**Fora do escopo da 1.1.0** (o roteiro está no §10)
- A principal chamar ferramentas do AER por MCP (abordagem B).
- Falar direto com as APIs dos modelos.
- Embutir uma chave de API de terceiros, como a do Groq, no pacote. Ela ficaria pública no npm e fere os termos e a regra de credenciais. Um provider "groq" com a **chave do próprio usuário**, guardada no SecretStore, fica como ideia futura.
- Sincronização pela nuvem, que vai para a 1.2 (§10).

**O que contaria como fracasso**
- Rodar IA real sem consentimento, ou gastar cota em silêncio.
- Uma edição da principal que não possa ser desfeita.
- Uma tarefa de IA executora integrada sem `/aceitar`.
- O chat inventar resposta quando a IA falhou. Erro aparece como erro.
- Prometer um paralelismo que os termos não permitem.

## 3. Restrições existentes (não mudam)
- **Sem login:** o AER nunca faz login. Usa as IAs oficiais já logadas (READY no `probe()`).
- **Consentimento:** **uma vez por IA por sessão do `ases`**, pedido na primeira vez que ela vai rodar ("usa a sua conta e cota de X"). Com `--save`, grava o consentimento no CONFIG do projeto, e `/config` permite revogar.
- **Paralelismo:** `parallel_sessions` é 1 por IA (termos de uso individual). O ganho vem de IAs diferentes ao mesmo tempo. O `maxPerProvider` do scheduler já existe, e subir acima de 1 pede confirmação.
- **Sem shell, sem servidor, sem MCP** nas sessões. Shims `.cmd` resolvidos (1.0.1).
- **Engine:** é o escritor único, todo passo vira evento e o `ases-tar` acompanha.

## 4. Abordagens consideradas
| | Como funciona | Prós | Contras |
|---|---|---|---|
| **A. Turnos com plano (escolhida pelo responsável)** | Cada mensagem é uma execução da principal. A resposta traz o texto e, opcionalmente, um bloco `aer-plan` com a lista de tarefas. O ASES valida, atribui as IAs e roda | Reusa contratos testados (claude `-p stream-json`, codex `exec --json`, ACP). O AER fica no controle e tudo é testável com o simulador | A principal só reage entre uma rodada e outra (o resumo automático fecha cada rodada) |
| B. A principal comanda por ferramentas (MCP) | O AER expõe as ferramentas "criar tarefa", "status" e "diff" | Mais fluido | Exige o MCP, que hoje fica desligado. Futuro |
| C. API direta dos modelos | O AER chama as APIs | | Chave paga e foge das IAs oficiais. Descartada |

**Onde a principal edita:**
- **Opção 1, escolhida (recomendada e não contestada):** direto no projeto, com ponto de restauração e `/desfazer`.
- **Opção 2, rejeitada:** numa cópia, com `/aceitar`. Faria perder a sensação de "como o Claude Code".

## 5. O desenho
### 5.1 Conversa e a principal
- **Agregado `Conversation`:** id `CNV-XXXX`, com a principal e o modo.
- **Eventos:** `ConversationStarted`, `ChatMessageAdded` (role, provider e texto redigido pelo `redactText`), `MainProviderChanged`, `PlanProposed`, `PlanDecided`, `ChatTurnFailed`, `RestorePointCreated`, `RestorePointApplied`.
- **Um turno:**
  1. O AER monta o prompt com:
     - o papel de principal;
     - o contexto do projeto (fases e tarefas abertas);
     - as IAs prontas;
     - o formato `aer-plan`;
     - as últimas mensagens (sugestão: 20, ou cerca de 24 KB, com resumo acima disso).
  2. A principal roda em **modo de edição no diretório do projeto** (`WORKTREE_WRITE` com `workingDirectory` = raiz do projeto). Valem as mesmas proteções atuais: sem shell, caminhos negados como `.ases/db`, `.git` e segredos, e a política de permissões do ACP.
  3. O stream aparece ao vivo no chat ("lendo X", "editando Y"), e o texto final vira a resposta.
- **Ponto de restauração:** antes de todo turno, se a árvore de trabalho tiver mudanças ou o turno puder editar, o AER grava um snapshot Git **sem tocar no index nem no branch do usuário**.
  - **Como:** `git stash create`, mais a lista dos arquivos não rastreados, guardados como um commit em `refs/ases/restore/CNV-XXXX/N`.
  - **`/desfazer`:** restaura os arquivos do último ponto e informa o que voltou.
  - **Recusa:** se o usuário editou os mesmos arquivos depois do turno, o `/desfazer` recusa e mostra os arquivos, em vez de sobrescrever.
- **Trocar a principal (`/ia <nome>`):** a próxima rodada usa a nova IA com o mesmo histórico, ou com um resumo dele. As sessões das IAs não são reaproveitadas.
- **Principal ocupada:** enquanto a principal executa um turno, as mensagens novas ficam na fila e aparecem como "na fila".

### 5.2 Divisão e atribuição (o ASES)
- **Formato do plano:** um bloco ```` ```aer-plan ```` no fim da resposta, com JSON validado por zod:
  `{ "tasks": [{ "title": string, "instructions": string, "kind"?: "code"|"test"|"docs"|"review"|"other", "dependsOn"?: number[], "prefer"?: ProviderId }] }`.
  - **Plano inválido:** o AER mostra o erro e não executa nada.
  - **Sem bloco:** a resposta é só conversa.
- **Atribuição (determinística e explicada):**
  1. Considera só as IAs READY, com consentimento ou a pedir, **exceto a principal**.
  2. Usa a `prefer` do plano se ela estiver livre.
  3. Senão, a menos ocupada; no empate, a ordem é claude, codex, kimi, opencode e google.
  4. Cada atribuição mostra o motivo, como "codex: livre, preferida pela principal".
  5. **Só existe a principal:** ela mesma executa as tarefas, em fila.
  6. **Correção pelo usuário:** `/trocar 12 kimi`, ou `[e]` no plano.
- **Modo:**
  - **`manual` (padrão):** mostra o plano e espera `Enter` para executar, `e` para editar ou `n` para cancelar.
  - **`/auto`:** liga ou desliga o modo automático.
  - **`hybrid`:** fica no `/config`. É automático quando todas as IAs já têm consentimento e o plano tem até 3 tarefas; nos outros casos, pergunta.
- **Execução:**
  1. Uma fase `Conversa CNV-XXXX` e uma tarefa por item, com as instruções.
  2. `dependsOn` vira ordem: uma tarefa só fica READY quando as de que depende chegam a REVIEW.
  3. O scheduler atual roda tudo em paralelo, com o `maxPerProvider` do `/config`.
- **Fechamento:** quando todas as tarefas do plano terminam (REVIEW, FAILED ou BLOCKED), a principal recebe o status, os arquivos, os testes e as revisões, e **responde com um resumo**.

### 5.3 Qualidade automática (ideias 1 a 3 aprovadas)
1. **Revisão cruzada:** quando a tarefa chega a REVIEW, o AER dispara o `/review` existente com **outra** IA. Pode ser a principal, se estiver livre; senão, a menos ocupada.
   - O veredito fica junto da tarefa e aparece no resumo.
   - Pode ser desligada no `/config`.
2. **Troca automática:**
   - **Quando dispara:** `RATE_LIMITED`/`PROVIDER_COOLDOWN` (o cooldown de 429 já existe), `AUTH_EXPIRED`, timeout ou travamento.
   - **O que faz:** o AER faz o `/handoff` existente para a próxima IA livre, com o mesmo HANDOFF e o checkpoint, e registra o motivo.
   - **Limite:** 2 trocas por tarefa. Depois disso, a tarefa fica BLOCKED e aparece para o usuário.
3. **Pronto só com teste passando:**
   - **Qual teste:** o projeto declara o comando no `.ases/CONFIG.json` (`quality.testCommand`). O assistente detecta `npm test` ou `pytest` e confirma com o usuário.
   - **Onde roda:** o `/test` existente roda na worktree da tarefa.
   - **Se falhar:** devolve para a mesma IA como retrabalho, com a saída do teste, até 2 vezes. Depois, BLOCKED.
   - **Sem comando de teste:** o passo é pulado e aparece "sem teste configurado". Isso nunca conta como PASS.

### 5.4 Comandos (simples, em português, alias em inglês)
- **Menu:** ao digitar `/`, abre a lista com uma descrição de cada comando, filtrada enquanto se digita. `Enter` escolhe.
- **Número curto:** as tarefas aceitam `12` no lugar de `TAR-0012`.

| Comando | Alias | O que faz |
|---|---|---|
| `/ajuda` | `/help` | Mostra o que dá para fazer; `/ajuda avançado` lista os técnicos |
| `/ia [nome]` | `/model`, `/agent` | Mostra ou troca a principal |
| `/ias` | `/agents` | Instalada, logada, versão, livre ou ocupada, consentimento |
| `/plano` | `/plan` | Mostra o plano pendente; `Enter` executa |
| `/auto` | | Liga ou desliga o modo automático |
| `/tarefas` | `/tasks` | Tarefas da conversa, ao vivo |
| `/ver 12` | `/diff` | O que a tarefa mudou |
| `/aceitar [12]` | `/accept` | Integra todas as prontas, ou só a 12 |
| `/refazer 12 [motivo]` | `/redo` | Devolve a tarefa com o motivo |
| `/trocar 12 <ia>` | `/assign` | Troca a IA da tarefa |
| `/desfazer` | `/undo` | Desfaz a última edição da principal |
| `/parar` | `/stop` | Para tudo da conversa |
| `/nova` | `/new` | Nova conversa |
| `/config` | `/settings` | Menu com tema, logo, modo, limite por IA, revisão cruzada, comando de teste, consentimentos e assistente inicial |
| `/sair` | `/exit` | Sai |

- **Comandos técnicos:** todos os atuais continuam funcionando e ficam em `/ajuda avançado`: `/phase`, `/task`, `/run`, `/gate`, `/req`, `/ext`, `/handoff`, `/review`, `/test`, `/usage`, `/resume`, `/approval`.
- **`/salvar` e `/continuar`:** ficam reservados para a 1.2 e respondem "chega na 1.2".

### 5.5 Logo grande verde (aprovado)
- **Modo `banner`:** o EUREKA 42 em blocos (ANSI Shadow), 6 linhas de cerca de 70 colunas, mais a linha `⌘  ASES Engineering Runtime · principal: X · N IAs prontas`. É exatamente o desenho aprovado.
- **Cor:** verde **`#22C55E`** (decisão do construtor).
  - **Contraste:** medido e registrado no teste: cerca de 9:1 no preto e cerca de 2,3:1 no branco. No fundo claro, o tema `contrast` resolve.
  - **Tema:** é o novo tema `green`, que passa a ser o padrão do `auto` em 24/8 bits. O teal continua disponível.
  - **Profundidade de cor:** 256 cores usa o cubo, 16 cores usa o ANSI 32 (verde), e `NO_COLOR` sai sem cor.
- **Escolha do modo:** o banner aparece com ≥72 colunas e Unicode. Abaixo disso, o `full`, depois o `compact` e o `minimal`. Sem Unicode, um banner ASCII com `#` e `=`.
- **Onde aparece:** só no `ases`, no topo, uma vez. O `ases-tar` continua compacto.

### 5.6 Assistente de primeiro uso (sem IA)
**Quando roda:** quando não há `chat.main` no CONFIG do projeto nem no global, ou com `/config` → "assistente".
1. **Mostra as IAs:** a tabela do `probe()` (instalada, versão, logada). Para as ausentes, a dica de instalação, sem instalar nada.
2. **Pergunta a principal** (↑↓ e Enter).
3. **Pergunta o modo:** perguntar ou automático.
4. **Pergunta o limite por IA:** o padrão é 1.
5. **Pergunta o comando de teste:** sugere o detectado.
6. **Pergunta onde salvar:** neste projeto ou em todos.
7. **Sem nenhuma IA real:** oferece o simulador, rotulado `[SIMULADO]`.

### 5.7 Simulador
- **Cenário `chat`:** responde de forma determinística, emite `aer-plan` quando a mensagem pede trabalho e edita um arquivo quando a mensagem pede.
- **Cenários `review`, `rate-limit` e `test-fail`:** para cobrir os itens do §5.3 sem conta.

## 6. Testes e evidência
- **Unidade:**
  - parser `aer-plan` (válido, inválido, ciclo em `dependsOn`);
  - atribuição (preferência, ocupada, só a principal, exclusão da principal);
  - prompt e histórico;
  - ponto de restauração e `/desfazer`, inclusive a recusa quando o usuário editou depois;
  - modos;
  - limite de trocas e de retrabalho;
  - comandos, aliases e número curto;
  - menu `/`;
  - banner (largura, profundidade, `NO_COLOR`, ASCII);
  - assistente.
- **e2e com o simulador:**
  1. o assistente roda;
  2. uma mensagem é respondida e a principal edita um arquivo;
  3. `/desfazer` volta a edição;
  4. um pedido grande gera um plano de 3 tarefas, e `Enter` as roda em paralelo em 2 IAs simuladas;
  5. a revisão cruzada roda;
  6. um teste falho gera retrabalho;
  7. um 429 provoca a troca de IA;
  8. o resumo aparece e `/aceitar` integra;
  9. `/ia` troca a principal.
- **pty (macOS/Linux) e ConPTY (Windows, CI):** o banner aparece, o menu `/` abre, uma mensagem vira plano e `Enter` executa.
- **Smoke real:** só com o consentimento do responsável, como um turno com claude e com codex de principal. Registrado em `.ases/evidence/`.

## 7. Entrega
- **Versão:** 1.1.0.
- **Fase e branch:** PHASE-18, `ases/PHASE-18`.
- **Publicação:** pelo responsável, no Terminal (Touch ID).

## 8. Deixado ao construtor
- O texto do prompt de papel da principal e o tamanho do histórico.
- O layout fino da TUI.
- Os nomes internos.
- **Dívida conhecida:** o prompt vai no argv do claude, limitado a cerca de 32 KB no Windows. Passar por stdin quando o `SpawnOptions` aceitar; o histórico grande deve forçar isso.

## 9. Decisões do construtor (para conferir)
1. **Consentimento:** por IA, por sessão, com `--save` opcional.
2. **A principal não recebe tarefas** quando existem outras IAs, porque cada IA tem limite de 1 sessão.
3. **Verde:** `#22C55E`, e o `green` vira o padrão.
4. **Fase por conversa:** uma fase `Conversa CNV-XXXX` por conversa, para a rastreabilidade.
5. **Limites:** 2 trocas automáticas e 2 retrabalhos por tarefa.
6. **Ponto de restauração:** em `refs/ases/restore/…`, sem tocar no branch nem no index do usuário.
7. **Revisão cruzada:** ligada por padrão.

## 10. Roteiro aprovado depois da 1.1.0
**1.2**
- **Arena:** a mesma tarefa em 2 ou 3 IAs, com os testes de cada uma e comparação lado a lado. O usuário escolhe.
- **Placar das IAs:** taxa de testes passando, retrabalho e tempo por tipo de tarefa. Ele alimenta a atribuição, com o motivo explicado (PHASE-13, Brain).
- **Memória do projeto:** as decisões da conversa viram registros no `.ases/` e são entregues às novas principais e sessões.
- **Sincronização pela nuvem (Project Passport):**
  - **`/salvar`:** gera um pacote **criptografado com a senha do usuário** (o segredo fica no SecretStore). O pacote leva os eventos, a conversa, as decisões e a config sem segredos. Ele é gravado **na pasta local do Google Drive ou do OneDrive**, e o app oficial sincroniza. O AER não faz login.
  - **`/continuar`, no outro computador:** confere a integridade (`verifyHistory`), reconstrói o banco e `/resume` continua.
  - **Código:** vai pelo **GitHub**, que o responsável já usa.
  - **Fora do pacote:** os logins das IAs e as tarefas no meio, que param antes.
  - **Um computador por vez:** é uma marca de posse no pacote. Divergência é detectada e recusada.
  - **Proibido:** o banco vivo nunca fica na pasta sincronizada (risco já visto com o iCloud).

**1.3**
- **Turno da noite:** uma fila roda no motor residente, e `/manha` mostra o relatório.
- **Máquina do tempo:** `/voltar 14:30` restaura o projeto e a conversa àquele ponto, com replay passo a passo (PHASE-14).
- **Mesa de controle no `ases-tar`:** uma coluna por IA, ao vivo.
- **Orçamento:** `/orcamento claude 50/dia` define o limite por IA, com aviso antes de estourar.
