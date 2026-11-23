import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { BIN, jsonl, requireBuild, runSync, start, tempProject } from './helpers.mjs';

requireBuild();
const p = tempProject('e2e run sim');
const procs = [];
afterAll(async () => {
  await Promise.all(procs.map((x) => (x.child.exitCode === null ? (x.child.kill('SIGKILL'), x.exited) : undefined)));
  p.cleanup();
});
const launch = (bin, args) => {
  const x = start(bin, args, p.dir);
  procs.push(x);
  return x;
};
const git = (...args) => spawnSync('git', args, { cwd: p.dir, encoding: 'utf8' });

describe('PHASE-06 gate: /run with the simulator, watched live by ases-tar (TAR-0031)', () => {
  it('runs two SIMULATED tasks in parallel, honours a dependency, cancels a hung one and exits cleanly', async () => {
    git('init', '-q', '-b', 'main');
    for (const [k, v] of [['user.name', 'AER E2E'], ['user.email', 'e2e@example.invalid'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) git('config', k, v);
    expect(runSync(BIN.ases, ['init', '--name', 'run'], p.dir).status).toBe(0);
    git('add', '-A');
    expect(git('commit', '-q', '-m', 'base').status).toBe(0);

    const ases = launch(BIN.ases, []);
    await ases.waitFor('stdout', 'engine ready');
    const tar = launch(BIN.tar, ['--follow', '--format', 'jsonl']);
    await tar.waitFor('stderr', 'status: LIVE');

    for (const l of [
      '/phase new Run', '/task new PHASE-01 A --provider simulator --reqs AER-REQ-101', '/task new PHASE-01 B --provider simulator',
      '/task new PHASE-01 C --provider simulator', '/dep add TAR-0003 TAR-0001',
      '/task move TAR-0001 READY', '/task move TAR-0002 READY', '/task move TAR-0003 READY', '/run PHASE-01 --parallel 2',
    ]) ases.send(l);
    await ases.waitFor('stdout', 'run concluído', 20_000);
    expect(ases.out.stdout).toMatch(/TAR-0001 ATT-0001 simulator \[SIMULATED\] (→|->) REVIEW/);
    expect(ases.out.stdout).toMatch(/TAR-0002 ATT-0001 simulator \[SIMULATED\] (→|->) REVIEW/);
    expect(ases.out.stdout).toMatch(/TAR-0003 espera: aguarda TAR-0001\(REVIEW\)/);

    // o monitor (processo separado, somente leitura) viu a execução, marcada SIMULATED
    await tar.waitFor('stdout', (s) => jsonl(s).filter((e) => e.eventType === 'AttemptExited').length === 2);
    const ev = jsonl(tar.out.stdout);
    const chunks = ev.filter((e) => e.eventType === 'ProviderOutputChunk');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((e) => e.payload.simulated === true)).toBe(true);
    expect(ev.filter((e) => e.eventType === 'GitCheckpointCreated').map((e) => e.taskId).sort()).toEqual(['TAR-0001', 'TAR-0002']);
    expect(git('branch', '--list', 'ases/*').stdout).toMatch(/ases\/TAR-0001\/ATT-0001[\s\S]*ases\/TAR-0002\/ATT-0001/);
    // checkout principal: só os relatórios do engine em .ases/ mudam; a saída do agente fica na branch da tentativa
    expect(git('status', '--porcelain').stdout.split('\n').filter((l) => l && !l.slice(3).startsWith('.ases/'))).toEqual([]);

    // /cancel de uma tarefa pendurada (todos os SOs): o modo linha segue respondendo durante o /run
    ases.send('/task new PHASE-01 D --provider simulator:hang');
    ases.send('/task move TAR-0004 READY');
    ases.send('/run PHASE-01');
    await tar.waitFor('stdout', (s) => jsonl(s).some((e) => e.eventType === 'TaskStarted' && e.taskId === 'TAR-0004'));
    ases.send('/cancel TAR-0004');
    await ases.waitFor('stdout', (s) => /TAR-0004 ATT-0001 simulator \[SIMULATED\] (→|->) CANCELLED/.test(s), 15_000);
    await tar.waitFor('stdout', (s) => jsonl(s).some((e) => e.eventType === 'TaskUpdated' && e.taskId === 'TAR-0004' && e.payload.to === 'CANCELLED'));

    if (process.platform === 'win32') {
      // o Windows não entrega SIGINT a um processo filho (kill = encerramento forçado); sai por /exit
      ases.send('/exit');
      expect(await ases.exited).toEqual({ code: 0, signal: null });
      return;
    }
    // Ctrl+C/SIGINT com tarefa rodando: cancela, reconcilia e informa
    ases.send('/task new PHASE-01 E --provider simulator:hang');
    ases.send('/task move TAR-0005 READY');
    ases.send('/run PHASE-01');
    await tar.waitFor('stdout', (s) => jsonl(s).some((e) => e.eventType === 'TaskStarted' && e.taskId === 'TAR-0005'));
    ases.child.kill('SIGINT');
    expect(await ases.exited).toEqual({ code: 0, signal: null });
    expect(ases.out.stdout).toMatch(/1 tarefa\(s\) em execução cancelada\(s\), árvore de processos encerrada/);
    await tar.waitFor('stdout', (s) => jsonl(s).some((e) => e.eventType === 'TaskUpdated' && e.taskId === 'TAR-0005' && e.payload.to === 'CANCELLED'));
  }, 60_000);
});
