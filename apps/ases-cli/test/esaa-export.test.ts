import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ProjectStore } from '@aer/persistence';
import { esaaEvents } from '../src/esaa-export.ts';

// schema oficial do ESAA (github.com/elzobrito/ESAA-Core, src/esaa/templates/event.schema.json, MIT), copiado como fixture
const schema = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'esaa-event.schema.json'), 'utf8')) as {
  required: string[]; properties: Record<string, unknown> & { action: { enum: string[] } };
  allOf: { if: { properties: { action: { const: string } } }; then: { properties: { payload: { required?: string[] } } } }[];
};
const requiredPayload = new Map(schema.allOf.map((c) => [c.if.properties.action.const, c.then.properties.payload.required ?? []]));

function project() {
  const s = ProjectStore.open(':memory:', { id: 'prj_esaa000001', name: 'clinica' });
  const p = s.createPhase('Fase');
  const t = s.createTask({ phaseId: p, title: 'Agendar consulta', reqs: [], provider: 'codex' });
  s.recordArtifact(t, { kind: 'EVIDENCE', relativePath: '.ases/evidence/x.md', sha256: 'a'.repeat(64) });
  for (const to of ['READY', 'RESERVED', 'RUNNING', 'VERIFYING', 'REVIEW', 'REWORK', 'READY', 'RESERVED', 'RUNNING', 'VERIFYING', 'REVIEW', 'APPROVED', 'MERGING', 'COMPLETED'] as const) s.transitionTask(t, to, s.getTask(t)!.version, null);
  const i = s.reportIssue({ title: 'Login falha', symptom: 'erro 500', repro: 'admin/admin', taskId: t });
  s.resolveIssue(i, 'corrigido', 'Prof');
  s.setLessonState(s.addLesson({ text: 'Rode os testes antes de entregar' }), 'ACTIVE', 'Prof');
  return s;
}

describe('exportação no formato do ESAA (PHASE-27, activity.jsonl 0.4.2)', () => {
  it('every event follows the official ESAA event schema', () => {
    const evs = esaaEvents(project());
    expect(evs.length).toBeGreaterThan(5);
    evs.forEach((e, i) => {
      for (const k of schema.required) expect(e, `${e.action} sem ${k}`).toHaveProperty(k);
      for (const k of Object.keys(e)) expect(Object.keys(schema.properties), `campo ${k} não existe no schema`).toContain(k);
      expect(schema.properties.action.enum).toContain(e.action);
      for (const k of requiredPayload.get(e.action) ?? []) expect(e.payload, `${e.action}.payload sem ${k}`).toHaveProperty(k);
      expect(e.event_seq).toBe(i + 1); // sem lacunas
      expect(e.event_id).toBe(`EV-${String(i + 1).padStart(8, '0')}`);
      expect(e.ts).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    });
  });

  it('replays under the ESAA projection rules: todo → in_progress → review → (request_changes) → … → done, owner completes', () => {
    const evs = esaaEvents(project());
    const status = new Map<string, string>();
    const owner = new Map<string, string>();
    for (const e of evs) {
      const id = e.payload.task_id as string;
      if (e.action === 'task.create') status.set(id, 'todo');
      if (e.action === 'claim') { expect(status.get(id)).toBe('todo'); status.set(id, 'in_progress'); owner.set(id, e.actor); }
      if (e.action === 'complete') { expect(status.get(id)).toBe('in_progress'); expect(e.actor).toBe(owner.get(id)); status.set(id, 'review'); }
      if (e.action === 'review') { expect(status.get(id)).toBe('review'); status.set(id, e.payload.decision === 'approve' ? 'done' : 'in_progress'); }
    }
    expect([...status.values()]).toEqual(['done']);
    expect(evs.filter((e) => e.action === 'review').map((e) => e.payload.decision)).toEqual(['request_changes', 'approve']);
    expect(evs.find((e) => e.action === 'claim')!.actor).toBe('codex');
  });

  it('issues and lessons go along', () => {
    const evs = esaaEvents(project());
    expect(evs.find((e) => e.action === 'issue.report')!.payload).toMatchObject({ issue_id: 'ISS-0001', title: 'Login falha', evidence: { symptom: 'erro 500', repro: 'admin/admin' } });
    expect(evs.find((e) => e.action === 'issue.resolve')!.payload).toMatchObject({ issue_id: 'ISS-0001', resolution: 'corrigido' });
    const view = evs.at(-1)!;
    expect(view).toMatchObject({ action: 'orchestrator.view.mutate', payload: { target: 'lessons', change: 'baseline_reseed' } });
    expect((view.payload.lessons as { lesson_id: string; status: string; rule: string }[])[0]).toMatchObject({ lesson_id: 'LES-0001', status: 'active', rule: 'Rode os testes antes de entregar' });
  });
});
