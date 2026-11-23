# TAR-0005 — Testes/CI e esqueleto PlatformAdapter

| Campo | Valor |
|---|---|
| task_id | TAR-0005 |
| phase_id | PHASE-01 |
| priority | 85 |
| risk | MODERATE |
| owner_type | PENDING |
| provider | humano + Claude Code (sessão de desenvolvimento) |
| dependencies | TAR-0002 |
| related_reqs | AER-REQ-190, AER-REQ-195, AER-REQ-225, AER-REQ-226, AER-REQ-227, AER-REQ-228, AER-REQ-229, AER-REQ-233 |
| review_policy | revisão humana antes do merge |

**Escopo:** platform-core + platform-macos/windows/linux; fakes darwin/win32/linux; workflow CI macOS/Windows/Ubuntu

## Critérios de aceite
- [ ] Contrato PlatformAdapter com métodos §3.6
- [ ] UDS em darwin/linux e Named Pipe em win32 (fake)
- [ ] SecretStore indisponível recusa persistir
- [ ] Workflow CI com matriz de 3 SO (NOT_RUN até execução real)

## Testes
- [ ] packages/platform-*/test/*.test.ts
- [ ] .github/workflows/ci.yml

## Regras de handoff
Estado vivo em `STATUS.json` desta pasta e em `.ases/STATUS.md`. Não marcar COMPLETED sem evidência.
