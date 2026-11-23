# Providers: estado e limitações (TAR-0036, PHASE-07)

`ases doctor` mostra o estado ao vivo deste computador. Ele roda só `--version` e o comando oficial de status de login de cada cliente, sem prompt e sem custo. A pesquisa que fundamenta cada flag está em `docs/PROVIDERS_PESQUISA.md`.

| Provider | Integração | Auth | Contrato | Testado com | Real executado? |
|---|---|---|---|---|---|
| `simulator` | processo Node local | nenhuma | **SIMULATED** | testes + CI 8/8 | n/a |
| `claude` | `claude -p --output-format stream-json --verbose --restricted --permission-prompts none --no-session-persistence --strict-mcp-config` | OFFICIAL_CLI_SESSION (login do próprio cliente) | **UNVERIFIED** | falso binário com o formato documentado | **NÃO** (sem consentimento para captura) |
| `codex` | `codex exec --json --ephemeral -C <worktree> -s workspace-write -c approval_policy="never"` | OFFICIAL_CLI_SESSION | **UNVERIFIED** | falso binário com o formato documentado | **NÃO** |
| `kimi`, `google`, `opencode` | — | — | — | — | PHASE-08 |

**UNVERIFIED** significa que o parser foi escrito a partir da documentação oficial e ainda não foi validado contra uma saída real capturada desta versão (§7.6). Vira **VERIFIED** só depois do smoke opt-in (TAR-0035) com fixture real, redigida e versionada.

## Regras que valem para os providers reais
- **Consentimento por run (AER-REQ-123):**
  - Tarefa `claude`/`codex` só roda com `/run --consent claude,codex`.
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
| Erros de auth/limite classificados por texto | uma mensagem nova do vendor pode cair em `TASK_FAILED` | depois da fixture real (TAR-0035) |
| Windows + codex instalado via npm (`codex.cmd`) | `UNSUPPORTED_VERSION` ("shim .cmd não roda sem shell") | PHASE-15 |
| `codex app-server` (preferido pelo §7.3) | não usado: é `[experimental]` na 0.170.0 | quando sair de experimental |
| `codex login status` escreve no stderr | tratado (verificado em 23/11/2026) | — |
| Termos de uso (assinatura em orquestração) | não confirmados; ver a pesquisa | decisão do responsável |
