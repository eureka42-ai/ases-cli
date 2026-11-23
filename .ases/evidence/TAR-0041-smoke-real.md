# TAR-0041: smoke real ACP (Kimi, OpenCode, Google/Antigravity), 2026-11-23, darwin-arm64

**Consentimento:** o responsável autorizou explicitamente ("autorizo tudo", 23/11/2026) chamadas reais ao Kimi e ao OpenCode, com consumo de cota, e a instalação do Gemini CLI. Isso não é parecer jurídico. Os termos para distribuição continuam UNKNOWN (`docs/PROVIDERS_PESQUISA_PHASE08.md`).

As chamadas usaram o próprio adapter (`AcpProvider`, dist) e um wrapper que só copia o stream (`tee`), em pastas temporárias do scratchpad, fora deste repositório.

## Kimi Code CLI 1.50.0: VERIFIED
| Prompt | Resultado |
|---|---|
| "Crie hello.txt contendo hi" (`WORKTREE_WRITE`) | `PERMISSION_GRANTED` (edit dentro da worktree) → `file_change hello.txt` → mensagem final → `exit 0 reconciled` |
| "Rode `ls -la`…" | pedido "Run command `ls -la`" → `PERMISSION_DENIED` (`reject_once`) |
| Pelo motor (`/run --consent kimi`) | TAR-0001 → **REVIEW**; commit `kimi.txt` em `ases/TAR-0001/ATT-0001`; `ProviderDetected contractStatus: VERIFIED`. Depois de escrever, o Kimi tentou conferir com Shell, e o pedido foi **negado** |

**O que a saída real mudou:**
- **O Kimi não manda `kind` nem `locations`**, nem no `tool_call` nem no `session/request_permission`. O caminho vem só no bloco `content: [{type: "diff", path, oldText, newText}]` do pedido de permissão.
  - O cliente agora extrai os caminhos dos `diff` e trata como `edit` um pedido sem `kind` que traga diff. A política da worktree continua valendo.
  - Sem essa correção, a primeira chamada real teve a **escrita negada** (registrado).
- Os `tool_call_update` `in_progress` fazem streaming dos argumentos com o caminho parcial. O mapper só considera `completed`/`failed`.
- **Nome da ferramenta:** sem `kind`, o log usa a 1ª palavra do título (`WriteFile`, `Shell`).
- **Opções do Kimi:** `approve` (allow_once), `approve_for_session` (allow_always) e `reject` (reject_once). O AER só escolhe as `_once`.

## Histórico: OpenCode 1.19.6 com a chave expirada
- **Handshake:** `initialize` e `session/new` OK.
- **`session/prompt`:** devolveu o erro JSON-RPC `-32603` "This API key has expired. Create a new API key in OpenCode Console… Signing in again will not renew this key."
  - O adapter classificava isso como `NOT_AUTHENTICATED`. Agora a classificação é **`AUTH_EXPIRED`**, com o regex corrigido e um teste sobre a fixture real.
- **`usage_update`** `{used, size, cost}` é a ocupação da janela de contexto. Não é registrado como uso de tokens.
- **Não verificado:**
  - o caminho de sucesso;
  - se o `OPENCODE_CONFIG_CONTENT` faz o OpenCode pedir permissão.
  - Pré-requisito: o responsável criar uma chave nova no OpenCode Console.

## Histórico: Gemini CLI 0.70.0 sem login
- **Instalação:** a instalação global pelo agente foi bloqueada pelo controle de permissões da sessão e não foi contornada. O **próprio responsável instalou** com `npm i -g @google/gemini-cli` (0.70.0).
- **`gemini` sem terminal interativo:** pede um método de autenticação. O login ainda não foi feito.
- **Handshake real `gemini --acp`:**
  - `initialize` dá `protocolVersion: 1`;
  - `authMethods`: `oauth-personal`, `gemini-api-key`, `vertex-ai` e `gateway`;
  - `session/new` dá o erro `-32000` "Gemini API key is missing or not configured.", e o adapter classifica como `NOT_AUTHENTICATED` (fixture `real-gemini-0.70.0-not-authenticated.jsonl`).
- **Faixa:** habilitada em `[0.70.0, 0.71.0)` como UNVERIFIED. O prompt real depende do login.

## OpenCode 2.4.1: VERIFIED (depois da chave nova)
O responsável renovou a credencial, e o OpenCode foi atualizado para a 2.4.1 nesse processo.
- **Trava de versão:** o adapter recusou a 2.4.1 (`UNSUPPORTED_VERSION`, fora de `[1.19.6, 1.20.0)`), como deve.
- **Mudança de interface:** a 2.4.1 **removeu `acp --cwd`**. Com a flag, ela imprime a ajuda e não sobe o servidor. O adapter passou a usar só `acp`, e a faixa virou `[2.4.1, 2.5.0)`.
- **Smoke de escrita:** o OpenCode **pediu permissão**, com o `OPENCODE_CONFIG_CONTENT` forçando `ask`. O AER concedeu a edição dentro da worktree, `hello.txt` foi criado e o turno terminou em `end_turn`.
- **Smoke de shell:** o pedido de `execute` foi negado; o OpenCode encerrou o turno como `cancelled`, e a tarefa ficou como `TASK_FAILED`.
- **Pelo motor:** TAR-0001 chegou a REVIEW com commit `opencode.txt`; `ProviderDetected` com `VERIFIED`.

## Google: Antigravity CLI 1.5.13: VERIFIED
O Gemini CLI 0.70.0 foi instalado pelo responsável, mas não loga: o Google encerrou o login de conta para planos individuais em 18/06/2026 e migrou para o Antigravity. O provider `google` passou a usar o `agy acp --sandbox`.
- **Handshake:** "Antigravity ACP Server 1.5.13", ACP v1, `session/new` aceito com a conta do responsável.
- **Smoke de escrita:** `PERMISSION_GRANTED` (edit dentro da worktree), `hello.txt` criado, `end_turn`.
- **Smoke de shell:** `execute` com o título `ls -la` foi **negado**. O título de `execute` agora é registrado como `[comando omitido]`.
- **Evento novo:** `session_info_update` (título da sessão), agora ignorado.
- **Pelo motor:** TAR-0002 chegou a REVIEW com commit `google.txt`, `ProviderDetected` `VERIFIED`. O agy também tentou um shell depois de escrever, e o pedido foi negado.
- **Os dois pelo motor ao mesmo tempo:** `/run --consent opencode,google --parallel 2`.

## Fixtures reais redigidas
Arquivos `packages/provider-acp/test/fixtures/real-*`:
- `real-opencode-2.4.1-write.jsonl`, `real-opencode-2.4.1-shell-denied.jsonl`
- `real-antigravity-1.5.13-write.jsonl`, `real-antigravity-1.5.13-shell-denied.jsonl`
- `real-kimi-1.50.0-write.jsonl`
- `real-kimi-1.50.0-shell-denied.jsonl`
- `real-opencode-1.19.6-auth-expired.jsonl`

**Redação aplicada:**
- só as linhas do agente;
- caminho → `__CWD__` ou `__TMP__`;
- UUIDs e `sessionId` zerados;
- ids `tool_` trocados;
- listas `availableCommands`/`configOptions` esvaziadas;
- updates `in_progress` removidos.

O nome do usuário é trocado em qualquer posição, inclusive em pedaços de chunk. O script recusa gravar se sobrar o nome do usuário, um e-mail ou `sk-`.

## `npm run verify`
```text
 Test Files  37 passed (37)
      Tests  234 passed (234)
```
