import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectStore, type StoreError } from '../src/index.ts';
import { PROJECT, tempDir } from './helpers.ts';

const dir = tempDir();
let clock = Date.parse('2026-11-22T12:00:00.000Z');
const now = () => new Date(clock).toISOString();
const advance = (ms: number) => (clock += ms);
let n = 0;
const fresh = () => ProjectStore.open(path.join(dir, `s${++n}.sqlite`), PROJECT, { actor: 'test', now });
const code = (c: string) => expect.objectContaining({ code: c }) as StoreError;
const ready = (s: ProjectStore, id: string) => s.transitionTask(id, 'READY', s.getTask(id)!.version);
const R = { ownerId: 'sched-A', ttlMs: 30_000, explanation: 'teste' };

describe('DAG (TAR-0021, AER-REQ-041/042)', () => {
  it('rejects a cycle with the explaining path and keeps acyclic edges', () => {
    const s = fresh();
    const p = s.createPhase('f');
    const [a, b, c] = ['A', 'B', 'C'].map((t) => s.createTask({ phaseId: p, title: t }));
    s.addDependency(b!, a!); // B depende de A
    s.addDependency(c!, b!); // C depende de B
    expect(() => s.addDependency(a!, c!)).toThrow(/cycle: TAR-0001 -> TAR-0003 -> TAR-0002 -> TAR-0001/);
    expect(() => s.addDependency(a!, a!)).toThrow(code('DEPENDENCY_CYCLE'));
    expect(s.getTask(c!)!.dependsOn).toEqual([b]);
    expect(s.eventsSince(0).filter((e) => e.eventType === 'TaskDependencyAdded')).toHaveLength(2);
    s.close();
  });

  it('a dependent cannot be reserved before its dependency is COMPLETED', () => {
    const s = fresh();
    const p = s.createPhase('f');
    const a = s.createTask({ phaseId: p, title: 'A' });
    const b = s.createTask({ phaseId: p, title: 'B', dependsOn: [a] });
    ready(s, a);
    ready(s, b);
    expect(() => s.reserveTask(b, R)).toThrow(/waits for TAR-0001\(READY\)/);
    s.close();
  });
});

describe('leases and fencing (TAR-0022, AER-REQ-043..047)', () => {
  it('reserves once; the second reservation and stale tokens are rejected', () => {
    const s = fresh();
    const t = s.createTask({ phaseId: s.createPhase('f'), title: 'x' });
    expect(() => s.reserveTask(t, R)).toThrow(code('NOT_READY'));
    ready(s, t);
    const { fencingToken } = s.reserveTask(t, R);
    expect(fencingToken).toBe(1);
    expect(() => s.reserveTask(t, { ...R, ownerId: 'sched-B' })).toThrow(code('NOT_READY')); // já RESERVED
    expect(s.eventsSince(0).at(-1)).toMatchObject({ eventType: 'TaskReserved', payload: { ownerId: 'sched-A', fencingToken: 1, explanation: 'teste' } });
    expect(() => s.transitionTaskFenced(t, 'RUNNING', 99)).toThrow(code('STALE_LEASE'));
    s.transitionTaskFenced(t, 'RUNNING', fencingToken);
    expect(s.heartbeat(t, fencingToken, 60_000)).toBe(new Date(clock + 60_000).toISOString());
    s.close();
  });

  it('expired RESERVED goes back to READY; expired RUNNING becomes BLOCKED with attempt UNKNOWN; old owner cannot finish', () => {
    const s = fresh();
    const p = s.createPhase('f');
    const a = s.createTask({ phaseId: p, title: 'só reservada' });
    const b = s.createTask({ phaseId: p, title: 'em execução' });
    ready(s, a);
    ready(s, b);
    s.reserveTask(a, { ...R, ttlMs: 1000 });
    const lb = s.reserveTask(b, { ...R, ttlMs: 1000 });
    s.transitionTaskFenced(b, 'RUNNING', lb.fencingToken);
    const att = s.startAttempt(b, lb.fencingToken, { providerId: 'simulator', branch: 'ases/TAR-0002/ATT-0001', baseCommit: 'abc' });
    expect(att).toBe('ATT-0001');
    advance(1500);
    expect(s.expireLeases()).toEqual([{ taskId: a, to: 'READY' }, { taskId: b, to: 'BLOCKED' }]);
    expect(s.listAttempts(b)[0]).toMatchObject({ state: 'UNKNOWN' });
    expect(() => s.transitionTaskFenced(b, 'VERIFYING', lb.fencingToken)).toThrow(code('STALE_LEASE')); // conclusão tardia recusada
    const again = s.reserveTask(a, R);
    expect(again.fencingToken).toBe(2); // fencing monotônico por tarefa
    s.close();
  });

  it('enforces global capacity, per-provider limits and shared resources inside the transaction', () => {
    const s = fresh();
    const p = s.createPhase('f');
    const ids = [
      s.createTask({ phaseId: p, title: '1', provider: 'claude', resources: ['db-schema'] }),
      s.createTask({ phaseId: p, title: '2', provider: 'claude' }),
      s.createTask({ phaseId: p, title: '3', provider: 'codex', resources: ['db-schema'] }),
      s.createTask({ phaseId: p, title: '4', provider: 'codex' }),
    ];
    ids.forEach((id) => ready(s, id));
    s.reserveTask(ids[0]!, { ...R, maxActive: 2, maxPerProvider: { claude: 1 } });
    expect(() => s.reserveTask(ids[1]!, { ...R, maxActive: 2, maxPerProvider: { claude: 1 } })).toThrow(/provider claude/);
    expect(() => s.reserveTask(ids[2]!, { ...R, maxActive: 2 })).toThrow(/resource db-schema is held by TAR-0001/);
    s.reserveTask(ids[3]!, { ...R, maxActive: 2 });
    expect(() => s.reserveTask(ids[1]!, { ...R, maxActive: 2 })).toThrow(code('CAPACITY'));
    expect(s.activeLeases().map((l) => l.taskId)).toEqual([ids[0], ids[3]]);
    s.close();
  });

  it('leaving RESERVED/RUNNING/VERIFYING releases the lease', () => {
    const s = fresh();
    const t = s.createTask({ phaseId: s.createPhase('f'), title: 'x' });
    ready(s, t);
    const l = s.reserveTask(t, R);
    s.transitionTaskFenced(t, 'RUNNING', l.fencingToken);
    s.transitionTaskFenced(t, 'FAILED', l.fencingToken, 'exit 1');
    expect(s.activeLeases()).toEqual([]);
    s.close();
  });
});

