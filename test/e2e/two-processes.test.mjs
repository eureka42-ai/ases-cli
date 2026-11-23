import { afterAll, describe, expect, it } from 'vitest';
import { BIN, jsonl, requireBuild, runSync, start, tempProject } from './helpers.mjs';

requireBuild();
const p = tempProject('e2e dois terminais');
const procs = [];
afterAll(async () => {
  // espera os processos saírem antes de apagar (Windows: EBUSY no diretório em uso)
  await Promise.all(procs.map((x) => (x.child.exitCode === null ? (x.child.kill('SIGKILL'), x.exited) : undefined)));
  p.cleanup();
});
const launch = (bin, args) => {
  const x = start(bin, args, p.dir);
  procs.push(x);
  return x;
};
const seqs = (x) => jsonl(x.out.stdout).map((e) => e.seq);

describe('ases + ases-tar in separate real processes (TAR-0015, C02, AER-REQ-091, AER-REQ-191)', () => {
  it('an event created in ases shows up in ases-tar; restart resumes without gaps or duplicates', async () => {
    expect(runSync(BIN.ases, ['init', '--name', 'e2e'], p.dir).status).toBe(0);

    let ases = launch(BIN.ases, []);
    await ases.waitFor('stdout', 'engine ready');
    const tar = launch(BIN.tar, ['--follow', '--format', 'jsonl']);
    const tarTask = launch(BIN.tar, ['--follow', '--format', 'jsonl', '--task', 'TAR-0002']);
    const tarText = launch(BIN.tar, []);
    await tar.waitFor('stderr', 'status: LIVE');
    await tarTask.waitFor('stderr', 'status: LIVE');
    await tarText.waitFor('stdout', '[LIVE]');

    ases.send('/phase new Fase E2E');
    ases.send('/task new PHASE-01 Primeira');
    ases.send('/task new PHASE-01 Segunda');
    ases.send('/task move TAR-0001 READY aprovada');
    await tar.waitFor('stdout', (s) => jsonl(s).length === 5);

    expect(new Set([process.pid, ases.child.pid, tar.child.pid]).size).toBe(3);
    const events = jsonl(tar.out.stdout);
    expect(events.map((e) => [e.seq, e.eventType, e.taskId])).toEqual([
      [1, 'ProjectInitialized', null], [2, 'PhaseCreated', null], [3, 'TaskCreated', 'TAR-0001'],
      [4, 'TaskCreated', 'TAR-0002'], [5, 'TaskUpdated', 'TAR-0001'],
    ]);
    expect(events[4].payload).toEqual({ from: 'PLANNED', to: 'READY', reason: 'aprovada' });
    expect(tar.out.stdout).not.toMatch(/\u001b/); // stdout só JSONL (AER-REQ-247)

    // modo texto padrão: legível, sem ANSI fora de TTY (AER-REQ-089)
    await tarText.waitFor('stdout', 'TaskUpdated');
    expect(tarText.out.stdout).toMatch(/#0002 \d\d:\d\d:\d\d PhaseCreated\s+PHASE-01 "Fase E2E"/);
    expect(tarText.out.stdout).toMatch(/#0005 .*TaskUpdated\s+TAR-0001 PLANNED (→|->) READY \(aprovada\)/);
    expect(tarText.out.stdout).not.toMatch(/\u001b/);

    // filtro --task (AER-REQ-094)
    await tarTask.waitFor('stdout', (s) => jsonl(s).length >= 1);
    expect(jsonl(tarTask.out.stdout).map((e) => e.taskId)).toEqual(['TAR-0002']);

    // um segundo ases no mesmo projeto não vira segundo escritor (§3.4)
    const dup = runSync(BIN.ases, [], p.dir);
    expect(dup.status).toBe(1);
    expect(dup.stderr).toMatch(/ENGINE_ALREADY_RUNNING/);

    // crash do engine: monitor sai de LIVE (AER-REQ-076, AER-REQ-099)
    ases.child.kill('SIGKILL');
    await ases.exited;
    await tar.waitFor('stderr', (s) => /status: (RECONNECTING|OFFLINE)/.test(s));

    // reinício: socket órfão substituído, monitor reconecta e recebe só o que é novo
    ases = launch(BIN.ases, []);
    await ases.waitFor('stdout', 'engine ready');
    await tar.waitFor('stderr', (s) => s.lastIndexOf('status: LIVE') > s.search(/status: (RECONNECTING|OFFLINE)/));
    ases.send('/task move TAR-0001 RESERVED');
    await tar.waitFor('stdout', (s) => jsonl(s).length === 6);
    expect(seqs(tar)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(jsonl(tar.out.stdout)[5].payload).toMatchObject({ from: 'READY', to: 'RESERVED' });

    // saída limpa informa o destino do engine (AER-REQ-090)
    ases.send('/exit');
    expect(await ases.exited).toEqual({ code: 0, signal: null });
    expect(ases.out.stdout).toMatch(/encerrando engine.*estado salvo até seq 6/);
  }, 60_000);

  it('the monitor cannot mutate: the engine rejects it (C20)', async () => {
    // garantido no servidor (packages/ipc/test/ipc.test.ts); aqui: o bin não expõe nenhum comando mutante
    expect(runSync(BIN.tar, ['--help'], p.dir).stdout).toMatch(/nunca altera estado/);
  });
});
