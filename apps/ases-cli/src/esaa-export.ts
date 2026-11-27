import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ProjectStore } from '@aer/persistence';

// PHASE-27: o histórico do AER no formato do ESAA (Prof. Elzo Brito, github.com/elzobrito/ESAA-Core), para auditar com
// `esaa --root .ases/esaa project` e `esaa --root .ases/esaa verify`. Formato escolhido: o activity.jsonl 0.4.2 do próprio ESAA.
// Só entram transições que existem no vocabulário dele (todo → in_progress → review → done); o resto do AER fica de fora.

export interface EsaaEvent {
  schema_version: string; event_id: string; event_seq: number; ts: string; actor: string;
  runner: { runner_id: string; runner_kind: null; command_surface: string; on_behalf_of: null };
  reviewer_role?: string; action: string; payload: Record<string, unknown>;
}

const IN_PROGRESS = new Set(['RESERVED', 'RUNNING', 'VERIFYING']);
const APPROVED = new Set(['APPROVED', 'MERGING', 'COMPLETED']);
const baseId = (p: string | null | undefined) => (p ?? '').split(':')[0] || 'aer';

export function esaaEvents(store: ProjectStore): EsaaEvent[] {
  const out: EsaaEvent[] = [];
  const tasks = new Map(store.listTasks().map((t) => [t.id, t]));
  const issues = new Map(store.listIssues().map((x) => [x.id, x]));
  const status = new Map<string, 'todo' | 'in_progress' | 'review' | 'done'>();
  const owner = new Map<string, string>();
  const attemptProvider = new Map<string, string>();
  let lastTs = new Date(0).toISOString();
  const push = (ts: string, actor: string, action: string, payload: Record<string, unknown>, reviewer = false) => {
    lastTs = ts;
    out.push({
      schema_version: '0.4.2', event_id: `EV-${String(out.length + 1).padStart(8, '0')}`, event_seq: out.length + 1, ts: `${ts.slice(0, 19)}Z`, actor,
      runner: { runner_id: actor, runner_kind: null, command_surface: 'cli', on_behalf_of: null }, ...(reviewer ? { reviewer_role: 'qa' } : {}), action, payload,
    });
  };
  let after = 0;
  for (;;) {
    const page = store.eventsSince(after, 1000);
    if (!page.length) break;
    for (const e of page) {
      after = e.seq;
      const p = e.payload as Record<string, unknown>;
      const id = e.taskId ?? '';
      if (e.eventType === 'ProjectInitialized') push(e.occurredAt, 'aer', 'run.start', { project: String(p.name), source_mode: 'aer-export' });
      else if (e.eventType === 'TaskCreated') {
        status.set(id, 'todo');
        push(e.occurredAt, 'aer', 'task.create', { task_id: id, title: String(p.title), task_kind: 'impl', description: tasks.get(id)?.description ?? '' });
      } else if (e.eventType === 'AttemptStarted' && e.attemptId) attemptProvider.set(id, String(p.providerId));
      else if (e.eventType === 'TaskUpdated' && status.has(id)) {
        const st = status.get(id)!;
        const to = String(p.to);
        if (st === 'todo' && IN_PROGRESS.has(to)) {
          const who = baseId(attemptProvider.get(id) ?? tasks.get(id)?.provider);
          owner.set(id, who);
          status.set(id, 'in_progress');
          push(e.occurredAt, who, 'claim', { task_id: id, prior_status: 'todo' });
        } else if (st === 'in_progress' && to === 'REVIEW') {
          status.set(id, 'review');
          push(e.occurredAt, owner.get(id)!, 'complete', { task_id: id, prior_status: 'in_progress' });
        } else if (st === 'review' && APPROVED.has(to)) {
          status.set(id, 'done');
          push(e.occurredAt, 'aer-qa', 'review', { task_id: id, decision: 'approve', prior_status: 'review' }, true);
        } else if (st === 'review' && (to === 'REWORK' || to === 'READY' || IN_PROGRESS.has(to))) {
          status.set(id, 'in_progress');
          push(e.occurredAt, 'aer-qa', 'review', { task_id: id, decision: 'request_changes', prior_status: 'review', notes: p.reason ? String(p.reason) : '' }, true);
        }
      } else if (e.eventType === 'IssueReported') {
        const x = issues.get(String(p.id));
        push(e.occurredAt, 'aer', 'issue.report', { issue_id: String(p.id), task_id: x?.taskId ?? null, title: String(p.title), evidence: { symptom: x?.symptom ?? '', repro: x?.repro ?? '' } });
      } else if (e.eventType === 'IssueResolved') {
        push(e.occurredAt, 'aer', 'issue.resolve', { issue_id: String(p.id), resolution: issues.get(String(p.id))?.resolution ?? '' });
      }
    }
  }
  const lessons = store.listLessons();
  if (lessons.length) {
    const st = { ACTIVE: 'active', PROPOSED: 'proposed', ARCHIVED: 'archived' } as const;
    push(lastTs, 'aer', 'orchestrator.view.mutate', {
      target: 'lessons', change: 'baseline_reseed',
      lessons: lessons.map((l) => ({
        lesson_id: l.id, status: st[l.state], created_at: `${l.createdAt.slice(0, 19)}Z`, title: l.text.slice(0, 80),
        mistake: `registrada no AER${l.source ? ` (${l.source})` : ''}`, rule: l.text, scope: { task_kinds: ['spec', 'impl', 'qa'] }, enforcement: { mode: 'warn' },
      })),
    });
  }
  return out;
}

/** Grava .ases/esaa/.roadmap/activity.jsonl (temporário + rename, como o HISTORY.jsonl). */
export function writeEsaaExport(store: ProjectStore, root: string): { file: string; events: number } {
  const dir = path.join(root, '.ases', 'esaa', '.roadmap');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'activity.jsonl');
  const evs = esaaEvents(store);
  writeFileSync(`${file}.tmp`, evs.map((e) => JSON.stringify(e)).join('\n') + (evs.length ? '\n' : ''));
  renameSync(`${file}.tmp`, file);
  return { file, events: evs.length };
}
