# PHASE-03 — verificação (2026-11-23T00:33:16Z)

Host: macOS arm64, Node v22.19.0. Branch `ases/PHASE-03` (worktree).

```text
$ npm run verify   # lint + typecheck + build (tsc -b) + vitest
> ases-engineering-runtime@0.0.0 verify
> npm run lint && npm run typecheck && npm run build && npm run test
> ases-engineering-runtime@0.0.0 lint
> node scripts/check-boundaries.mjs
boundaries: OK
> ases-engineering-runtime@0.0.0 typecheck
> tsc -p tsconfig.json
> ases-engineering-runtime@0.0.0 build
> tsc -b tsconfig.build.json
> ases-engineering-runtime@0.0.0 test
> vitest run
 RUN  v4.1.12 <repo>
 Test Files  17 passed (17)
      Tests  101 passed (101)
   Start at  21:33:18
   Duration  1.23s (transform 819ms, setup 0ms, import 1.57s, tests 3.37s, environment 1ms)
exit=0 (medido sem pipe)

$ npx vitest run --reporter=verbose packages/ipc packages/project-store packages/branding test/e2e
 ✓ packages/branding/test/branding.test.ts > Eureka42 brand (AER-REQ-240..248) > tokens match branding/BRAND_TOKENS.json (single source, AER-REQ-248) 1ms
 ✓ packages/branding/test/branding.test.ts > Eureka42 brand (AER-REQ-240..248) > golden text without color 0ms
 ✓ packages/branding/test/branding.test.ts > Eureka42 brand (AER-REQ-240..248) > no ANSI when color is off; same text once ANSI is stripped for every theme (AER-REQ-245) 1ms
 ✓ packages/branding/test/branding.test.ts > Eureka42 brand (AER-REQ-240..248) > fits 40 columns without wrapping (AER-REQ-244) 0ms
 ✓ packages/branding/test/branding.test.ts > Eureka42 brand (AER-REQ-240..248) > fits 50 columns without wrapping (AER-REQ-244) 0ms
 ✓ packages/branding/test/branding.test.ts > Eureka42 brand (AER-REQ-240..248) > fits 80 columns without wrapping (AER-REQ-244) 0ms
 ✓ packages/branding/test/branding.test.ts > Eureka42 brand (AER-REQ-240..248) > fits 120 columns without wrapping (AER-REQ-244) 0ms
 ✓ packages/branding/test/branding.test.ts > Eureka42 brand (AER-REQ-240..248) > falls back to ASCII without Unicode even if a mode was requested (AER-REQ-241) 0ms
 ✓ packages/project-store/test/project-store.test.ts > ases init (TAR-0011, AER-REQ-011, AER-REQ-017) > creates .ases/ with a valid manifest and private db dir 6ms
 ✓ packages/project-store/test/project-store.test.ts > ases init (TAR-0011, AER-REQ-011, AER-REQ-017) > second run changes no byte, keeps user edits and user files 6ms
 ✓ packages/project-store/test/project-store.test.ts > ases init (TAR-0011, AER-REQ-011, AER-REQ-017) > finds the root from a subdirectory (AER-REQ-012) 0ms
 ✓ packages/project-store/test/project-store.test.ts > ases init (TAR-0011, AER-REQ-011, AER-REQ-017) > detects the interim bootstrap history 0ms
 ✓ packages/project-store/test/project-store.test.ts > ases init (TAR-0011, AER-REQ-011, AER-REQ-017) > reports a missing engine session clearly 0ms
 ✓ packages/ipc/test/ipc.test.ts > handshake and auth (TAR-0012, AER-REQ-072, AER-REQ-073) > listens on a local socket path, never TCP (AER-REQ-071) 2ms
 ✓ packages/ipc/test/ipc.test.ts > handshake and auth (TAR-0012, AER-REQ-072, AER-REQ-073) > accepts valid monitor and control tokens 2ms
 ✓ packages/ipc/test/ipc.test.ts > handshake and auth (TAR-0012, AER-REQ-072, AER-REQ-073) > rejects wrong token, wrong project and incompatible protocol 2ms
 ✓ packages/ipc/test/ipc.test.ts > handshake and auth (TAR-0012, AER-REQ-072, AER-REQ-073) > refuses any method before handshake 1ms
 ✓ test/e2e/bins.test.mjs > built bins (TAR-0011, AER-REQ-004, AER-REQ-245, AER-REQ-247) > both bins answer --version and --help without ANSI when piped 259ms
 ✓ packages/ipc/test/ipc.test.ts > handshake and auth (TAR-0012, AER-REQ-072, AER-REQ-073) > closes a connection that never handshakes (AER-REQ-080) 102ms
 ✓ packages/ipc/test/ipc.test.ts > read-only monitor (TAR-0014, AER-REQ-079, C20) > denies mutating RPC for the monitor role, even hand-crafted 3ms
 ✓ packages/ipc/test/ipc.test.ts > read-only monitor (TAR-0014, AER-REQ-079, C20) > unknown methods are not reachable 1ms
 ✓ packages/ipc/test/ipc.test.ts > frames and timeouts > rejects frames over the limit and closes the connection (AER-REQ-078) 1ms
 ✓ test/e2e/bins.test.mjs > built bins (TAR-0011, AER-REQ-004, AER-REQ-245, AER-REQ-247) > --json output is pure JSON (no banner, no ANSI) 134ms
 ✓ packages/ipc/test/ipc.test.ts > frames and timeouts > a silent server makes calls fail with a typed timeout (AER-REQ-080) 153ms
 ✓ packages/ipc/test/ipc.test.ts > subscription (TAR-0013, AER-REQ-074, AER-REQ-075, AER-REQ-070) > delivers backlog then live events exactly once, in seq order 53ms
 ✓ packages/ipc/test/ipc.test.ts > subscription (TAR-0013, AER-REQ-074, AER-REQ-075, AER-REQ-070) > a reconnecting client resumes from its last seq without gaps or duplicates 1ms
 ✓ packages/ipc/test/ipc.test.ts > subscription (TAR-0013, AER-REQ-074, AER-REQ-075, AER-REQ-070) > a slow consumer never blocks the engine and gets resyncRequired (AER-REQ-077) 17ms
 ✓ packages/ipc/test/ipc.test.ts > single engine per project (§3.4) > a second server on a live endpoint fails with ENGINE_ALREADY_RUNNING 0ms
 ✓ packages/ipc/test/ipc.test.ts > single engine per project (§3.4) > replaces a stale socket path left by a dead engine 1ms
 ✓ test/e2e/bins.test.mjs > built bins (TAR-0011, AER-REQ-004, AER-REQ-245, AER-REQ-247) > init is non-destructive on a second run (AER-REQ-011) 135ms
 ✓ test/e2e/two-processes.test.mjs > ases + ases-tar in separate real processes (TAR-0015, C02, AER-REQ-091, AER-REQ-191) > an event created in ases shows up in ases-tar; restart resumes without gaps or duplicates 623ms
 ✓ test/e2e/two-processes.test.mjs > ases + ases-tar in separate real processes (TAR-0015, C02, AER-REQ-091, AER-REQ-191) > the monitor cannot mutate: the engine rejects it (C20) 61ms
 ✓ test/e2e/bins.test.mjs > built bins (TAR-0011, AER-REQ-004, AER-REQ-245, AER-REQ-247) > unimplemented commands say so explicitly and never fake success 183ms
 ✓ test/e2e/bins.test.mjs > built bins (TAR-0011, AER-REQ-004, AER-REQ-245, AER-REQ-247) > outside a project both bins exit 2 with guidance 126ms
 ✓ test/e2e/bins.test.mjs > built bins (TAR-0011, AER-REQ-004, AER-REQ-245, AER-REQ-247) > refuses to run the engine on an interim-bootstrap .ases/ (no second writer) 133ms
      Tests  35 passed (35)
```

## Verificação manual em pseudo-terminal (`script -q`, macOS)
- `LANG=pt_BR.UTF-8`: banner com ANSI truecolor teal (`ESC[38;2;0;150;136m`) no ⌘ e no 42.
- `NO_COLOR=1`: mesmo banner sem nenhuma sequência ESC.
- `LANG=C`: fallback `[E42] Eureka42 | ASES CLI`.
- O pty informou `columns=0`: antes caía em `minimal`; corrigido para tratar 0 como largura desconhecida.

## Defeitos encontrados e corrigidos durante a fase
1. `ases` não terminava após `/exit` com stdin em pipe aberto (readline não solta o stdin). Reproduzido em script isolado; corrigido com `process.stdin.destroy()`.
2. Largura 0 de pty tratada como terminal estreito.
3. Teste do servidor mudo travava porque o servidor de teste não lia o socket (defeito do teste, não do cliente).

## Não executado
- Windows (Named Pipe + ACL) e Linux reais: NOT_RUN. No Windows o controle é incompleto (ADR-0003).
- Terminal.app/iTerm2/Ghostty interativos com teclado humano: NOT_RUN (só pty via `script`).
