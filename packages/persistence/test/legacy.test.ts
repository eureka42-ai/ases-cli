import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { payloadSha256, type EventEnvelope } from '@aer/contracts';
import { ProjectStore, importLegacy, openDatabase, type LegacySnapshot } from '../src/index.ts';
import { PROJECT, tempDir } from './helpers.ts';

const dir = tempDir();
let n = 0;
const file = () => path.join(dir, `l${++n}.sqlite`);
const ev = (seq: number, eventType: EventEnvelope['eventType'], payload: Record<string, unknown>, extra: Partial<EventEnvelope> = {}): EventEnvelope => ({
  schemaVersion: 1, eventId: randomUUID(), seq, projectId: PROJECT.id, phaseId: null, taskId: null, attemptId: null, eventType,
  occurredAt: '2026-11-22T10:00:00.000Z', observedAt: '2026-11-22T10:00:00.000Z', actor: 'ases-dev-interim', payload, redactionLevel: 'SAFE', payloadSha256: payloadSha256(payload), ...extra,
});
const history = () => [
  ev(1, 'ProjectInitialized', { name: 'x', sources: 3 }),
  ev(2, 'PhaseCreated', { title: 'Um' }, { phaseId: 'PHASE-01' }),
  ev(3, 'TaskCreated', { title: 'a', reqs: ['AER-REQ-001'] }, { phaseId: 'PHASE-01', taskId: 'TAR-0001' }),
  ev(4, 'TaskUpdated', { from: 'PLANNED', to: 'REVIEW', evidence: ['e.md'], note: 'formato interino' }, { phaseId: 'PHASE-01', taskId: 'TAR-0001' }),
];
const snap: LegacySnapshot = {
  phases: [{ id: 'PHASE-01', title: 'Um', state: 'RUNNING' }],
  tasks: [{ id: 'TAR-0001', phaseId: 'PHASE-01', title: 'a', state: 'REVIEW', reqs: ['AER-REQ-001'], dependsOn: [] }],
  artifacts: [{ taskId: 'TAR-0001', relativePath: 'e.md', sha256: 'b'.repeat(64) }],
};

describe('legacy import (TAR-0026)', () => {
  it('preserves eventId, seq, hashes and non-standard interim payloads; counters continue', () => {
    const f = file();
    const h = history();
    expect(importLegacy(f, PROJECT, h, snap, 'test')).toEqual({ events: 4, phases: 1, tasks: 1, artifacts: 1 });
    const s = ProjectStore.open(f, PROJECT);
    const evs = s.eventsSince(0);
    expect(evs.slice(0, 4).map((e) => [e.seq, e.eventId, e.payloadSha256])).toEqual(h.map((e) => [e.seq, e.eventId, e.payloadSha256]));
    expect(evs[3]!.payload).toEqual({ from: 'PLANNED', to: 'REVIEW', evidence: ['e.md'], note: 'formato interino' });
    expect(evs[4]).toMatchObject({ seq: 5, eventType: 'LegacyImported' });
    expect(s.getTask('TAR-0001')).toMatchObject({ state: 'REVIEW', reqs: ['AER-REQ-001'] });
    expect(s.listArtifacts('TAR-0001')).toHaveLength(1);
    expect(s.createPhase('nova')).toBe('PHASE-02');
    s.close();
  });

  it('refuses a non-empty database', () => {
    const f = file();
    ProjectStore.open(f, PROJECT).close();
    expect(() => importLegacy(f, PROJECT, history(), snap, 'test')).toThrow(/empty database/);
  });

  it.each([
    ['tampered payload', (h: EventEnvelope[]) => { h[2]!.payload.title = 'adulterado'; }, /hash mismatch/],
    ['gap in seq', (h: EventEnvelope[]) => { h.splice(1, 1); }, /gap/],
    ['other project', (h: EventEnvelope[]) => { h[0]!.projectId = 'prj_outro00001'; }, /belongs to/],
  ])('%s: rejected and nothing is written', (_n, mutate, msg) => {
    const f = file();
    const h = history();
    mutate(h);
    expect(() => importLegacy(f, PROJECT, h, snap, 'test')).toThrow(msg);
    const { db } = openDatabase(f);
    expect(db.prepare('SELECT (SELECT count(*) FROM events) e, (SELECT count(*) FROM tasks) t').get()).toEqual({ e: 0, t: 0 });
    db.close();
  });
});
