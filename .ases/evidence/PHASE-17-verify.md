# PHASE-17: manutenção 1.0.x, verificação (24/11/2026)

| TAR | Entrega | Evidência |
|---|---|---|
| 0076 | No Windows, os providers instalados por `npm install -g` (shim `.cmd`: claude, codex, kimi, opencode, agy) rodam o alvo do shim sem shell. O script JS é aberto pelo Node e o `.exe` direto; qualquer outro `.cmd` é recusado | `platform.test.ts` "npm .cmd shims…": resolução em todos os SOs; "spawnManagedProcess runs the shim target…" no Windows real (CI run 45460968394: windows-latest 22/24 e windows-11-arm) |
| 0077 | `git worktree add/remove` serializados por repositório. Corrige a corrida "failed to read .git/worktrees/…/commondir" do CI run 45460214446 | `git-bridge.test.ts` "eight createWorktree calls at once…" |

**CI run 45460968394:** Windows 3/3 e Linux 3/3. Os jobs de macOS ficaram na fila (NOT_RUN). Local, no macOS: 285 passed.

**Publicação:**
- `@eureka42-ai/aer@1.0.1` foi publicado pelo responsável (Touch ID).
- O shasum do registro, `75a53c02c55c6a220ec35e01342f22f938af0685`, é igual ao do tarball testado.
- Instalado do registro no macOS, o `doctor` mostra os 6 providers READY: simulator, claude 2.1.331 (UNVERIFIED), codex, kimi, opencode e google.
- **Windows real do responsável:** ainda não confirmado.
