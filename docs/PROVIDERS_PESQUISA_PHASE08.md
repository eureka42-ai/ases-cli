# Pesquisa de providers: Kimi, OpenCode e Google (TAR-0037, 23/11/2026)

Fontes, em ordem de autoridade:
1. Ajuda e handshake dos binários **instalados neste Mac**.
2. Documentação oficial.
3. Relatos da comunidade, usados só como pista.

**Probes sem efeito colateral usados:** `--version`, `--help`, `kimi info`, `opencode providers list` (lista só nomes, sem chaves) e o handshake ACP `initialize` + `session/new`. Esse handshake abre uma sessão, mas **não envia prompt** e não consome cota.

**Atualização (mesmo dia):** com a autorização explícita do responsável, o smoke real foi feito. Resultado em `.ases/evidence/TAR-0041-smoke-real.md`: Kimi VERIFIED em 1.50.0; OpenCode com a chave de API expirada; Gemini não instalado.

## Ambiente encontrado (darwin-arm64)
| Cliente | Versão | Binário | Auth |
|---|---|---|---|
| Kimi Code CLI | 1.50.0 (agent spec 1, wire 1.10, Python 3.14) | `/opt/homebrew/bin/kimi` | Conta Kimi (`kimi login`). O `session/new` foi aceito e listou os modelos `kimi-code/*`; não existe comando oficial de status |
| OpenCode | 1.19.6 | `~/.opencode/bin/opencode` | 2 credenciais: "OpenCode Go" e "OpenCode" (tipo api). Modelo padrão no `session/new`: `opencode/big-pickle` |
| Gemini CLI (Google) | — | **não instalado** | — |

## Por que ACP e não o modo "print"
- **Kimi:** `kimi --print` / `--quiet` **aprovam automaticamente todas as chamadas de ferramenta**, inclusive shell (ajuda da 1.50.0). Isso equivale a `bypassPermissions`, proibido no AER (§12).
- **OpenCode:** `opencode run --format json` existe, mas as permissões seguem a config do usuário. A config padrão pode ser `allow`, e nesse caso nada passa pelo AER.
- **`kimi acp`, `opencode acp` e `gemini --acp`** falam o **Agent Client Protocol v1**: JSON-RPC 2.0 em NDJSON pelo stdio. Nesse protocolo, o agente **pede** permissão com `session/request_permission`, e quem decide é o cliente, ou seja, o AER.
  - **Kimi:** leitura é auto-permitida; escrita e execução pedem aprovação por padrão (documentação oficial).
- **Um só cliente ACP serve os três.** O protocolo é aberto e o cliente é implementado no AER, sem dependência nova.

## Handshake real observado (sem prompt)
- **`initialize`** (`protocolVersion: 1`, `fs`/`terminal` desligados no cliente):
  - **Kimi:** `agentInfo {name: "Kimi Code CLI", version: "1.50.0"}`, `authMethods: [{id: "login"}]`.
  - **OpenCode:** `agentInfo {name: "OpenCode", version: "1.19.6"}`, `authMethods: [{id: "opencode-login"}]`.
- **`session/new {cwd, mcpServers: []}`** devolve `sessionId`.
  - Kimi envia antes um `session/update` do tipo `available_commands_update`. Os comandos incluem `/yolo` e `/afk`, que o AER **nunca** envia.

## Política de permissão do AER (cliente ACP)
- **Aprova uma vez** (`allow_once`) só os casos abaixo; todo o resto recebe `reject_once`:
  - `kind` em `read`, `search` ou `think`, com todos os caminhos de `locations` dentro da worktree;
  - `kind` `edit`, só no modo `WORKTREE_WRITE`, com caminhos dentro da worktree e ao menos um caminho informado.
- **Sempre rejeitado:** `execute` (shell), `fetch`, `delete`, `move`, `other`, kind desconhecido, caminho fora da worktree e pedido sem caminho para `edit`. É o mesmo nível do `--restricted` do Claude.
- **Nunca** `allow_always`: a decisão não persiste no cliente do usuário.
- Cada decisão vira evento: `PERMISSION_GRANTED` ou `PERMISSION_DENIED`, com o kind e os caminhos.
- **Resultado conhecido:** o agente pode desistir ou falhar quando o shell é negado. Isso aparece como falha da tarefa; não é escondido.

## OpenCode: forçar o pedido de permissão
A config pode ter `permission` com `allow`, `ask` ou `deny` por ferramenta (documentação oficial). O adapter passa `OPENCODE_CONFIG_CONTENT` com `{"permission": {"edit": "ask", "bash": "ask", "webfetch": "ask"}}`, para que essas ações cheguem ao AER.
- **UNVERIFIED:** a variável `OPENCODE_CONFIG_CONTENT` não apareceu na página de permissões. Precisa ser confirmada no smoke real.
- **Se o OpenCode não pedir permissão,** o diff da worktree continua sendo a fonte autoritativa, e o achado deve ser registrado.

## Google (Gemini CLI)
- **Interface documentada:** o modo ACP é `gemini --acp`; `--experimental-acp` é o nome antigo.
- **Não instalado neste Mac.** Instalar é dependência nova, que exige a revisão do responsável (CLAUDE.md).
- **Estado do adapter:** `NOT_INSTALLED` quando falta o binário. Se instalado, fica `UNSUPPORTED_VERSION` com "nenhuma versão testada", até haver smoke real. Não inventamos compatibilidade (§PHASE-08 Gate).

## Uso de tokens
O ACP v1 não define campo de uso no `session/prompt`. Uso **não reportado** para os três (capability `usage_tokens: NOT_SUPPORTED` até haver evidência). Nada é estimado.

## Termos de uso — ponto aberto (não é parecer jurídico)
Os termos de Moonshot (Kimi), OpenCode (Zen/Go) e Google para orquestração por terceiros **não foram verificados** nesta pesquisa: status UNKNOWN. A mesma regra do Claude e do Codex vale aqui:
- consentimento explícito por run (`/run --consent kimi,opencode`);
- paralelismo 1 por provider;
- o AER nunca faz login nem lê arquivos de credencial.

## Fontes
- [ACP: tool calls (v1)](https://agentclientprotocol.com/protocol/v1/tool-calls.md)
- [ACP TypeScript SDK: RequestPermissionRequest](https://agentclientprotocol.github.io/typescript-sdk/interfaces/RequestPermissionRequest.html)
- [OpenCode: permissions](https://opencode.ai/docs/permissions.md)
- [Gemini CLI: ACP mode](https://geminicli.com/docs/cli/acp-mode/)
- [Kimi Code CLI: `kimi acp`](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-acp)
- [Kimi Code CLI: comando `kimi`](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command)
