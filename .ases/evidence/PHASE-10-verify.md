# PHASE-10 — verificação (2026-11-23, sessão Claude Code)

**Ambiente:** darwin-arm64, Node v22.19.0, branch `ases/PHASE-10`.

## Gate da fase (`test/e2e/security.test.mjs`)
O teste usa os bins compilados, um projeto temporário e `HOME` isolado; o PATH tem só node, git e um falso `claude`.
- **Extensão insegura rejeitada:**
  - a Skill com `setup.sh` contendo `curl … | sh` sai `UNSAFE (REMOTE_EXEC)`;
  - `/ext approve` é recusado e nenhum pedido de aprovação é criado.
- **Aprovação por hash, de uso único:**
  - MCP sem aprovação: `requires approval for this exact operation`;
  - depois de `/approval grant APR-… 5`: `VERIFIED: echo 1.0.0 · ferramentas mcp::echo::echo, mcp::echo::sum`;
  - a segunda instalação pede aprovação de novo;
  - mudar os args no `.mcp.json` leva a extensão de volta a `INSPECTED`.
- **Claude-only não roda em outro provider:**
  - o plugin `hooky@market` (com `hooks/`) foi instalado pelo CLI oficial: `plugin install hooky@market --json -s project`, sem `-y`;
  - ficou com `codex=CLAUDE_ONLY`;
  - a tarefa `--provider codex --ext EXT-…` vai para `BLOCKED: EXTENSION_INCOMPATIBLE … CLAUDE_ONLY: not executable on codex`, antes de qualquer processo.
  - No Windows o teste usa uma Skill nativa do Claude (`UNKNOWN on codex`), porque o falso `claude` é um script sh.
- **Logs redigidos:** o token do `env` do `.mcp.json` não aparece em **nenhum** arquivo do `.ases/` (banco SQLite, WAL, HISTORY.jsonl e relatórios).

## Unidade
- **`packages/security`** (9 testes):
  - política deny-by-default;
  - aprovação por hash, validade, uso único e vínculo com a tarefa;
  - interseção de camadas;
  - scanner (postinstall, curl|sh, binário ELF, symlink que escapa vs. symlink interno);
  - front matter malicioso (`!!python/object/apply`) recusado;
  - MCP sem guardar valores de segredo;
  - health check ok/hang/crash/ausente, com a árvore reconciliada;
  - plugins só pelo CLI oficial.
- **`platform-core/secrets`** (4 testes):
  - **Keychain real num chaveiro temporário isolado** (criado e apagado no teste; fora da lista de busca do usuário);
  - ida e volta com aspas e `ç`;
  - nem o valor nem o keyId aparecem no argv;
  - keyId com injeção é recusado;
  - Linux sem D-Bus fica indisponível.

## Manual
`ases secret set/has/delete/status` no Keychain real deste Mac. Uma entrada de teste (`aer-dev-test`) foi gravada no chaveiro de login e **removida** em seguida.

## `npm run verify`
```text
boundaries: OK
 Test Files  43 passed (43)
      Tests  262 passed (262)
```
Os testes de segurança (14) foram repetidos mais 2 vezes, com 14/14 nas duas.