describe('locks (merge queue)', () => {
  it('one owner at a time until release or expiry', () => {
    const s = fresh();
    expect(s.acquireLock('merge:main', 'A', 10_000)).toBe(true);
    expect(s.acquireLock('merge:main', 'B', 10_000)).toBe(false);
    s.releaseLock('merge:main', 'A');
    expect(s.acquireLock('merge:main', 'B', 10_000)).toBe(true);
    advance(11_000);
    expect(s.acquireLock('merge:main', 'C', 10_000)).toBe(true);
    s.close();
  });
});

describe('evidence gate (TAR-0026, AER-REQ-158/186/189)', () => {
  function toMerging(s: ProjectStore) {
    const t = s.createTask({ phaseId: s.createPhase('f'), title: 'x' });
    ready(s, t);
    const l = s.reserveTask(t, R);
    for (const to of ['RUNNING', 'VERIFYING', 'REVIEW'] as const) s.transitionTaskFenced(t, to, l.fencingToken);
    for (const to of ['APPROVED', 'MERGING'] as const) s.transitionTask(t, to, s.getTask(t)!.version);
    return t;
  }
  const run = { command: 'npm test', total: 3, passed: 3, failed: 0, skipped: 0, environment: 'darwin-arm64 node22', startedAt: '2026-11-22T12:00:00.000Z', endedAt: '2026-11-22T12:00:01.000Z' };

  it('COMPLETED without evidence or test run is refused', () => {
    const s = fresh();
    const t = toMerging(s);
    expect(() => s.transitionTask(t, 'COMPLETED', s.getTask(t)!.version)).toThrow(code('EVIDENCE_REQUIRED'));
    s.recordArtifact(t, { kind: 'EVIDENCE', relativePath: '.ases/evidence/x.md', sha256: 'a'.repeat(64) });
    s.transitionTask(t, 'COMPLETED', s.getTask(t)!.version);
    s.close();
  });

  it('a failing last test run blocks COMPLETED even if the provider said "tests passed"', () => {
    const s = fresh();
    const t = toMerging(s);
    s.recordTestRun(t, { ...run, exitCode: 1, passed: 2, failed: 1 });
    expect(() => s.transitionTask(t, 'COMPLETED', s.getTask(t)!.version)).toThrow(/last test run failed \(npm test: exit 1, 1 failed\)/);
    s.recordTestRun(t, { ...run, exitCode: 0 });
    s.transitionTask(t, 'COMPLETED', s.getTask(t)!.version);
    expect(s.eventsSince(0).filter((e) => e.eventType === 'TestRunCompleted')).toHaveLength(2);
    s.close();
  });

  it('artifact paths must be relative; hashes must be sha256', () => {
    const s = fresh();
    const t = s.createTask({ phaseId: s.createPhase('f'), title: 'x' });
    expect(() => s.recordArtifact(t, { kind: 'EVIDENCE', relativePath: '/etc/passwd', sha256: 'a'.repeat(64) })).toThrow(code('INVALID_INPUT'));
    expect(() => s.recordArtifact(t, { kind: 'EVIDENCE', relativePath: '../x', sha256: 'a'.repeat(64) })).toThrow(code('INVALID_INPUT'));
    expect(() => s.recordArtifact(t, { kind: 'EVIDENCE', relativePath: 'a.md', sha256: 'zz' })).toThrow(code('INVALID_INPUT'));
    s.close();
  });
});
