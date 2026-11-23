import { payloadSha256, type EventEnvelope, type PhaseState, type TaskState } from '@aer/contracts';
import { openDatabase } from './database.ts';
import { StoreError } from './errors.ts';
import { ProjectStore } from './project-store.ts';

export interface LegacySnapshot {
  phases: { id: string; title: string; state: PhaseState }[];
  tasks: { id: string; phaseId: string; title: string; state: TaskState; reqs: string[]; dependsOn: string[]; priority?: number }[];
  artifacts: { taskId: string; relativePath: string; sha256: string; note?: string }[];
}

const num = (id: string) => Number(id.replace(/^\D+/, ''));

/**
 * Corte do `.ases/` interino para o banco (ADR-0002 §7, TAR-0026): só em banco vazio; eventos entram com o MESMO
 * eventId, seq, horários e hash (verificado); fases/tarefas entram como snapshot (as transições interinas não seguiam
 * a máquina §5.1, então não são reaplicadas). Tudo numa transação: falhou, nada fica.
 */
export function importLegacy(file: string, project: { id: string; name: string }, events: EventEnvelope[], snap: LegacySnapshot, source: string): { events: number; phases: number; tasks: number; artifacts: number } {
  const { db } = openDatabase(file);
  try {
    const existing = Number((db.prepare('SELECT (SELECT count(*) FROM events) + (SELECT count(*) FROM projects) n').get() as { n: number }).n);
    if (existing) throw new StoreError('INVALID_INPUT', 'legacy import requires an empty database');
    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      const created = events[0]?.occurredAt ?? now;
      db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, project.name, created);
      const insert = db.prepare(`INSERT INTO events (seq, event_id, project_id, phase_id, task_id, attempt_id, event_type, schema_version, occurred_at, observed_at, actor, payload_json, payload_sha256, redaction_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      events.forEach((e, i) => {
        if (e.seq !== i + 1) throw new StoreError('INVALID_INPUT', `legacy history has a gap: line ${i + 1} has seq ${e.seq}`);
        if (e.projectId !== project.id) throw new StoreError('INVALID_INPUT', `event ${e.seq} belongs to ${e.projectId}`);
        if (payloadSha256(e.payload) !== e.payloadSha256) throw new StoreError('INVALID_INPUT', `event ${e.seq} payload hash mismatch`);
        insert.run(e.seq, e.eventId, e.projectId, e.phaseId, e.taskId, e.attemptId, e.eventType, e.schemaVersion, e.occurredAt, e.observedAt, e.actor, JSON.stringify(e.payload), e.payloadSha256, e.redactionLevel);
      });
      for (const p of snap.phases) {
        db.prepare('INSERT INTO phases (project_id, id, sort_order, title, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(project.id, p.id, num(p.id), p.title, p.state, created, now);
      }
      for (const t of snap.tasks) {
        db.prepare(`INSERT INTO tasks (project_id, id, phase_id, title, state, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(project.id, t.id, t.phaseId, t.title, t.state, t.priority ?? 50, created, now);
        for (const r of t.reqs) db.prepare('INSERT INTO task_requirements (project_id, task_id, req_namespace, req_id) VALUES (?, ?, ?, ?)').run(project.id, t.id, r.startsWith('AER-') ? 'AER' : 'ASES', r);
      }
      for (const t of snap.tasks) for (const d of t.dependsOn) db.prepare('INSERT INTO task_dependencies (project_id, task_id, depends_on_task_id) VALUES (?, ?, ?)').run(project.id, t.id, d);
      for (const a of snap.artifacts) {
        db.prepare("INSERT INTO artifacts (project_id, task_id, kind, relative_path, sha256, note, created_at) VALUES (?, ?, 'EVIDENCE', ?, ?, ?, ?)").run(project.id, a.taskId, a.relativePath, a.sha256, a.note ?? 'importado do .ases/ interino', now);
      }
      const maxOf = (ids: string[]) => ids.reduce((m, id) => Math.max(m, num(id)), 0);
      db.prepare("INSERT INTO id_counters (project_id, kind, last_value) VALUES (?, 'PHASE', ?), (?, 'TASK', ?)").run(project.id, maxOf(snap.phases.map((p) => p.id)), project.id, maxOf(snap.tasks.map((t) => t.id)));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    db.close();
  }
  const store = ProjectStore.open(file, project, { actor: 'ases migrate-interim' });
  try {
    const result = { events: events.length, phases: snap.phases.length, tasks: snap.tasks.length, artifacts: snap.artifacts.length };
    store.appendEvent({ eventType: 'LegacyImported', payload: { source, ...result } });
    return result;
  } finally {
    store.close();
  }
}
