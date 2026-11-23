import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { ProjectStore } from '@aer/persistence';
import { tick } from '../src/index.ts';

const worker = fileURLToPath(new URL('./fixtures/worker.ts', import.meta.url));
const dir = mkdtempSync(path.join(os.tmpdir(), 'aer sched mp '));
const opened: ProjectStore[] = [];
afterAll(() => {
  opened.forEach((s) => s.close());
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});
const P = { id: 'prj_race000001', name: 'race' };
const open = (f: string) => {
  const s = ProjectStore.open(f, P);
  opened.push(s);
  return s;
};

function run(db: string, ...args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, ['--conditions=source', '--no-warnings', worker, db, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    c.stdout.on('data', (d: Buffer) => (out += d));
    c.stderr.on('data', (d: Buffer) => (err += d));
    c.on('error', reject);
    c.on('close', (code) => (code === 0 || code === 9 ? resolve({ code, out: out.trim() }) : reject(new Error(`exit ${code}: ${err}`))));
  });
}

describe('scheduler across real processes (TAR-0025, AER-REQ-045/043)', () => {
  it('20 concurrent schedulers: each task reserved exactly once and never more than the limit', async () => {
    const db = path.join(dir, 'race.sqlite');
    const s = open(db);
    const p = s.createPhase('corrida');
    for (let i = 0; i < 6; i++) {
      const t = s.createTask({ phaseId: p, title: `t${i}` });
      s.transitionTask(t, 'READY', 1);
    }
    const results = await Promise.all(Array.from({ length: 20 }, () => run(db, 'tick', '3')));
    const won = results.flatMap((r) => JSON.parse(r.out) as string[]);
    expect(won).toHaveLength(3); // limite global respeitado entre processos
    expect(new Set(won).size).toBe(3); // nenhuma tarefa reservada duas vezes
    expect(s.activeLeases()).toHaveLength(3);
    expect(s.eventsSince(0, 1000).filter((e) => e.eventType === 'TaskReserved')).toHaveLength(3);
  }, 60_000);

  it('a scheduler that dies holding a lease: after expiry the task is BLOCKED, attempt UNKNOWN, nothing restarts by itself', async () => {
    const db = path.join(dir, 'crash.sqlite');
    const s = open(db);
    const t = s.createTask({ phaseId: s.createPhase('crash'), title: 'vai morrer' });
    s.transitionTask(t, 'READY', 1);
    const r = await run(db, 'reserve-and-die', '300');
    expect(r).toEqual({ code: 9, out: t });
    expect(tick(s, { ownerId: 'sobrevivente', ttlMs: 60_000, maxParallel: 1 }).reserved).toEqual([]); // lease ainda vivo
    await new Promise((res) => setTimeout(res, 400));
    const after = tick(s, { ownerId: 'sobrevivente', ttlMs: 60_000, maxParallel: 1 });
    expect(after.expired).toEqual([{ taskId: t, to: 'BLOCKED' }]);
    expect(after.reserved).toEqual([]); // BLOCKED exige reconciliação humana, não retry cego
    expect(s.listAttempts(t)[0]).toMatchObject({ state: 'UNKNOWN' });
    const blocked = s.eventsSince(0).filter((e) => e.taskId === t && e.eventType === 'TaskUpdated').at(-1);
    expect(blocked?.payload).toEqual({ from: 'RUNNING', to: 'BLOCKED', reason: 'LEASE_EXPIRED' });
  }, 60_000);
});
