# PHASE-04 — verificação (2026-11-23T01:01:47Z)

Host: macOS arm64 (darwin-arm64, alvo TARGET), Node v22.19.0. Branch `ases/PHASE-04`. Dependências novas: ink 8.0.0, react 19.3.1, @types/react 19.3.0 (npm audit: 0 vulnerabilidades).

```text
$ npm run verify
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
 Test Files  22 passed (22)
      Tests  128 passed (128)
   Start at  22:01:49
   Duration  6.28s (transform 1.15s, setup 0ms, import 3.24s, tests 17.60s, environment 1ms)
exit=0 (medido sem pipe)

$ npx vitest run --reporter=verbose packages/tui-shared apps test/e2e/pty.test.mjs packages/platform-core
 ✓ packages/platform-core/test/platform.test.ts > detectPlatform (AER-REQ-225) > accepts the three targets and rejects others 1ms
 ✓ packages/platform-core/test/platform.test.ts > IPC endpoint per OS (AER-REQ-227, AER-REQ-228) > uses UDS on darwin/linux and a named pipe on win32 1ms
 ✓ packages/platform-core/test/platform.test.ts > IPC endpoint per OS (AER-REQ-227, AER-REQ-228) > is stable per project and differs between projects 0ms
 ✓ packages/platform-core/test/platform.test.ts > IPC endpoint per OS (AER-REQ-227, AER-REQ-228) > prefers XDG_RUNTIME_DIR on linux 0ms
 ✓ packages/platform-core/test/platform.test.ts > IPC endpoint per OS (AER-REQ-227, AER-REQ-228) > refuses socket paths over the sun_path limit 0ms
 ✓ packages/platform-core/test/platform.test.ts > IPC endpoint per OS (AER-REQ-227, AER-REQ-228) > builds windows runtime dirs with windows separators 0ms
 ✓ packages/platform-core/test/platform.test.ts > terminal capabilities (AER-REQ-245, AER-REQ-089) > enables color+unicode on a UTF-8 TTY 0ms
 ✓ packages/platform-core/test/platform.test.ts > terminal capabilities (AER-REQ-245, AER-REQ-089) > disables color for NO_COLOR 0ms
 ✓ packages/platform-core/test/platform.test.ts > terminal capabilities (AER-REQ-245, AER-REQ-089) > disables color for TERM=dumb 0ms
 ✓ packages/platform-core/test/platform.test.ts > terminal capabilities (AER-REQ-245, AER-REQ-089) > disables color for piped stdout 0ms
 ✓ packages/platform-core/test/platform.test.ts > terminal capabilities (AER-REQ-245, AER-REQ-089) > treats empty NO_COLOR as unset (no-color.org) 0ms
 ✓ packages/platform-core/test/platform.test.ts > terminal capabilities (AER-REQ-245, AER-REQ-089) > falls back to ASCII without UTF-8 locale or outside Windows Terminal 0ms
 ✓ packages/platform-core/test/platform.test.ts > normalizeProjectPath (AER-REQ-230, host only) > resolves spaces, accents and symlinks to the canonical path 0ms
 ✓ packages/platform-core/test/platform.test.ts > base adapter > refuses to persist secrets when no native store exists (C-OS-04) 1ms
 ✓ packages/platform-core/test/platform.test.ts > base adapter > reports unimplemented capabilities honestly 0ms
 ✓ packages/platform-core/test/platform.test.ts > private dirs and files (AER-REQ-014, AER-REQ-202) > creates 0700 dirs, tightens loose ones and rejects symlinks 1ms
 ✓ packages/platform-core/test/platform.test.ts > private dirs and files (AER-REQ-014, AER-REQ-202) > writes private files as 0600 atomically 1ms
 ✓ packages/platform-core/test/platform.test.ts > supported targets (CHANGE-0001) > accepts Apple Silicon, Windows and Linux; rejects macOS Intel 0ms
 ✓ apps/ases-tar/test/projection.test.ts > local projection (TAR-0018) > snapshot + events equals a fresh snapshot (state, versions, ids) 14ms
 ✓ packages/tui-shared/test/tui-shared.test.tsx > tui-shared (TAR-0016) > renders brand + badge; no color codes when color is off (AER-REQ-245) 72ms
 ✓ packages/tui-shared/test/tui-shared.test.tsx > tui-shared (TAR-0016) > ASCII fallback: [E42], ASCII badge symbol and classic borders (AER-REQ-241) 24ms
 ✓ packages/tui-shared/test/tui-shared.test.tsx > tui-shared (TAR-0016) > status is distinguishable without color (§11.6) 87ms
 ✓ packages/tui-shared/test/tui-shared.test.tsx > tui-shared (TAR-0016) > re-renders on resize and never exceeds the width (AER-REQ-201, AER-REQ-244) 87ms
 ✓ packages/tui-shared/test/tui-shared.test.tsx > tui-shared (TAR-0016) > help overlay lists keys; clip truncates with ellipsis 23ms
 ✓ apps/ases-tar/test/tui.test.tsx > ases-tar TUI (TAR-0018, TAR-0019) > shows status, phases, tasks and live events; updates on events without refetching 145ms
 ✓ apps/ases-tar/test/tui.test.tsx > ases-tar TUI (TAR-0018, TAR-0019) > keyboard: ↓ selects, Enter opens detail (task.get), Esc returns, ? help, r reconnects, q quits 243ms
 ✓ apps/ases-tar/test/tui.test.tsx > ases-tar TUI (TAR-0018, TAR-0019) > narrow terminals show one pane and Tab switches (AER-REQ-088) 78ms
 ✓ apps/ases-cli/test/tui.test.tsx > ases TUI (TAR-0017) > typing a command updates the session log, the side pane and the header (event-driven) 648ms
 ✓ apps/ases-tar/test/tui.test.tsx > ases-tar TUI (TAR-0018, TAR-0019) > fits 40x16 without overflow, in color and NO_COLOR (AER-REQ-244, AER-REQ-245) 113ms
 ✓ apps/ases-tar/test/tui.test.tsx > ases-tar TUI (TAR-0018, TAR-0019) > fits 50x16 without overflow, in color and NO_COLOR (AER-REQ-244, AER-REQ-245) 110ms
 ✓ apps/ases-tar/test/tui.test.tsx > ases-tar TUI (TAR-0018, TAR-0019) > fits 80x24 without overflow, in color and NO_COLOR (AER-REQ-244, AER-REQ-245) 114ms
 ✓ apps/ases-tar/test/tui.test.tsx > ases-tar TUI (TAR-0018, TAR-0019) > fits 120x35 without overflow, in color and NO_COLOR (AER-REQ-244, AER-REQ-245) 115ms
 ✓ apps/ases-tar/test/tui.test.tsx > ases-tar TUI (TAR-0018, TAR-0019) > ASCII at 40 columns keeps brand and status on one line 57ms
 ✓ apps/ases-tar/test/tui.test.tsx > ases-tar TUI (TAR-0018, TAR-0019) > ASCII terminal: no Unicode glyphs or round borders 57ms
 ✓ apps/ases-tar/test/tui.test.tsx > ases-tar TUI (TAR-0018, TAR-0019) > --task filter limits tasks and events 57ms
 ✓ apps/ases-cli/test/tui.test.tsx > ases TUI (TAR-0017) > history with ↑, backspace, Tab focus + Enter on a task, help, Ctrl+L, free text is not sent anywhere 638ms
 ✓ apps/ases-cli/test/tui.test.tsx > ases TUI (TAR-0017) > Ctrl+C warns first and exits on the second press (§6.4, AER-REQ-090) 88ms
 ✓ apps/ases-cli/test/tui.test.tsx > ases TUI (TAR-0017) > fits 40x16, NO_COLOR has no color codes, ASCII has no glyphs 549ms
 ✓ apps/ases-cli/test/tui.test.tsx > ases TUI (TAR-0017) > fits 80x24, NO_COLOR has no color codes, ASCII has no glyphs 547ms
 ✓ test/e2e/pty.test.mjs > TUIs in a real pseudo-terminal (TAR-0020) > ases: TUI starts, a typed command creates a phase, Ctrl+C twice exits cleanly 2621ms
 ✓ apps/ases-cli/test/tui.test.tsx > ases TUI (TAR-0017) > fits 120x35, NO_COLOR has no color codes, ASCII has no glyphs 539ms
 ✓ test/e2e/pty.test.mjs > TUIs in a real pseudo-terminal (TAR-0020) > ases-tar: TUI shows LIVE and an event created by ases; q quits 703ms
 ✓ test/e2e/pty.test.mjs > TUIs in a real pseudo-terminal (TAR-0020) > NO_COLOR in a TTY: the ases TUI emits no color codes 2292ms
      Tests  43 passed (43)
```

## Defeitos reais encontrados e corrigidos nesta fase
1. Painel de tarefas espremido para ~37 colunas pelo flex do painel de eventos → larguras numéricas.
2. Cabeçalho ASCII a 40 colunas quebrava em 2 linhas e cortava o badge (`* LIV`) → marca curta `[E42] APP` e itens sem encolher.
3. Textos do AER com glifos Unicode no modo ASCII (`·`, `↑↓`, `—`, `→`) → `symbols()`.
4. Mensagens da sessão cortadas no painel → quebra de linha dentro do painel.
5. CI rodava testes sem build (E2E falhariam) → `npm run verify` no workflow.

## Não executado
- Linux real (pty via `script -qfec`), Windows real (ConPTY), terminais humanos (Terminal.app/iTerm2/Ghostty/Windows Terminal): NOT_RUN.
- CPU em repouso do monitor (AER-REQ-203): não medida.
