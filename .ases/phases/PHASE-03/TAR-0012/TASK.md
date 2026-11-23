# TAR-0012 — Servidor IPC local (UDS / Named Pipe)

| Campo | Valor |
|---|---|
| task_id | TAR-0012 |
| phase_id | PHASE-03 |
| priority | 80 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0011 |
| related_reqs | AER-REQ-014, AER-REQ-071, AER-REQ-072, AER-REQ-078, AER-REQ-080, AER-REQ-228 |
| review_policy | revisão humana antes do merge |

**Escopo:** packages/ipc: JSON-RPC 2.0 em frames NDJSON com limite, handshake versão/projeto/token, runtime dir privado, detecção de engine já ativo

## Critérios de aceite
- [ ] listener só em UDS/pipe, sem TCP
- [ ] versão incompatível recebe VERSION_MISMATCH
- [ ] frame acima do limite é negado
- [ ] handshake com timeout

## Testes
- [ ] packages/ipc/test/*.test.ts

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
