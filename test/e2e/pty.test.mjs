import { spawn, spawnSync } from 'node:child_process';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BIN, requireBuild, runSync, start, tempProject } from './helpers.mjs';

// Pseudo-terminal real via `script` (macOS/Linux). No Windows: NOT_RUN (ConPTY exige outro harness, PHASE-15).
const hasScript = process.platform !== 'win32' && spawnSync('sh', ['-c', 'command -v script'], { stdio: 'ignore' }).status === 0;
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]|\u001b[()][A-Z0-9]|\r/g;

/**
 * O Node entrega o stdin do filho como socket e o `script` do macOS falha nele ("tcgetattr/ioctl: Operation not
 * supported on socket"; FIFO também). Um `cat |` na frente dá ao `script` um pipe comum, como num shell.
 */
function pty(bin, args, cwd, extraEnv = {}) {
  const node = process.execPath;
  const q = (s) => `'${s.replaceAll("'", "'\\''")}'`;
  const inner = [node, bin, ...args].map(q).join(' ');
  const script = process.platform === 'darwin' ? `script -q /dev/null ${inner}` : `script -qfec ${q(inner)} /dev/null`;
  const child = spawn('/bin/sh', ['-c', `cat | ${script}`], { cwd, env: { ...process.env, LANG: 'pt_BR.UTF-8', TERM: 'xterm-256color', NO_COLOR: undefined, CI: 'false', ...extraEnv }, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
  let raw = '';
  child.stdout.setEncoding('utf8').on('data', (d) => (raw += d));
  child.stderr.setEncoding('utf8').on('data', (d) => (raw += d));
  const exited = new Promise((resolve) => child.on('close', (code) => resolve(code)));
  return {
    child, exited,
    /** mata sh + script + node juntos (só o sh deixava o engine vivo: ENGINE_ALREADY_RUNNING no CI) */
    killGroup: () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // grupo já terminou
      }
    },
    text: () => raw.replace(ANSI, ''),
    raw: () => raw,
    /** fecha o stdin do harness: o `cat` sai e o `script` só termina se o processo do AER também terminou */
    end: () => child.stdin.end(),
    keys: async (s) => {
      for (const ch of s) {
        child.stdin.write(ch);
        await new Promise((r) => setTimeout(r, 15));
      }
    },
    async waitFor(test, ms = 10_000) {
      const t0 = Date.now();
      while (!test(raw.replace(ANSI, ''))) {
        if (Date.now() - t0 > ms) throw new Error(`pty timeout; output:\n${raw.replace(ANSI, '').slice(-2000)}`);
        await new Promise((r) => setTimeout(r, 30));
      }
    },
  };
}

describe.runIf(hasScript)('TUIs in a real pseudo-terminal (TAR-0020)', () => {
  requireBuild();
  const p = tempProject('pty tui');
  const procs = [];
  beforeAll(() => {
    expect(runSync(BIN.ases, ['init', '--name', 'pty'], p.dir).status).toBe(0);
  });
  afterEach(async () => {
    // nenhum processo de um teste sobrevive para o próximo (o engine é escritor único)
    for (const x of procs.splice(0)) {
      if (x.child.exitCode === null) {
        if (x.killGroup) x.killGroup();
        else x.child.kill('SIGKILL');
        await x.exited;
      }
    }
  });
  afterAll(() => p.cleanup());

  it('ases: TUI starts, a typed command creates a phase, Ctrl+C twice exits cleanly', async () => {
    const t = pty(BIN.ases, [], p.dir);
    procs.push(t);
    await t.waitFor((s) => s.includes('ASES CLI') && s.includes('ases>'));
    expect(t.raw()).toMatch(/\u001b\[38;2;0;150;136m/); // teal truecolor no TTY
    await t.keys('/phase new Pela TUI\r');
    await t.waitFor((s) => s.includes('criada PHASE-01'));
    await t.keys('\u0003');
    await t.waitFor((s) => s.includes('Ctrl+C de novo em 2 s'));
    await t.keys('\u0003');
    await t.waitFor((s) => /Ctrl\+C: engine encerrado\..*estado salvo até seq 2/.test(s));
    t.end();
    expect(await t.exited).toBe(0);
  }, 40_000);

  it('ases-tar: TUI shows LIVE and an event created by ases; q quits', async () => {
    const ases = start(BIN.ases, ['--no-tui'], p.dir);
    procs.push(ases);
    await ases.waitFor('stdout', 'engine ready');
    const t = pty(BIN.tar, [], p.dir);
    procs.push(t);
    await t.waitFor((s) => s.includes('LIVE') && s.includes('Fases e tarefas'));
    ases.send('/task new PHASE-01 Vista no monitor');
    await t.waitFor((s) => s.includes('TAR-0001 PLANNED') && s.includes('Vista no monitor'));
    await t.keys('\t'); // a 80 colunas há um painel por vez: Tab mostra os eventos
    await t.waitFor((s) => /TaskCreated\s+TAR-0001/.test(s));
    await t.keys('q');
    t.end();
    expect(await t.exited).toBe(0);
    ases.send('/exit');
    expect((await ases.exited).code).toBe(0);
  }, 40_000);

  it('NO_COLOR in a TTY: the ases TUI emits no color codes', async () => {
    const t = pty(BIN.ases, [], p.dir, { NO_COLOR: '1' });
    procs.push(t);
    await t.waitFor((s) => s.includes('ASES CLI') && s.includes('ases>'));
    expect(t.raw()).not.toMatch(/\u001b\[(3[0-9]|9[0-7]|38;)/);
    await t.keys('\u0003\u0003');
    await t.waitFor((s) => s.includes('engine encerrado'));
    t.end();
    expect(await t.exited).toBe(0);
  }, 40_000);
});
