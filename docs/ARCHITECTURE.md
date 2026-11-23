# ARCHITECTURE — AER

> Situação: PHASE-02. A arquitetura-alvo está no MD mestre §3 e as decisões em `docs/ADRs/`.

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
| `@aer/platform-core` | contrato `PlatformAdapter` (§3.6); runtime dir, endpoint IPC, capacidades de terminal, `SecretStore` que recusa plaintext | node builtins |
| `@aer/persistence` | SQLite (`node:sqlite`, ADR-0002): migrações, `ProjectStore` transacional (estado + evento na mesma transação), espelho/verificação JSONL. Único pacote que pode importar `node:sqlite` | contracts |
| `@aer/platform-macos` / `-windows` / `-linux` | fábricas de adapter por SO; as especializações nativas vêm nas PHASE-06/10/12/15 | platform-core |

Os métodos de processo, notificação e supervisor lançam `NotImplementedError` com a fase prevista. Nenhum finge funcionar.

## Regras de dependência (verificadas por `npm run lint`)
- `contracts` não importa nenhum `@aer/*`.
- `contracts`, `core`, `scheduler`, `provider-sdk`, `persistence`, `event-log` e `tui-shared` não importam adapters de SO.
- `ink`/`react` só aparecem em `tui-shared` e `branding`.
- Um adapter de SO não importa outro.
- `node:sqlite` só em `persistence`.
- Proibidos `shell: true` e `exec`/`execSync` de `child_process`.

## Estado operacional interino
`scripts/ases-dev.mjs` mantém `.ases/` até o engine existir (ADR-0001 §7).

## Próximas peças
PHASE-03: `ipc`, `apps/ases-cli`, `apps/ases-tar`.
