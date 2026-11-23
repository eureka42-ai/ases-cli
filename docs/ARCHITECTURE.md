# ARCHITECTURE — AER

> Situação: PHASE-05. A arquitetura-alvo está no MD mestre §3 e as decisões em `docs/ADRs/`.

## Visão local

```text
 Janela A: ases ──┐                         ┌── Janela B: ases-tar (read-only)
                  │  JSON-RPC sobre          │
                  ▼  UDS (macOS/Linux)       ▼
            ┌──────── AER Local Engine ────────┐
            │ scheduler · event store · policy │
            │ providers · git-bridge · .ases/  │
            └───────────────┬──────────────────┘
                            ▼
                 SQLite (autoridade) → HISTORY.jsonl (espelho)
```
No Windows o transporte é Named Pipe `\\.\pipe\ases-{userHash}-{projectHash}`. Nada passa por TCP.

## Pacotes existentes

| Pacote | Papel | Depende de |
|---|---|---|
| `@aer/contracts` | IDs PHASE/TAR/ATT, versões, estados e máquina de transições §5, envelope de evento + payloads críticos, hash canônico, schema do `MANIFEST.json` | zod |
| `@aer/platform-core` | contrato `PlatformAdapter` (§3.6); runtime dir, endpoint IPC, capacidades de terminal, `SecretStore` que recusa plaintext, `spawnManagedProcess`/`terminateProcessTree` | node builtins |
| `@aer/persistence` | SQLite (`node:sqlite`, ADR-0002): migrações, `ProjectStore` transacional (estado + evento na mesma transação), espelho/verificação JSONL. Único pacote que pode importar `node:sqlite` | contracts |
| `@aer/scheduler` | elegibilidade/ordem explicável (`plan`), rodada com reservas (`tick`), fila de merge serializada (`mergeTask`) — ADR-0004; worker de tentativa (`runAttempt`) e laço `runQueue` — ADR-0012 | contracts, persistence, git-bridge, provider-sdk |
| `@aer/provider-sdk` | contrato `AgentProvider` v1 (§7.2), parser NDJSON incremental com limite, normalização (formato desconhecido = `PARSE_ERROR`), redação de segredos — ADR-0012 | zod |
| `@aer/provider-claude` / `@aer/provider-codex` | adapters dos CLIs oficiais (`claude -p` stream-json, `codex exec --json`); probe por `--version` e status de login; contrato UNVERIFIED até fixture real — `docs/PROVIDERS.md` | platform-core, provider-sdk |
| `@aer/provider-simulator` | provider `simulator`: processo Node local determinístico, cenários de teste, sempre `SIMULATED`, usage `UNKNOWN` | platform-core, provider-sdk |
| `@aer/git-bridge` | Git oficial sem shell: worktree por tarefa/attempt, `resolveInside` (anti-escape), merge seguro com abort em conflito | — |
| `@aer/ipc` | JSON-RPC 2.0 NDJSON sobre UDS/Named Pipe; servidor com handshake, papéis control/monitor, assinatura sem corrida e backpressure; cliente com timeout (ADR-0003, `docs/API.md`) | contracts, platform-core |
| `@aer/project-store` | layout `.ases/`, `ases init` não destrutivo, sessão do engine, carregador do adapter do SO atual | contracts, platform-* |
| `@aer/branding` | marca textual Eureka42: tokens (iguais a `branding/BRAND_TOKENS.json`), modos full/compact/minimal/ascii | — |
| `@aer/tui-shared` | componentes Ink comuns às duas TUIs (marca, badges, painéis, ajuda, resize, símbolos ASCII, render de teste) — ADR-0011, `docs/TUI-UX.md` | branding, contracts, ink, react |
| `apps/ases-cli` (`ases`) | engine embutido (escritor único) + TUI Ink (ou modo linha fora de TTY) + `init`/`doctor` | todos |
| `apps/ases-tar` (`ases-tar`) | monitor somente leitura: TUI Ink com projeção local, texto ou JSONL, filtros, reconexão sem lacuna/duplicata | branding, ipc, project-store, tui-shared |
| `@aer/platform-macos` / `-windows` / `-linux` | fábricas de adapter por SO; as especializações nativas vêm nas PHASE-06/10/12/15 | platform-core |

`getProcessTree`, notificação e supervisor lançam `NotImplementedError` com a fase prevista. Nenhum finge funcionar.

## Regras de dependência (verificadas por `npm run lint`)
- `contracts` não importa nenhum `@aer/*`.
- `contracts`, `core`, `scheduler`, `provider-sdk`, `persistence`, `event-log` e `tui-shared` não importam adapters de SO.
- `ink`/`react` só aparecem em `tui-shared` e `branding`.
- Um adapter de SO não importa outro.
- `node:sqlite` só em `persistence`.
- Proibidos `shell: true` e `exec`/`execSync` de `child_process`.

## Estado operacional
O engine é o único escritor do `.ases/` (banco + espelho + STATUS/TRACEABILITY/HANDOFF gerados). `.ases/` criados pelo bootstrap interino são entregues com `ases migrate-interim`; depois disso o `scripts/ases-dev.mjs` só verifica. O engine roda no checkout principal: worktrees não carregam o banco (`DB_MISSING` protege o histórico).

## Próximas peças
PHASE-07 (em andamento): smoke opt-in com consentimento para validar os parsers contra saídas reais. PHASE-08: Kimi, OpenCode e Google.
