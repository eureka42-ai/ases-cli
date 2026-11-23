# API — protocolo local `ases` ↔ `ases-tar`

> Protocolo v1 (`VERSIONS.protocol`). Implementação em `packages/ipc`; decisões no ADR-0003.

## Transporte e framing
- UDS (macOS/Linux) ou Named Pipe (Windows), no endpoint dado por `PlatformAdapter.createLocalIpcEndpoint(projectId)`.
- JSON-RPC 2.0, uma mensagem JSON por linha (`\n`), no máximo 1 MiB por mensagem.
- Sessão: `<runtimeDir>/session.json` (`0600`) com `pid`, `endpoint`, `controlToken` e `monitorToken`. Os tokens são regenerados a cada início do engine.

## Handshake (obrigatório, até 5 s)
```json
{"jsonrpc":"2.0","id":1,"method":"rpc.handshake","params":{"protocolVersion":1,"projectId":"prj_…","role":"monitor","token":"…"}}
```
Resposta: `{protocolVersion, projectId, role, engine:{pid, appVersion}}`.

## Métodos
| Método | Papel | Parâmetros | Resultado |
|---|---|---|---|
| `project.getInfo` | monitor/control | — | `{projectId, name, journalMode, lastSeq, monitors}` |
| `project.snapshot` | monitor/control | — | `{snapshotSeq, phases[], tasks[]}` (transação de leitura única) |
| `project.eventsSince` | monitor/control | `{afterSeq, limit≤1000}` | `EventEnvelope[]` |
| `project.subscribe` | monitor/control | `{fromSeq}` | backlog via notificações + `{subscribed, fromSeq, backlog}` |
| `phase.list`, `task.list`, `task.get` | monitor/control | `{phaseId?}` / `{taskId}` | linhas do store |
| `diagnostics.getHealth` | monitor/control | — | `{status: OK\|DEGRADED, mirrorError, …}` |
| `phase.create` | **control** | `{title}` | `PHASE-NN` |
| `task.create` | **control** | `{phaseId, title, priority?, risk?, reqs?, dependsOn?}` | `TAR-NNNN` |
| `task.transition` | **control** | `{taskId, to, expectedVersion, reason?}` | nova versão |

## Notificações do servidor
- `project.event` `{event: EventEnvelope}`: exatamente uma vez por `seq`, em ordem.
- `project.resyncRequired` `{}`: o cliente ficou lento; deve reassinar a partir do último `seq` recebido.

## Erros
| Código | Nome | Quando |
|---|---|---|
| -32700 | PARSE_ERROR | linha não é JSON |
| -32600 | INVALID_REQUEST | não é JSON-RPC 2.0 válido |
| -32601 | METHOD_NOT_FOUND | método desconhecido |
| -32602 | INVALID_PARAMS | parâmetro inválido |
| -32001 | UNAUTHENTICATED | sem handshake ou token/papel inválido |
| -32002 | FORBIDDEN | método mutante com papel `monitor` |
| -32003 | VERSION_MISMATCH | protocolo incompatível (`data.engine` traz a versão do servidor) |
| -32004 | PROJECT_MISMATCH | `projectId` diferente |
| -32005 | FRAME_TOO_LARGE | mensagem acima do limite (conexão encerrada) |
| -32006 | TIMEOUT | lado cliente: sem resposta no prazo |
| -32010 | APP_ERROR | erro de domínio; `data.code` = `VERSION_CONFLICT`, `INVALID_TRANSITION`, `NOT_FOUND`, … |
