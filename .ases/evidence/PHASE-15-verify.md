# PHASE-15: verificação (24/11/2026, sessão Claude Code)

**Ambiente local:** darwin-arm64, Node v22.19.0, branch `ases/PHASE-15`. Windows e Linux **reais** pelo CI do GitHub Actions.

## Gate: `ases` + `ases-tar`, eventos, persistência, concorrência simulada, segurança e npm em Windows e Linux reais
- **Windows (x64 e arm64) e Linux (x64 e arm64):** o CI roda a suíte inteira com processos reais, incluindo:
  - os e2e de dois processos `ases`/`ases-tar`;
  - `/run` com o simulador;
  - o motor residente;
  - o pack-smoke com instalação offline e shells: pwsh, PowerShell e cmd no Windows; bash e pwsh no Linux.
- **Run 45411121443 (`ad0e4ac`):** Windows 3/3 e Linux 3/3. A matriz está em `docs/MATRIZ_SUPORTE.md`.
- **macOS:** NOT_RUN no CI (cancelado na fila). Local: 277 passed, 3 skipped (os 3 testes só de Windows).

## Por tarefa
| TAR | Entrega | Evidência real (CI Windows) |
|---|---|---|
| 0065 | SecretStore no Credential Manager (advapi32 via `powershell.exe` do sistema; script e segredo só no stdin) | `secrets.test.ts` "round-trip with non-ASCII and quotes; neither value nor key in argv" ✓ em windows-latest (3,9 s) e windows-11-arm. `doctor`: `secretStore.available: true` |
| 0066 | DACL dos diretórios privados lida por SID e restringida com icacls; junction recusada | `platform.test.ts` "a dir readable by Everyone is restricted…" ✓ |
| 0067 | O mesmo projeto por letra de unidade, UNC, junction e `subst` | `test/e2e/windows-paths.test.mjs` ✓ (mesmo `projectId`; escreve por um caminho e lê por outro) |
| 0068 | Matriz PASS/FAIL/NOT_RUN gerada dos jobs reais; o `doctor` aponta para ela | `test/support-matrix.test.mjs` ✓; job `support-matrix` no CI; `docs/MATRIZ_SUPORTE.md` |
| 0069 | TUI no ConPTY/Windows Terminal | **NOT_RUN**: falta harness e é preciso decidir sobre o `node-pty`. Roteiro manual em `docs/SUPORTE_TERMINAIS_WINDOWS.md` |

## Defeitos encontrados pelo CI e corrigidos
1. **Run 45408100121:** o `Get-Acl` do PowerShell 5.1 falhava quando era chamado de dentro do pwsh 7, por causa do `PSModulePath` herdado. Agora a ACL é lida só pela API .NET.
2. **Run 45409051065:** tirar o `PSModulePath` travou o PowerShell no windows-11-arm. O ambiente voltou a ser herdado.

## Fora desta fase
- **Supervisor do SO** (systemd-user, Agendador do Windows): segue o ADR-0017, sem supervisor; recuperação via `/resume`.
- **SMB remoto:** não testado.
- **Constrained Language Mode:** documentado no ADR-0018 (falha fechado).
