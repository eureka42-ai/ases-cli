import type { EventEnvelope, PhaseState, TaskState } from '@aer/contracts';
import type { Snapshot, TaskRow } from '@aer/persistence';

/**
 * Projeção local do monitor: snapshot + eventos em ordem de seq, sem reconsultar o engine (sem polling, AER-REQ-203).
 * Eventos fora do snapshot ou repetidos são ignorados; o resultado deve igualar um snapshot novo.
 */
export function applyEvent(snap: Snapshot, e: EventEnvelope): Snapshot {
  if (e.seq <= snap.snapshotSeq) return snap;
  const p = e.payload as Record<string, unknown>;
  const next: Snapshot = { ...snap, snapshotSeq: e.seq };
  switch (e.eventType) {
    case 'PhaseCreated':
      if (e.phaseId && !snap.phases.some((x) => x.id === e.phaseId)) {
        next.phases = [...snap.phases, { id: e.phaseId, sortOrder: snap.phases.length + 1, title: String(p.title), state: 'PLANNED', version: 1 }];
      }
      break;
    case 'PhaseUpdated':
      next.phases = snap.phases.map((x) => (x.id === e.phaseId ? { ...x, state: p.to as PhaseState, version: x.version + 1 } : x));
      break;
    case 'TaskCreated':
      if (e.taskId && e.phaseId && !snap.tasks.some((t) => t.id === e.taskId)) {
        // prioridade/risco/dependências não vêm no evento: o detalhe busca a linha completa via task.get
        const t: TaskRow = { id: e.taskId, phaseId: e.phaseId, title: String(p.title), description: '', state: 'PLANNED', priority: 50, risk: 'MODERATE', version: 1, reqs: (p.reqs as string[] | undefined) ?? [], dependsOn: [], resources: [], provider: null };
        next.tasks = [...snap.tasks, t].sort((a, b) => a.id.localeCompare(b.id));
      }
      break;
    case 'TaskUpdated':
      next.tasks = snap.tasks.map((t) => (t.id === e.taskId ? { ...t, state: p.to as TaskState, version: t.version + 1 } : t));
      break;
    default:
      break;
  }
  return next;
}
