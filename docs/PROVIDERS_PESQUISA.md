# Pesquisa de providers: Claude Code e Codex (TAR-0032, 23/11/2026)

Fontes, em ordem de autoridade:
1. A ajuda dos binários **instalados neste Mac** (é a versão que de fato roda).
2. A documentação oficial.
3. Relatos da comunidade, usados só como pista e nunca como contrato.

**Probes sem efeito colateral usados:** `--version`, `--help`, `claude auth status`, `codex login status`. Nenhum prompt foi enviado e nenhuma cota foi usada. E-mail e organização foram redigidos.

## Ambiente encontrado (darwin-arm64)
| Cliente | Versão | Binário | Login (comando oficial de status) |
|---|---|---|---|
| Claude Code | 2.1.330 | `~/.local/bin/claude` (build nativo) | `claude.ai`, assinatura **Pro** (`authMethod: claude.ai`, `apiProvider: firstParty`), expira 29/11/2026 |
| Codex CLI | 0.170.0 | `~/.npm-global/bin/codex` (npm `@openai/codex`) | "Logged in using ChatGPT" |

## Claude Code — modo programático (fonte: `claude --help` 2.1.330)
- **Invocação:** `claude -p <prompt> --output-format stream-json --verbose`.
  - `--verbose` é exigido com stream-json em `-p`, segundo a documentação.
  - `--include-partial-messages` é opcional.
- **Permissões:**
  - `--permission-mode <acceptEdits|auto|bypassPermissions|manual|dontAsk|plan>`.
  - `--permission-prompts <host|none>`: `none` nega automaticamente tudo o que pediria aprovação.
  - `--allowed-tools` / `--disallowed-tools` / `--tools`.
  - `--restricted` remove Bash e outras ferramentas que executam código e prende as ferramentas de arquivo aos diretórios de trabalho.
- **Isolamento:**
  - `--no-session-persistence`.
  - `--strict-mcp-config`.
  - `--setting-sources`.
  - `--max-budget-usd` (só para cobrança por API).
- **NÃO usar `--bare`** com assinatura: ele aceita só `ANTHROPIC_API_KEY`/`apiKeyHelper` e nunca lê o OAuth.
- **Proibido no AER:** `--dangerously-skip-permissions` e `bypassPermissions` (§12).
- **Eventos (documentação oficial; campos variam por versão):**
  - `system/init` (sessão, modelo, ferramentas).
  - `assistant` e `user` (blocos de conteúdo, `tool_use`/`tool_result`).
  - `system/api_retry`, `system/permission_denied`.
  - `stream_event` (só com partial).
  - `result` final, com `subtype` (sucesso/limite), uso e custo.
  - **Contrato real a confirmar com fixture capturada desta versão.**

## Codex — modo programático (fonte: `codex exec --help` 0.170.0)
- **Invocação:** `codex exec --json -C <worktree> -s workspace-write --ephemeral <prompt>`.
  - Também pode receber o prompt por stdin (`-`).
  - `-o <arquivo>` grava a última mensagem.
- **Sandbox:** `-s read-only|workspace-write|danger-full-access`.
- **Aprovação:** `-a, --ask-for-approval` aparece em `codex --help`; o `exec` é não interativo.
- **Proibidos no AER:**
  - `--dangerously-bypass-approvals-and-sandbox`.
  - `--dangerously-bypass-hook-trust`.
  - `danger-full-access`.
  - `--trust` (persistiria confiança no projeto do usuário).
- **Eventos JSONL (documentação oficial "Non-interactive mode"):**
  - `thread.started` (com `thread_id`).
  - `turn.started`.
  - `item.started` / `item.updated` / `item.completed` (`agent_message`, comandos, alterações de arquivo).
  - `turn.completed` (com usage) / `turn.failed`.
  - `error`.
  - **Contrato real a confirmar com fixture capturada desta versão.**
- **`codex app-server`** é preferido pelo §7.3, mas está marcado `[experimental]` nesta versão. A PHASE-07 usa `exec --json` (a alternativa documentada no §7.3); o app-server fica CONDITIONAL.

## Conformidade de autenticação — ponto aberto (não é parecer jurídico)
A página oficial "Legal and compliance" do Claude Code diz:
- Terceiros **não podem oferecer login claude.ai** em seus produtos.
- Terceiros **não podem rotear requisições por credenciais Free/Pro/Max/Ultra em nome de seus usuários**.
- Terceiros **não podem armazenar nem interceptar** tokens de sessão.
- Quem embute o Claude Code deve rodá-lo **como publicado**, sem remover métodos de autenticação, e **cada usuário final autentica com a própria credencial**.
- Os limites anunciados presumem **uso individual comum**.

Leitura para o AER, a ser confirmada pelo responsável:
- **Compatível com o desenho do AER:** o binário oficial não é modificado, o usuário faz login no próprio cliente (`OFFICIAL_CLI_SESSION`), e o AER não lê, copia nem intercepta tokens (AER-REQ-121/126).
- **Incerto:** se orquestrar sessões em paralelo com assinatura Pro, num produto que será distribuído, conta como "uso individual comum". O AER **não afirma** que isso é permitido.
- **Decisão desta fase:** o adapter Claude só roda com consentimento explícito do usuário dono da sessão. O paralelismo padrão por provider é 1 (`maxPerProvider`). Para distribuição, a recomendação é confirmar com a Anthropic (Sales) ou oferecer `API_KEY_MANAGED` com aviso de cobrança (AER-REQ-123).
- **Codex com login ChatGPT:** os termos da OpenAI para orquestração por terceiros **não foram verificados** nesta pesquisa. Status UNKNOWN até a verificação.

## Riscos de inventar contrato
Os formatos de evento acima vêm da documentação, não desta versão. Pelo §7.6, os parsers precisam ser validados contra **fixtures reais capturadas** destes binários. Capturar exige enviar prompts, o que consome cota das duas assinaturas e, por isso, **precisa de consentimento explícito** (AER-REQ-123).

Fontes:
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/agent-sdk/overview
- https://developers.openai.com/codex/noninteractive
