import { describe, expect, it } from 'vitest';
import { ProjectStore } from '@aer/persistence';
import { applyEvent } from '../src/projection.ts';

describe('local projection (TAR-0018)', () => {
  it('snapshot + events equals a fresh snapshot (state, versions, ids)', () => {
    const store = ProjectStore.open(':memory:', { id: 'prj_proj00001', name: 'p' });
    const p1 = store.createPhase('Um');
    store.createTask({ phaseId: p1, title: 'a', reqs: ['AER-REQ-001'] });
    const base = store.snapshot();
    const p2 = store.createPhase('Dois');
    const t2 = store.createTask({ phaseId: p2, title: 'b' });
    store.transitionTask('TAR-0001', 'READY', 1, 'ok');
    store.transitionTask(t2, 'BLOCKED', 1);
    store.transitionPhase(p1, 'READY', 1);
    let proj = base;
    for (const e of store.eventsSince(base.snapshotSeq)) proj = applyEvent(proj, e);
    for (const e of store.eventsSince(0)) proj = applyEvent(proj, e); // repetidos são ignorados
    const fresh = store.snapshot();
    const pick = (s: typeof fresh) => ({ seq: s.snapshotSeq, phases: s.phases, tasks: s.tasks.map(({ id, phaseId, title, state, version, reqs }) => ({ id, phaseId, title, state, version, reqs })) });
    expect(pick(proj)).toEqual(pick(fresh));
    store.close();
  });
});
