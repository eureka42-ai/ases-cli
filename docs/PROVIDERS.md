# Providers: estado, paridade e limitações (TAR-0036 PHASE-07; TAR-0042 PHASE-08)

`ases doctor` mostra o estado ao vivo deste computador. Ele roda só `--version` e o comando oficial de status de login de cada cliente, sem prompt e sem custo. A pesquisa que fundamenta cada flag está em `docs/PROVIDERS_PESQUISA.md`.

| Provider | Integração | Auth | Contrato | Testado com | Real executado? |
|---|---|---|---|---|---|
| `simulator` | processo Node local | nenhuma | **SIMULATED** | testes + CI 8/8 | n/a |
| `claude` | `claude -p --output-format stream-json --verbose --restricted --permission-prompts none --no-session-persistence --strict-mcp-config` | OFFICIAL_CLI_SESSION (login do próprio cliente) | **VERIFIED em 2.1.330** (outras versões: UNVERIFIED) | fixture real redigida + falso binário | **SIM**, smoke 23/11/2026 (`.ases/evidence/TAR-0035-smoke-real.md`) |
| `codex` | `codex exec --json --ephemeral -C <worktree> -s workspace-write -c approval_policy="never"` | OFFICIAL_CLI_SESSION | **VERIFIED em 0.170.0** (outras versões: UNVERIFIED) | fixture real redigida + falso binário | **SIM**, smoke 23/11/2026 |
| `kimi` | ACP: `kimi acp` (cliente ACP do AER, `@aer/provider-acp`) | OFFICIAL_CLI_SESSION (`kimi login`) | **VERIFIED em 1.50.0** (outras da faixa `[1.50.0, 1.51.0)`: UNVERIFIED) | fixture real redigida + falso servidor ACP | **SIM**, smoke 23/11/2026 (`.ases/evidence/TAR-0041-smoke-real.md`) |
| `opencode` | ACP: `opencode acp` (a 2.4.1 removeu `--cwd`) + `OPENCODE_CONFIG_CONTENT` forçando `ask` | credenciais do próprio OpenCode (`opencode auth login`) | **VERIFIED em 2.4.1** (outras da faixa `[2.4.1, 2.5.0)`: UNVERIFIED) | fixture real redigida + falso servidor ACP | **SIM**, smoke 23/11/2026, inclusive pelo motor |
| `google` | ACP: **Antigravity CLI** `agy acp --sandbox` (o Gemini CLI deixou de aceitar login de conta Google em planos individuais) | login do próprio `agy` (Google) | **VERIFIED em 1.5.13** (outras da faixa `[1.5.13, 1.6.0)`: UNVERIFIED) | fixture real redigida + falso servidor ACP | **SIM**, smoke 23/11/2026, inclusive pelo motor |

**VERIFIED** vale só para a versão exata cuja saída real foi capturada, redigida e versionada (`test/fixtures/real-*`, TAR-0035). Qualquer outra versão dentro da faixa aceita aparece como **UNVERIFIED**: o parser vem da documentação oficial e não foi validado contra saída real daquela versão (§7.6). Os caminhos de erro (auth expirada e limite atingido) continuam derivados da documentação mesmo nas versões VERIFIED.

## Paridade (o que cada um entrega ao AER hoje)
| Capacidade | claude | codex | kimi | opencode | google |
|---|---|---|---|---|---|
| Execução headless com stream estruturado | stream-json | exec --json | ACP | ACP | ACP (`agy`) |
| Quem decide permissões | flags fixas (`--restricted`, `--permission-prompts none`) | sandbox `workspace-write` + `approval_policy=never` | **AER**, pedido a pedido (`session/request_permission`; o caminho vem do `diff`) | **AER**, pedido a pedido (com `ask` forçado) | **AER**, pedido a pedido (+ `--sandbox` do agy) |
| Shell | bloqueado (`--restricted`) | permitido **dentro do sandbox** | negado (`execute` → `reject_once`) | negado | negado |
| Uso de tokens | sim (result) | sim (turn.completed) | **não** (o ACP v1 não reporta) | **não** | **não** |
| Cancelamento | árvore de processos | árvore de processos | árvore de processos (o fim do stdin encerra limpo) | idem | idem |
| Contrato | VERIFIED 2.1.330 | VERIFIED 0.170.0 | VERIFIED 1.50.0 | VERIFIED 2.4.1 | VERIFIED 1.5.13 (agy) |

## Regras que valem para os providers reais
- **Consentimento por run (AER-REQ-123):**
  - Tarefa de provider real só roda com `/run --consent <ids>` (p.ex. `claude,codex,kimi,opencode,google`).
  - Sem isso, a tarefa fica `BLOCKED CONSENT_REQUIRED` e **nada é executado, nem o probe**.
  - O aceite fica registrado como `ApprovalGranted`.
