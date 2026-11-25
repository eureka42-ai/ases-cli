import { spawn, spawnSync } from 'node:child_process';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BIN, isolatedConfigEnv, requireBuild, runSync, start, tempProject, useSimulatedMain } from './helpers.mjs';

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
  const child = spawn('/bin/sh', ['-c', `cat | ${script}`], { cwd, env: { ...process.env, ...isolatedConfigEnv, LANG: 'pt_BR.UTF-8', TERM: 'xterm-256color', NO_COLOR: undefined, CI: 'false', ...extraEnv }, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
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
    /** PHASE-19: passa pela tela "Onde vamos trabalhar?" (Enter = esta pasta); insiste até o raw mode pegar */
    async pastStart() {
      await this.waitFor((s) => s.includes('Onde vamos trabalhar?'), 20_000);
      for (let i = 0; i < 8 && !/você|> █|\? ajuda/.test(raw.replace(ANSI, '').split('Onde vamos trabalhar?').at(-1)); i++) {
        child.stdin.write('\r');
        await new Promise((r) => setTimeout(r, 400));
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
    useSimulatedMain(p.dir); // sem isso o assistente de primeiro uso abre antes do chat
    // planos em paralelo precisam de Git (worktrees): a pasta do teste é um repositório com um commit
    for (const a of [['init', '-q', '-b', 'main'], ['config', 'user.name', 'E2E'], ['config', 'user.email', 'e2e@example.invalid'], ['config', 'commit.gpgsign', 'false'], ['add', '-A'], ['commit', '-q', '-m', 'base']]) spawnSync('git', a, { cwd: p.dir });
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
    await t.pastStart();
    await t.waitFor((s) => (s.includes('Eureka42') || s.includes('eureka42.org')) && s.includes('? ajuda'));
    expect(t.raw()).toMatch(/\u001b\[38;2;34;197;94m/); // verde truecolor no TTY (padrão desde a 1.1.0)
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
    await t.pastStart();
    await t.waitFor((s) => (s.includes('Eureka42') || s.includes('eureka42.org')) && s.includes('? ajuda'));
    expect(t.raw()).not.toMatch(/\u001b\[(3[0-9]|9[0-7]|38;)/);
    // um Ctrl+C por vez: enviados juntos chegam num único bloco (\x03\x03) em runners lentos e não são Ctrl+C
    // O Ink liga o raw mode num effect depois do 1º desenho; um Ctrl+C antes disso vira SIGINT do tty (eco "^C") e inicia o
    // encerramento (runs 45217682603, 45252718578). Sinal de raw mode ativo: "?" com prompt vazio abre a ajuda, coisa que
    // em modo cooked não acontece (o terminal só ecoaria o "?").
    for (let i = 0; ; i++) {
      await t.keys('?');
      try {
        await t.waitFor((s) => s.includes('esta ajuda'), 1500);
        break;
      } catch (e) {
        if (i >= 5) throw e;
      }
    }
    await t.keys('\u001b'); // Esc: fecha a ajuda se aberta ("?" a mais poderia reabrir)
    await new Promise((r) => setTimeout(r, 300)); // Esc colado no \x03 seguinte vira Alt+Ctrl+C para o Ink
    await t.keys('\u0003');
    await t.waitFor((s) => s.includes('Ctrl+C de novo em 2 s'));
    await t.keys('\u0003');
    await t.waitFor((s) => s.includes('engine encerrado'));
    t.end();
    expect(await t.exited).toBe(0);
  }, 40_000);

  it('chat in a real TTY: banner, / menu, a request becomes a plan and Enter runs it (PHASE-18)', async () => {
    const t = pty(BIN.ases, [], p.dir, { AER_SIMULATORS: '3' });
    procs.push(t);
    await t.pastStart();
    await t.waitFor((s) => s.includes('eureka42.org') && s.includes('? ajuda'), 20_000);
    for (let i = 0; ; i++) {
      // raw mode só depois do 1º desenho (ver o teste de NO_COLOR): insiste no "/" até o menu abrir
      await t.keys('/');
      try {
        await t.waitFor((s) => s.includes('o que dá para fazer'), 1500);
        break;
      } catch (e) {
        if (i >= 5) throw e;
        await t.keys('\u007f');
      }
    }
    await t.keys('\u007f'.repeat(8));
    await t.keys('divida em tarefas o cadastro\r');
    await t.waitFor((s) => /Plano PLN-\d{4} \(3 tarefas\)/.test(s), 30_000);
    await t.keys('\r');
    await t.waitFor((s) => s.includes('resumo — 3 tarefas'), 120_000);
    await t.keys('/sair\r');
    t.end();
    expect(await t.exited).toBe(0);
  }, 180_000);
});
