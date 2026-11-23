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

## Defeitos reais encontrados pelo CI (corrigidos)
1. **Windows: o servidor MCP herdava o ambiente inteiro do engine** (run 45251873118). Agora o servidor sobe com uma **allowlist** de variáveis (`mcpEnv`: PATH, HOME, TEMP, SystemRoot…), sem credenciais nem variáveis internas do Node/vitest, como pede o §12.2.
2. **Windows: depois do health check, o `ases` dizia "engine encerrado" e não saía** (run 45254028483). Os pipes do servidor MCP continuavam referenciados depois do `taskkill`. Agora stdin, stdout e stderr são encerrados explicitamente.
   - A causa só apareceu depois de o e2e passar a anexar stdout/stderr da sessão quando falha.
3. **Ubuntu: o flake do pty voltou** (run 45252718578): o 1º Ctrl+C chegava antes do raw mode e virava SIGINT do tty. Agora o teste espera o raw mode ("?" com prompt vazio abre a ajuda, o que não acontece em modo normal) antes do Ctrl+C.

CI do commit `6eaf402` (run 45254652196): Linux e Windows 6/6.

## `npm run verify`
```text
boundaries: OK
 Test Files  43 passed (43)
      Tests  263 passed (263)
```
Os testes de segurança (14) foram repetidos mais 2 vezes, com 14/14 nas duas.