- **Paralelismo 1 por provider real** (`maxPerProvider`). `claude:<modelo>` conta como `claude`. O motivo são os termos de uso individual; ver a pesquisa.
- **Credenciais isoladas (AER-REQ-117/127):** cada adapter recebe o ambiente sem as variáveis de credencial dos outros providers (`scopedEnv`). Teste: `OPENAI_API_KEY` nunca chega ao `claude`, e `ANTHROPIC_API_KEY` nunca chega ao `codex`.
- **O AER nunca faz login** e nunca lê arquivos de credencial dos clientes (AER-REQ-121/126). Login ausente ou expirado aparece como `NOT_AUTHENTICATED`/`AUTH_EXPIRED`, com a instrução de logar no próprio cliente.
- **Flags proibidas:** `--dangerously-*`, `bypassPermissions`, `--bare` (com assinatura), `danger-full-access`, `--trust`.
- **Versão fora da faixa testada é recusada** (`UNSUPPORTED_VERSION`): claude `[2.1.0, 2.2.0)`, codex `[0.170.0, 0.171.0)`. A faixa do Codex é estreita porque o CLI muda rápido.
- **Destino da tarefa:**
  - Stream sem o evento final (`result` / `turn.completed`) dá `NO_RESULT`, e a tarefa falha.
  - Tipo de evento desconhecido do vendor é registrado (`UNRECOGNIZED_EVENT`) e não falha a tarefa.
  - JSON inválido dá `PARSE_ERROR`, e a tarefa falha.
- **Uso:** só tokens reportados pelo cliente, com a fonte. O `total_cost_usd` do Claude **não** é registrado como gasto, porque em assinatura ele não é cobrança (§8.1).

## Limitações conhecidas
| Limitação | Efeito | Quando resolver |
|---|---|---|
| Sem canal de aprovação | claude: `--permission-prompts none` (o que pediria aprovação é negado); codex: `approval_policy="never"` | PHASE-10 (`/approval`) |
| Prompt vai no argv | o conteúdo das instruções fica visível no `ps` do próprio usuário | trocar por stdin quando `SpawnOptions` aceitar stdin |
| Erros de auth/limite classificados por texto | uma mensagem nova do vendor pode cair em `TASK_FAILED` | quando houver captura real de um erro (não provocável sem custo) |
| Codex pode editar via `command_execution` (shell dentro do sandbox `workspace-write`) sem emitir `file_change` | os eventos `file_change` não são completos; o diff/commit da worktree é a fonte autoritativa | — (comportamento do vendor) |
| Windows + codex instalado via npm (`codex.cmd`) | `UNSUPPORTED_VERSION` ("shim .cmd não roda sem shell") | PHASE-15 |
| `codex app-server` (preferido pelo §7.3) | não usado: é `[experimental]` na 0.170.0 | quando sair de experimental |
| `codex login status` escreve no stderr | tratado (verificado em 23/11/2026) | — |
| kimi/opencode sem comando oficial de status de login usado pelo AER | o `doctor` mostra READY pela versão; login ausente só aparece no `session/new` (`NOT_AUTHENTICATED`) | — |
| OpenCode: o pedido de permissão foi observado **com** `OPENCODE_CONFIG_CONTENT` forçando `ask`; sem ele, não testado | se uma versão futura ignorar a variável, as ações não passam pelo AER; o diff da worktree continua autoritativo | — |
| ACP: edições viram `file_change` `modify` (o protocolo não distingue criar/alterar) | o tipo exato vem do diff da worktree | — |
| Kimi 1.50.0 não manda `kind`/`locations`; o caminho só aparece no `diff` do pedido de permissão | o AER deduz `edit` a partir do diff; um pedido sem diff e sem kind é negado | — (comportamento do vendor) |
| Kimi tenta conferir o trabalho via Shell | o pedido é negado; a tarefa termina normal | — |
| Shell negado: OpenCode 2.4.1 encerra o turno como `cancelled`, e a tarefa fica FAILED (`TASK_FAILED`); Kimi e agy terminam normal | resultado honesto; o agente não contorna | — |
| Título de ferramenta `execute` pode conter o comando (agy: `ls -la`) | o AER registra `[comando omitido]` | — |
| Gemini CLI (`gemini --acp`) não é mais usado | login de conta Google encerrado para planos individuais em 18/06/2026; o provider `google` usa o Antigravity CLI | — |
| Termos de uso (assinatura em orquestração) | uso local autorizado pelo responsável em 23/11/2026; para distribuição, ainda não confirmado com os vendors | antes da distribuição |
