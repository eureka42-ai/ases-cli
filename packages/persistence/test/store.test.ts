import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type StoreError } from '../src/index.ts';
import { openStore, tempDir } from './helpers.ts';

const store = openStore(path.join(tempDir(), 'store.sqlite'));
const code = (c: string) => expect.objectContaining({ code: c }) as StoreError;

describe('ids and tasks (TAR-0008, AER-REQ-031, AER-REQ-039)', () => {
  it('allocates global TAR ids across phases', () => {
    const p1 = store.createPhase('Fase um');
    const p2 = store.createPhase('Fase dois');
    expect([p1, p2]).toEqual(['PHASE-01', 'PHASE-02']);
    const t1 = store.createTask({ phaseId: p1, title: 'a', reqs: ['AER-REQ-031', 'REQ-001'] });
    const t2 = store.createTask({ phaseId: p2, title: 'b', dependsOn: [t1] });
    const t3 = store.createTask({ phaseId: p1, title: 'c' });
    expect([t1, t2, t3]).toEqual(['TAR-0001', 'TAR-0002', 'TAR-0003']);
    expect(store.getTask(t2)).toMatchObject({ phaseId: 'PHASE-02', dependsOn: ['TAR-0001'], state: 'PLANNED', version: 1 });
    expect(store.getTask(t1)?.reqs).toEqual(['AER-REQ-031', 'REQ-001']);
  });

  it('rejects invalid input without consuming an id', () => {
    expect(() => store.createTask({ phaseId: 'PHASE-01', title: 'x', priority: 101 })).toThrow(code('INVALID_INPUT'));
    expect(() => store.createTask({ phaseId: 'PHASE-01', title: 'x', priority: -1 })).toThrow(code('INVALID_INPUT'));
    expect(() => store.createTask({ phaseId: 'PHASE-01', title: 'x', reqs: ['FOO-1'] })).toThrow(code('INVALID_INPUT'));
    expect(() => store.createTask({ phaseId: 'PHASE-09', title: 'x' })).toThrow(code('NOT_FOUND'));
    expect(() => store.createTask({ phaseId: 'PHASE-01', title: 'x', dependsOn: ['TAR-0999'] })).toThrow(code('NOT_FOUND'));
    expect(store.createTask({ phaseId: 'PHASE-01', title: 'd' })).toBe('TAR-0004'); // rollback devolveu o contador
  });
});

describe('transitions (AER-REQ-033, §6.4)', () => {
  it('applies CAS transition with event in the same transaction', () => {
    const before = store.lastSeq();
    expect(store.transitionTask('TAR-0001', 'READY', 1, 'plano aprovado')).toBe(2);
    expect(store.getTask('TAR-0001')).toMatchObject({ state: 'READY', version: 2 });
    expect(store.eventsSince(before)).toEqual([
      expect.objectContaining({ seq: before + 1, eventType: 'TaskUpdated', taskId: 'TAR-0001', payload: { from: 'PLANNED', to: 'READY', reason: 'plano aprovado' } }),
    ]);
  });

  it('rejects stale version, illegal jump and unknown task without writing anything', () => {
    const seq = store.lastSeq();
    expect(() => store.transitionTask('TAR-0001', 'RESERVED', 1)).toThrow(code('VERSION_CONFLICT'));
    expect(() => store.transitionTask('TAR-0001', 'COMPLETED', 2)).toThrow(code('INVALID_TRANSITION'));
    expect(() => store.transitionTask('TAR-0999', 'READY', 1)).toThrow(code('NOT_FOUND'));
    expect(store.lastSeq()).toBe(seq);
    expect(store.getTask('TAR-0001')).toMatchObject({ state: 'READY', version: 2 });
  });

  it('phase cannot complete with open tasks (AER-REQ-024)', () => {
    let v = store.transitionPhase('PHASE-02', 'READY', 1);
    v = store.transitionPhase('PHASE-02', 'RUNNING', v);
    v = store.transitionPhase('PHASE-02', 'VERIFYING', v);
    expect(() => store.transitionPhase('PHASE-02', 'COMPLETED', v)).toThrow(/TAR-0002\(PLANNED\)/);
    store.transitionTask('TAR-0002', 'CANCEL_REQUESTED', 1);
    store.transitionTask('TAR-0002', 'CANCELLED', 2);
    expect(store.transitionPhase('PHASE-02', 'COMPLETED', v)).toBe(v + 1);
  });
});

describe('event store (TAR-0007)', () => {
  it('is idempotent by eventId and rejects a reused id with another payload (AER-REQ-064)', () => {
    const eventId = '018f7194-44fd-7cb4-a65e-60d0b34c37e1';
    const a = store.appendEvent({ eventId, eventType: 'TestRunCompleted', payload: { passed: 1 } });
    const b = store.appendEvent({ eventId, eventType: 'TestRunCompleted', payload: { passed: 1 } });
    expect(a.inserted).toBe(true);
    expect(b).toEqual({ seq: a.seq, inserted: false });
    expect(() => store.appendEvent({ eventId, eventType: 'TestRunCompleted', payload: { passed: 2 } })).toThrow(code('EVENT_ID_CONFLICT'));
  });

  it('validates critical payloads before writing (AER-REQ-065)', () => {
    expect(() => store.appendEvent({ eventType: 'TaskUpdated', payload: { from: 'READY', to: 'DONE', reason: null } })).toThrow();
  });

  it('keeps events append-only at the database level (AER-REQ-061)', () => {
    const db = (store as unknown as { db: { exec(sql: string): void } }).db;
    expect(() => db.exec("UPDATE events SET payload_json = '{}' WHERE seq = 1")).toThrow(/append-only/);
    expect(() => db.exec('DELETE FROM events WHERE seq = 1')).toThrow(/append-only/);
  });

  it('pages by seq without gaps (AER-REQ-069)', () => {
    for (let i = 0; i < 25; i++) store.appendEvent({ eventType: 'TestRunStarted', payload: { i } });
    const seen: number[] = [];
    for (let cursor = 0, page; (page = store.eventsSince(cursor, 7)).length; cursor = page.at(-1)!.seq) seen.push(...page.map((e) => e.seq));
    expect(seen).toEqual(Array.from({ length: store.lastSeq() }, (_, i) => i + 1));
  });

  it('snapshot returns a seq cursor consistent with its rows (AER-REQ-074)', () => {
    const snap = store.snapshot();
    expect(snap.snapshotSeq).toBe(store.lastSeq());
    expect(snap.tasks.map((t) => t.id)).toEqual(['TAR-0001', 'TAR-0002', 'TAR-0003', 'TAR-0004']);
    expect(store.eventsSince(snap.snapshotSeq)).toEqual([]);
  });

  it('rolls back state and events together when the transaction throws', () => {
    const seq = store.lastSeq();
    expect(() => store.tx(() => {
      store.createPhase('vai sumir');
      throw new Error('boom');
    })).toThrow('boom');
    expect(store.lastSeq()).toBe(seq);
    expect(store.listPhases().map((p) => p.id)).toEqual(['PHASE-01', 'PHASE-02']);
  });
});
