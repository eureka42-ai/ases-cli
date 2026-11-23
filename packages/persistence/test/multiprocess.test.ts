import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exportHistory, verifyHistory } from '../src/index.ts';
import { openStore, tempDir } from './helpers.ts';

const worker = fileURLToPath(new URL('./fixtures/worker.ts', import.meta.url));
const dir = tempDir();

function run(db: string, ...args: string[]): Promise<{ code: number | null; out: string; pid: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--conditions=source', '--no-warnings', worker, db, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code !== 0 && code !== 42 ? reject(new Error(`worker exit ${code}: ${err}`)) : resolve({ code, out: out.trim(), pid: child.pid! })));
  });
}

describe('multi-process transactions (TAR-0010, AER-REQ-191)', () => {
  it('8 concurrent processes append 400 events with contiguous seq and no loss (AER-REQ-062)', async () => {
    const db = path.join(dir, 'append.sqlite');
    const results = await Promise.all(Array.from({ length: 8 }, () => run(db, 'append', '50')));
    expect(new Set(results.map((r) => r.pid)).size).toBe(8);
    expect(results.every((r) => r.out === 'DONE')).toBe(true);
    const store = openStore(db);
    const mirror = path.join(dir, 'append.jsonl');
    const { events } = exportHistory(store, mirror);
    expect(events).toBe(401); // 1 ProjectInitialized (vence quem abriu primeiro) + 400
    expect(verifyHistory(mirror).problems).toEqual([]);
    store.close();
  }, 60_000);

  it('a transition race between 10 processes has exactly one winner (AER-REQ-045)', async () => {
    const db = path.join(dir, 'race.sqlite');
    const store = openStore(db);
    const task = store.createTask({ phaseId: store.createPhase('f'), title: 'disputada' });
    store.close();
    const results = await Promise.all(Array.from({ length: 10 }, () => run(db, 'race', task, '1')));
    const outcomes = results.map((r) => r.out).sort();
    expect(outcomes.filter((o) => o === 'WON')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'VERSION_CONFLICT')).toHaveLength(9);
    const after = openStore(db);
    expect(after.getTask(task)).toMatchObject({ state: 'READY', version: 2 });
    expect(after.eventsSince(0).filter((e) => e.eventType === 'TaskUpdated')).toHaveLength(1);
    after.close();
  }, 60_000);

  it('process death before COMMIT leaves neither state nor event (AER-REQ-063)', async () => {
    const db = path.join(dir, 'crash.sqlite');
    openStore(db).close();
    const r = await run(db, 'crash');
    expect(r).toMatchObject({ code: 42, out: 'IN_TX' });
    const store = openStore(db);
    expect(store.listPhases()).toEqual([]);
    expect(store.eventsSince(0).map((e) => e.eventType)).toEqual(['ProjectInitialized']);
    expect(store.createPhase('depois do crash')).toBe('PHASE-01'); // contador não foi consumido
    store.close();
  }, 60_000);
});
