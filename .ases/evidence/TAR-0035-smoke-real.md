# TAR-0035 — smoke real Claude Code e Codex (2026-11-23, darwin-arm64)

**Consentimento:** o responsável autorizou explicitamente o consumo de cota das assinaturas e assumiu a posição sobre os termos de uso ("tem todos consentimentos, continue", 23/11/2026). Isso **não é** parecer jurídico. A pendência de confirmação com Anthropic/OpenAI para **distribuição** continua em `docs/PROVIDERS_PESQUISA.md`.

**Binários:** Claude Code 2.1.330 (claude.ai Pro) e Codex 0.170.0 (ChatGPT). Os prompts foram mínimos e rodaram só em diretórios temporários do scratchpad, fora deste repositório.

## 1. Captura bruta (6 chamadas no total)
| Chamada | Flags do AER | Saída | Resultado |
|---|---|---|---|
| `claude -p "Responda apenas com a palavra OK."` | `READ_ONLY` (`plan`, `--tools Read,Grep,Glob`) | 0 | 7 linhas, `result/success` |
| `claude -p "Crie nota.txt..."` | `WORKTREE_WRITE` (`acceptEdits`) | 0 | `tool_use Write` → arquivo criado |
| `codex exec ... -s read-only "Responda OK"` | `READ_ONLY` | 0 | `thread.started`, `turn.started`, `agent_message`, `turn.completed` |
| `codex exec ... -s workspace-write "Crie nota.txt..."` | `WORKTREE_WRITE` | 0 | item `file_change` (`kind: add`) em `started` e em `completed` |
| adapter `ClaudeCodeProvider.start` (dist) | `WORKTREE_WRITE` | 0 | `hello.txt` criado; `exit reconciled=true` |
| adapter `CodexProvider.start` (dist) | `WORKTREE_WRITE` | 0 | `hello.txt` criado; `exit reconciled=true` |

As capturas foram redigidas e versionadas:
- `packages/provider-claude/test/fixtures/real-2.1.330-{readonly,write}.jsonl`
- `packages/provider-codex/test/fixtures/real-0.170.0-{readonly,write}.jsonl`

**Redação aplicada:** caminho → `__CWD__`; UUIDs zerados; `signature`, `request_id` e ids `msg_`/`toolu_` trocados; listas de slash commands, skills, plugins, agents e MCP do ambiente esvaziadas. O script recusa gravar se sobrar `raulg`, `@` ou `sk-`.

## 2. Smoke pelo motor (`ases --no-tui`, projeto temporário)
Comando: `/run --consent claude,codex --parallel 2 --timeout 240` com duas tarefas ("Crie o arquivo claude.txt/codex.txt contendo a linha ok").
```text
run concluído (2 tentativa(s), paralelismo 2):
  TAR-0001 ATT-0001 claude → REVIEW: aguarda revisão humana
  TAR-0002 ATT-0001 codex → REVIEW: aguarda revisão humana
```
Eventos (resumo): `ApprovalGranted` ×2 → `ProviderDetected` com `contractStatus: VERIFIED` ×2 → `AttemptStarted` → saída, ferramentas e uso (`TOKENS_*` com fonte) → `GitCheckpointCreated` (um commit por branch `ases/TAR-000N/ATT-0001`, com 1 arquivo cada e conteúdo `ok`) → `AttemptExited exitCode 0`.

## 3. O que a saída real mudou no código
1. **`rate_limit_event`** (Claude, não documentado) aparecia como `UNRECOGNIZED_EVENT`. Agora vira o status `RATE_LIMIT_<STATUS>`, com a janela no detalhe.
2. **O contrato é `VERIFIED` só na versão exata capturada** (`CLAUDE_VERIFIED_VERSIONS = ['2.1.330']`, `CODEX_VERIFIED_VERSIONS = ['0.170.0']`). Qualquer outra versão dentro da faixa aceita continua `UNVERIFIED`.
3. **Achado:** no smoke pelo motor, o Codex criou o arquivo com `command_execution`, um comando de shell rodando dentro do sandbox `workspace-write`, e **não** emitiu `file_change`. Consequência: os eventos `file_change` do provider **não são completos**. A fonte autoritativa das mudanças é o diff/commit da worktree, que o worker já usa.

## 4. Continua sem verificação real
- **Erros de autenticação expirada e de limite atingido:** não dá para provocar sem custo ou risco. Os parsers vêm da documentação (`doc-derived-*`).
- **Windows e Linux com os CLIs reais:** não testados. O CI não tem login, por desenho.
- **Paralelismo maior que 1 por provider:** não testado. O padrão continua 1.

## 5. `npm run verify` depois das mudanças
```text
boundaries: OK
 Test Files  36 passed (36)
      Tests  215 passed (215)
```
