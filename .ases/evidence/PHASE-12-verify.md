# PHASE-12: verificação (24/11/2026, sessão Claude Code)

**Ambiente:** darwin-arm64, Node v22.19.0, branch `ases/PHASE-12`.

## Gate: instalar, rodar e desinstalar o pacote; DoD §21 sem P0 aberto sem exceção aprovada

### Pacote npm único (TAR-0061/0062, AER-REQ-004/232/233)
- **Pacote:** `scripts/pack.mjs` gera `@eureka42/aer` com os bins `ases` e `ases-tar`. Ele é autocontido: 21 pacotes internos e 41 de terceiros embutidos, e a instalação não usa rede.
- **Smoke** (`scripts/pack-smoke.mjs`, CI nos 8 alvos), num prefixo temporário:
  1. instala com `--offline`;
  2. chama os comandos pelo PATH: bash/zsh/pwsh no POSIX; pwsh, PowerShell e cmd no Windows;
  3. roda `init`, `/ases import` e `/gate G0 PASS`;
  4. desinstala: os dois comandos somem e os dados do projeto ficam.
- **Licenças de terceiros:** 37 MIT, 1 ISC e 1 `(MIT OR CC0-1.0)`.
  - O `pack` recusa licença fora de uma allowlist permissiva e grava `THIRD_PARTY_LICENSES.md` no pacote (41 entradas, com o texto de cada licença).
  - `yoga-layout@3.2.1` não publica o arquivo de licença; a entrada dele registra a licença MIT declarada e o repositório.
  - A licença do AER (CC BY-NC-ND 4.0) não conflita com embutir MIT/ISC, desde que os avisos acompanhem o pacote. Isto não é parecer jurídico.
- **Fontes tipográficas:** o `pack` recusa `.ttf`, `.otf`, `.woff` e `.eot` (AER-REQ-250).

### Motor residente (TAR-0059/0060, ADR-0017)
- **Comandos:** `ases daemon start|stop|status|run`. Com o motor de pé, `ases` vira cliente `control` via `session.command`.
- **e2e** (`test/e2e/daemon.test.mjs`):
  - a tarefa continua RUNNING depois que o cliente fecha;
  - `daemon stop` cancela e não deixa neto vivo.
- **Sem supervisor do SO:** reboot ou queda do motor não são cobertos; a recuperação é o `/resume`. Isso está declarado no ADR-0017 e no `docs/INSTALL.md`.

### Auditoria dos P0 (TAR-0063/0064, `docs/AUDITORIA_P0.md`)
**31 COBERTOS:** 26 já tinham teste ou foram ligados a um. Os 5 abaixo foram implementados em 24/11:

| REQ | Implementação e teste |
|---|---|
| 095 | `ases-tar --errors` (`eventSeverity`); `apps/ases-tar/test/format.test.ts` |
| 097 | `/diff TAR-XXXX [ATT-XXXX]`; o e2e de continuidade compara HEAD e status de todas as worktrees antes e depois |
| 027 | `/phase order`; `store.test.ts` "phase reorder" |
| 171 | Teto de 64 MiB de stdout total (`OUTPUT_LIMIT`); `provider-sdk/test/process.test.ts` com flood real (SIGTERM, árvore reconciliada) |
| 048 | Cooldown de 15 min após `RATE_LIMITED` (`PROVIDER_COOLDOWN`, sem probe nem processo); `worker.test.ts` com `simulator:rate-limit` |

**EXCEÇÃO APROVADA pelo responsável em 24/11/2026** (fica para depois do MVP, lacunas registradas):
- 8 parciais: 025, 049, 082, 086, 128, 174, 230 e 234;
- 4 não implementados: 020, 026, 029 e 083.

### Segurança e conformidade de autenticação (revisão desta fase)
- **Provedores:** o AER não faz login nem lê arquivos de credencial dos clientes.
  - Uso real só com `/run --consent <ids>` e 1 por provider.
  - Flags de permissão irrestrita são proibidas e testadas nos adapters.
- **Credenciais:** o ACP aprova só `allow_once` dentro da worktree, nunca `execute`/`fetch`. O SecretStore é nativo: Keychain no macOS e secret-tool no Linux; no Windows fica indisponível e falha fechado.
- **Rede e acesso:** sem servidor de rede (regra `no-network-server`). O `ases-tar` usa token de monitor, que o engine recusa para métodos mutantes.
- **Novo nesta fase:**
  - o `/diff` passa a saída por `redactText`;
  - os refs usados vêm do banco (o commit base é hex e a branch segue o formato `ases/TAR/ATT`), então não há injeção de argumento no git.
- **Termos dos vendors:** a orquestração foi autorizada por declaração do responsável. Os documentos não estão no repositório.

## `npm run verify` (b44d791)
```text
boundaries: OK
 Test Files  48 passed (48)
      Tests  275 passed (275)
```

## CI
- `24aedaa` (run 45304163008): 8/8.
- `b44d791` (run 45402093641): Linux 3/3 e Windows 3/3 passaram. Os dois jobs macOS estavam na fila do GitHub quando isto foi escrito; no macOS local, `npm run verify` deu 275/275 e o `pack-smoke` passou.
