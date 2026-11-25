import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BIN, isolatedConfigEnv, requireBuild, runSync, start, tempProject, useSimulatedMain } from './helpers.mjs';

// TAR-0070 (AER-REQ-234): TUIs num ConPTY real do Windows via node-pty. O node-pty NÃO é dependência do projeto:
// o CI do Windows instala só para este teste (`npm install --no-save node-pty@1.1.0`) e liga AER_REQUIRE_CONPTY=1,
// para que a falta do harness falhe em vez de virar skip silencioso.
const require = createRequire(import.meta.url);
let pty = null;
if (process.platform === 'win32') {
  try {
    pty = require('node-pty');
  } catch (e) {
    if (process.env.AER_REQUIRE_CONPTY === '1') throw new Error(`AER_REQUIRE_CONPTY=1 mas node-pty não carregou: ${e.message}`);
  }
}
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]|\u001b\][^\u0007]*\u0007|\u001b[()][A-Z0-9]|\r/g;

function conpty(bin, args, cwd, extraEnv = {}, cols = 80) {
  const env = { ...process.env, ...isolatedConfigEnv, TERM: 'xterm-256color', CI: 'false', ...extraEnv };
  if (!('NO_COLOR' in extraEnv)) delete env.NO_COLOR;
  const term = pty.spawn(process.execPath, [bin, ...args], { name: 'xterm-256color', cols, rows: 30, cwd, env, useConpty: true });
  let raw = '';
  term.onData((d) => (raw += d));
  const exited = new Promise((resolve) => term.onExit(({ exitCode }) => resolve(exitCode)));
  let alive = true;
  exited.then(() => (alive = false));
  return {
    term, exited, alive: () => alive,
    raw: () => raw,
    text: () => raw.replace(ANSI, ''),
    keys: async (s) => {
      for (const ch of s) {
        term.write(ch);
        await new Promise((r) => setTimeout(r, 20));
      }
    },
    /** PHASE-19: passa pela tela "Onde vamos trabalhar?" (Enter = esta pasta); insiste até o raw mode pegar */
    async pastStart() {
      await this.waitFor((s) => s.includes('Onde vamos trabalhar?'), 30_000);
      for (let i = 0; i < 8 && !/\? ajuda/.test(raw.replace(ANSI, '').split('Onde vamos trabalhar?').at(-1)); i++) {
        term.write('\r');
        await new Promise((r) => setTimeout(r, 500));
      }
    },
    async waitFor(test, ms = 15_000) {
      const t0 = Date.now();
      while (!test(raw.replace(ANSI, ''))) {
        if (Date.now() - t0 > ms) throw new Error(`conpty timeout; output:\n${raw.replace(ANSI, '').slice(-2000)}`);
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    /**
     * PHASE-20: depois da tela da pasta o Ink liga o raw mode só após o 1º desenho do chat; teclas antes disso ficam no
     * buffer e caem no prompt depois. Sonda com "x" até ela aparecer NO prompt e apaga, então a tela já está interativa.
     */
    async waitInteractive() {
      for (let i = 0; i < 30; i++) {
        term.write('x');
        await new Promise((r) => setTimeout(r, 500));
        const m = /> (x+)█/.exec(raw.replace(ANSI, '').split('LIVE').at(-1));
        if (m) {
          term.write('\u007f'.repeat(m[1].length + 3));
          await new Promise((r) => setTimeout(r, 300));
          return;
        }
      }
      throw new Error(`a tela do chat não ficou interativa; output:\n${raw.replace(ANSI, '').slice(-1500)}`);
    },
    /** o Ink liga o raw mode depois do 1º desenho: insiste no "?" até a ajuda abrir (mesmo motivo do pty.test) */
    async openHelp() {
      await this.waitInteractive();
      for (let i = 0; ; i++) {
        await this.keys('?');
        try {
          await this.waitFor((s) => s.includes('esta ajuda'), 2000);
          return;
        } catch (e) {
          if (i >= 5) throw e;
        }
      }
    },
  };
}

describe.runIf(pty)('TUIs in a real Windows ConPTY (TAR-0070)', () => {
  requireBuild();
  const p = tempProject('conpty tui ç');
  const procs = [];
  beforeAll(() => {
    expect(runSync(BIN.ases, ['init', '--name', 'conpty'], p.dir, {}, 60_000).status).toBe(0);
    useSimulatedMain(p.dir); // sem isso o assistente de primeiro uso abre antes do chat
  });
  afterEach(async () => {
    for (const x of procs.splice(0)) {
      if (x.term) {
        if (x.alive()) {
          x.term.kill();
          await x.exited;
        }
      } else if (x.child.exitCode === null) {
        x.child.kill('SIGKILL');
        await x.exited;
      }
    }
  });
  afterAll(() => p.cleanup(), 30_000);

  it('ases: logo, help with ? and Esc, a typed command, resize to 40 columns, Ctrl+C twice exits 0', async () => {
    const t = conpty(BIN.ases, [], p.dir, { WT_SESSION: 'aer-e2e' }); // como o Windows Terminal se anuncia
    procs.push(t);
    await t.pastStart();
    await t.waitFor((s) => (s.includes('Eureka42') || s.includes('eureka42.org')) && s.includes('? ajuda'), 30_000);
    expect(t.raw()).toMatch(/\u001b\[38;2;34;197;94m/); // verde truecolor no Windows Terminal
    expect(t.text()).toContain('⌘'); // logo Unicode, não o fallback E42
    await t.openHelp();
    await t.keys('\u001b');
    await new Promise((r) => setTimeout(r, 300));
    await t.keys('/phase new Pela ConPTY\r');
    await t.waitFor((s) => s.includes('criada PHASE-01'));
    const before = t.raw().length;
    t.term.resize(40, 30);
    await t.waitFor(() => t.raw().length > before); // redesenha no novo tamanho
    expect(t.alive()).toBe(true);
    await t.keys('\u0003');
    await t.waitFor((s) => s.includes('Ctrl+C de novo em 2 s'));
    await t.keys('\u0003');
    await t.waitFor((s) => s.includes('engine encerrado'));
    expect(await t.exited).toBe(0);
  }, 90_000);

  it('ases-tar: LIVE, shows a task created by ases, q quits 0', async () => {
    const ases = start(BIN.ases, ['--no-tui'], p.dir);
    procs.push(ases);
    await ases.waitFor('stdout', 'engine ready');
    const t = conpty(BIN.tar, [], p.dir);
    procs.push(t);
    await t.waitFor((s) => s.includes('LIVE') && s.includes('Fases e tarefas'), 30_000);
    ases.send('/task new PHASE-01 Vista no ConPTY');
    await t.waitFor((s) => s.includes('TAR-0001 PLANNED'));
    await t.keys('q');
    expect(await t.exited).toBe(0);
    ases.send('/exit');
    expect((await ases.exited).code).toBe(0);
  }, 90_000);

  it('NO_COLOR in ConPTY: no color codes, text complete', async () => {
    const t = conpty(BIN.ases, [], p.dir, { NO_COLOR: '1' });
    procs.push(t);
    await t.pastStart();
    await t.waitFor((s) => (s.includes('Eureka42') || s.includes('eureka42.org')) && s.includes('? ajuda'), 30_000);
    await t.openHelp();
    // mostra os códigos achados (e o trecho em volta) se falhar
    expect([...t.raw().matchAll(/.{0,40}\u001b\[(?:3[0-9]|9[0-7]|38;)[0-9;]*m.{0,20}/gs)].map((m) => JSON.stringify(m[0]))).toEqual([]);
    await t.keys('\u001b');
    await new Promise((r) => setTimeout(r, 300));
    await t.keys('\u0003');
    await t.waitFor((s) => s.includes('Ctrl+C de novo em 2 s'));
    await t.keys('\u0003');
    await t.waitFor((s) => s.includes('engine encerrado'));
    expect(await t.exited).toBe(0);
  }, 90_000);

  it('chat in ConPTY: banner, a request becomes a plan and Enter runs it (PHASE-18)', async () => {
    const t = conpty(BIN.ases, [], p.dir, { WT_SESSION: 'aer-e2e', AER_SIMULATORS: '3' }, 100);
    procs.push(t);
    await t.pastStart();
    await t.waitFor((s) => s.includes('eureka42.org') && s.includes('? ajuda'), 30_000);
    // runner arm64 lento: o "?" chegava antes do raw mode e ia para o prompt (run 45518480429). Uma mensagem com Enter
    // funciona nos dois modos (em cooked mode ela chega inteira quando o raw liga), então basta esperar a tela assentar
    await new Promise((r) => setTimeout(r, 2000));
    await t.keys('divida em tarefas o cadastro\r');
    await t.waitFor((s) => /Plano PLN-\d{4} \(3 tarefas\)/.test(s), 60_000);
    await t.keys('\r');
    await t.waitFor((s) => s.includes('resumo — 3 tarefas'), 180_000);
    await t.keys('/sair\r');
    expect(await t.exited).toBe(0);
  }, 240_000);
});
