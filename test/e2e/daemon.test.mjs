import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { BIN, requireBuild, runSync, tempProject } from './helpers.mjs';

requireBuild();
const p = tempProject('e2e daemon ç');
const env = { ...process.env, NO_COLOR: '1' };
afterAll(() => {
  runSync(BIN.ases, ['daemon', 'stop'], p.dir); // nunca deixa motor órfão, mesmo se o teste falhar
  p.cleanup();
});
const client = (lines) => {
  const r = spawnSync(process.execPath, [BIN.ases, '--no-tui'], { cwd: p.dir, encoding: 'utf8', input: [...lines, '/exit', ''].join('\n'), timeout: 60_000, env });
  expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
  return r.stdout;
};
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};
const until = async (fn, ms = 15_000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 200));
  }
};

describe('PHASE-12 gate: resident engine keeps tasks when the client/TUI closes (TAR-0060)', () => {
  it('start → client runs a long task and exits → task still RUNNING → stop cancels it with the process tree', async () => {
    const git = (...a) => spawnSync('git', a, { cwd: p.dir, encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    for (const [k, v] of [['user.name', 'AER E2E'], ['user.email', 'e2e@example.invalid'], ['commit.gpgsign', 'false']]) git('config', k, v);
    expect(runSync(BIN.ases, ['init', '--name', 'dmn'], p.dir).status).toBe(0);
    git('add', '-A');
    git('commit', '-q', '-m', 'base');

    let r = runSync(BIN.ases, ['daemon', 'start'], p.dir);
    expect(r.stdout).toMatch(/motor residente iniciado \(pid \d+\)/);
    expect(runSync(BIN.ases, ['daemon', 'start'], p.dir).stdout).toMatch(/já em execução/); // idempotente
    const st = JSON.parse(runSync(BIN.ases, ['daemon', 'status', '--json'], p.dir).stdout);
    expect(st).toMatchObject({ running: true, status: 'OK', supervisor: 'NONE' });

    let out = client(['/phase new P', '/task new PHASE-01 longa --provider simulator:hang', '/task move TAR-0001 READY', '/run --timeout 40']);
    expect(out).toMatch(/conectado ao motor residente/);
    expect(out).toMatch(/executando no motor residente/);
    expect(out).toMatch(/cliente desligado; o motor residente continua/);

    // o cliente saiu; a tarefa segue no motor
    await until(() => /TAR-0001\s+PHASE-01\s+RUNNING/.test(client(['/tasks'])));
    out = client(['/task TAR-0001']);
    const grandchild = Number(/CHILD_SPAWNED (\d+)/.exec(out)?.[1]);
    expect(grandchild).toBeGreaterThan(0); // o cenário hang cria um neto de propósito
    expect(alive(grandchild)).toBe(true);

    r = runSync(BIN.ases, ['daemon', 'stop'], p.dir, {}, 40_000);
    expect(r.stdout).toMatch(/motor residente encerrado \(pid (\d+)\)/);
    expect(alive(st.pid)).toBe(false);
    await until(() => !alive(grandchild), 10_000); // nada órfão (AER-REQ-231)
    expect(JSON.parse(runSync(BIN.ases, ['daemon', 'status', '--json'], p.dir).stdout)).toEqual({ running: false });

    // sem motor residente, o `ases` volta a subir o próprio engine e o histórico está lá
    out = client(['/tasks']);
    expect(out).toMatch(/engine ready/);
    expect(out).toMatch(/TAR-0001\s+PHASE-01\s+CANCELLED/);
  }, 120_000);
});
