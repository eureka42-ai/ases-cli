import { randomUUID } from 'node:crypto';
import {
  EVENT_TYPES, PHASE_STATES, TASK_STATES, canTransitionPhase, canTransitionTask, formatPhaseId, formatTaskId,
  payloadSha256, validatePayload, type EventEnvelope, type EventType, type PhaseState, type TaskState,
} from '@aer/contracts';
import { openDatabase, type OpenResult } from './database.ts';
import type { Database } from './driver.ts';
import { StoreError } from './errors.ts';

export interface StoreOptions {
  actor?: string;
  now?: () => string;
}

export interface EventInput {
  eventType: EventType;
  payload: Record<string, unknown>;
  eventId?: string;
  phaseId?: string | null;
  taskId?: string | null;
  attemptId?: string | null;
  actor?: string;
  occurredAt?: string;
}

export interface PhaseRow {
  id: string;
  sortOrder: number;
  title: string;
  state: PhaseState;
  version: number;
}

export type Risk = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface TaskRow {
  id: string;
  phaseId: string;
  title: string;
  description: string;
  state: TaskState;
  priority: number;
  risk: Risk;
  version: number;
  reqs: string[];
  dependsOn: string[];
}

export interface CreateTaskInput {
  phaseId: string;
  title: string;
  description?: string;
  priority?: number;
  risk?: Risk;
  reqs?: string[];
  dependsOn?: string[];
}

export interface Snapshot {
  snapshotSeq: number;
  phases: PhaseRow[];
  tasks: TaskRow[];
}

type Row = Record<string, unknown>;
const MAX_PAGE = 1000;
const RISKS: readonly Risk[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

function reqNamespace(req: string): 'AER' | 'ASES' {
  if (/^AER-REQ-\d{3,}$/.test(req)) return 'AER';
  if (/^REQ-\d{3,}$/.test(req)) return 'ASES';
  throw new StoreError('INVALID_INPUT', `unknown requirement id format: ${req}`);
}

function toEvent(r: Row): EventEnvelope {
  return {
    schemaVersion: 1,
    eventId: String(r.event_id),
    seq: Number(r.seq),
    projectId: String(r.project_id),
    phaseId: (r.phase_id as string | null) ?? null,
    taskId: (r.task_id as string | null) ?? null,
    attemptId: (r.attempt_id as string | null) ?? null,
    eventType: r.event_type as EventType,
    occurredAt: String(r.occurred_at),
    observedAt: String(r.observed_at),
    actor: String(r.actor),
    payload: JSON.parse(String(r.payload_json)) as Record<string, unknown>,
    redactionLevel: r.redaction_level as EventEnvelope['redactionLevel'],
    payloadSha256: String(r.payload_sha256),
  };
}

/**
 * Autoridade do estado operacional (§6.1): toda mudança de estado e seu evento entram na mesma transação.
 * Um ProjectStore por processo; vários processos podem abrir o mesmo arquivo (WAL + BEGIN IMMEDIATE).
 */
export class ProjectStore {
  readonly projectId: string;
  readonly info: Omit<OpenResult, 'db'>;
  private readonly db: Database;
  private readonly actor: string;
  private readonly now: () => string;
  private inTx = false;

  private constructor(opened: OpenResult, projectId: string, options: StoreOptions) {
    const { db, ...info } = opened;
    this.db = db;
    this.info = info;
    this.projectId = projectId;
    this.actor = options.actor ?? 'aer-engine';
    this.now = options.now ?? (() => new Date().toISOString());
  }

  static open(file: string, project: { id: string; name: string }, options: StoreOptions = {}): ProjectStore {
    const store = new ProjectStore(openDatabase(file), project.id, options);
    store.tx(() => {
      const r = store.db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(project.id, project.name, store.now());
      if (r.changes === 1) {
        store.db.prepare("INSERT INTO id_counters (project_id, kind) VALUES (?, 'PHASE'), (?, 'TASK')").run(project.id, project.id);
        store.appendEvent({ eventType: 'ProjectInitialized', payload: { name: project.name } });
      }
    });
    return store;
  }

  close(): void {
    this.db.close();
  }

  /** Transação de escrita (BEGIN IMMEDIATE): commit se fn retornar, rollback se lançar. */
  tx<T>(fn: () => T): T {
    if (this.inTx) throw new StoreError('NESTED_TRANSACTION', 'nested transactions are not supported');
    this.db.exec('BEGIN IMMEDIATE');
    this.inTx = true;
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    } finally {
      this.inTx = false;
    }
  }

  private inWriteTx<T>(fn: () => T): T {
    return this.inTx ? fn() : this.tx(fn);
  }

  /** Append idempotente por eventId (AER-REQ-064); mesmo id com payload diferente é erro. */
  appendEvent(input: EventInput): { seq: number; inserted: boolean } {
    if (!EVENT_TYPES.includes(input.eventType)) throw new StoreError('INVALID_INPUT', `unknown event type: ${input.eventType}`);
    validatePayload(input.eventType, input.payload);
    const eventId = input.eventId ?? randomUUID();
    const hash = payloadSha256(input.payload);
    const observedAt = this.now();
    return this.inWriteTx(() => {
      // SELECT antes do INSERT (sob BEGIN IMMEDIATE): "ON CONFLICT DO NOTHING" com AUTOINCREMENT queima seq e abre lacuna
      const existing = this.db.prepare('SELECT seq, payload_sha256 FROM events WHERE event_id = ?').get(eventId) as Row | undefined;
      if (existing) {
        if (existing.payload_sha256 !== hash) throw new StoreError('EVENT_ID_CONFLICT', `eventId ${eventId} already used with a different payload`);
        return { seq: Number(existing.seq), inserted: false };
      }
      const r = this.db.prepare(`INSERT INTO events (event_id, project_id, phase_id, task_id, attempt_id, event_type, schema_version,
          occurred_at, observed_at, actor, payload_json, payload_sha256, redaction_level)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'SAFE')`).run(
        eventId, this.projectId, input.phaseId ?? null, input.taskId ?? null, input.attemptId ?? null, input.eventType,
        input.occurredAt ?? observedAt, observedAt, input.actor ?? this.actor, JSON.stringify(input.payload), hash,
      );
      return { seq: Number(r.lastInsertRowid), inserted: true };
    });
  }

  private nextId(kind: 'PHASE' | 'TASK'): number {
    const r = this.db.prepare('UPDATE id_counters SET last_value = last_value + 1 WHERE project_id = ? AND kind = ? RETURNING last_value').get(this.projectId, kind) as Row;
    return Number(r.last_value);
  }

  createPhase(title: string): string {
    if (!title.trim()) throw new StoreError('INVALID_INPUT', 'phase title is required');
    return this.inWriteTx(() => {
      const n = this.nextId('PHASE');
      const id = formatPhaseId(n);
      const now = this.now();
      this.db.prepare("INSERT INTO phases (project_id, id, sort_order, title, state, created_at, updated_at) VALUES (?, ?, ?, ?, 'PLANNED', ?, ?)")
        .run(this.projectId, id, n, title, now, now);
      this.appendEvent({ eventType: 'PhaseCreated', phaseId: id, payload: { title } });
      return id;
    });
  }

  /** IDs TAR globais no projeto (AER-REQ-031). Dependências só apontam para tarefas já existentes, logo o grafo nasce acíclico. */
  createTask(input: CreateTaskInput): string {
    const priority = input.priority ?? 50;
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) throw new StoreError('INVALID_INPUT', `priority must be an integer 0-100, got ${priority}`);
    const risk = input.risk ?? 'MODERATE';
    if (!RISKS.includes(risk)) throw new StoreError('INVALID_INPUT', `invalid risk: ${risk}`);
    if (!input.title.trim()) throw new StoreError('INVALID_INPUT', 'task title is required');
    const reqs = [...new Set(input.reqs ?? [])];
    const namespaces = reqs.map(reqNamespace);
    return this.inWriteTx(() => {
      if (!this.db.prepare('SELECT 1 FROM phases WHERE project_id = ? AND id = ?').get(this.projectId, input.phaseId)) {
        throw new StoreError('NOT_FOUND', `phase ${input.phaseId} not found`);
      }
      const id = formatTaskId(this.nextId('TASK'));
      const now = this.now();
      this.db.prepare(`INSERT INTO tasks (project_id, id, phase_id, title, description, state, priority, risk, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'PLANNED', ?, ?, ?, ?)`).run(this.projectId, id, input.phaseId, input.title, input.description ?? '', priority, risk, now, now);
      reqs.forEach((req, i) => {
        this.db.prepare('INSERT INTO task_requirements (project_id, task_id, req_namespace, req_id) VALUES (?, ?, ?, ?)').run(this.projectId, id, namespaces[i]!, req);
      });
      for (const dep of new Set(input.dependsOn ?? [])) {
        if (!this.db.prepare('SELECT 1 FROM tasks WHERE project_id = ? AND id = ?').get(this.projectId, dep)) throw new StoreError('NOT_FOUND', `dependency ${dep} not found`);
        this.db.prepare('INSERT INTO task_dependencies (project_id, task_id, depends_on_task_id) VALUES (?, ?, ?)').run(this.projectId, id, dep);
      }
      this.appendEvent({ eventType: 'TaskCreated', phaseId: input.phaseId, taskId: id, payload: { title: input.title, reqs } });
      return id;
    });
  }

  /** CAS por versão + evento na mesma transação (§6.4). Retorna a nova versão. */
  transitionTask(taskId: string, to: TaskState, expectedVersion: number, reason: string | null = null): number {
    if (!TASK_STATES.includes(to)) throw new StoreError('INVALID_INPUT', `invalid task state: ${to}`);
    return this.inWriteTx(() => {
      const row = this.db.prepare('SELECT phase_id, state, version FROM tasks WHERE project_id = ? AND id = ?').get(this.projectId, taskId) as Row | undefined;
      if (!row) throw new StoreError('NOT_FOUND', `task ${taskId} not found`);
      const from = row.state as TaskState;
      if (Number(row.version) !== expectedVersion) throw new StoreError('VERSION_CONFLICT', `${taskId} is at version ${row.version}, expected ${expectedVersion}`);
      if (!canTransitionTask(from, to)) throw new StoreError('INVALID_TRANSITION', `${taskId}: ${from} -> ${to} is not allowed`);
      const r = this.db.prepare('UPDATE tasks SET state = ?, version = version + 1, updated_at = ? WHERE project_id = ? AND id = ? AND version = ?')
        .run(to, this.now(), this.projectId, taskId, expectedVersion);
      if (r.changes !== 1) throw new StoreError('VERSION_CONFLICT', `${taskId} changed concurrently`);
      this.appendEvent({ eventType: 'TaskUpdated', phaseId: String(row.phase_id), taskId, payload: { from, to, reason } });
      return expectedVersion + 1;
    });
  }

  /** Fase só conclui com todas as tarefas COMPLETED/CANCELLED (AER-REQ-024). */
  transitionPhase(phaseId: string, to: PhaseState, expectedVersion: number, reason: string | null = null): number {
    if (!PHASE_STATES.includes(to)) throw new StoreError('INVALID_INPUT', `invalid phase state: ${to}`);
    return this.inWriteTx(() => {
      const row = this.db.prepare('SELECT state, version FROM phases WHERE project_id = ? AND id = ?').get(this.projectId, phaseId) as Row | undefined;
      if (!row) throw new StoreError('NOT_FOUND', `phase ${phaseId} not found`);
      const from = row.state as PhaseState;
      if (Number(row.version) !== expectedVersion) throw new StoreError('VERSION_CONFLICT', `${phaseId} is at version ${row.version}, expected ${expectedVersion}`);
      if (!canTransitionPhase(from, to)) throw new StoreError('INVALID_TRANSITION', `${phaseId}: ${from} -> ${to} is not allowed`);
      if (to === 'COMPLETED') {
        const open = this.db.prepare("SELECT id, state FROM tasks WHERE project_id = ? AND phase_id = ? AND state NOT IN ('COMPLETED','CANCELLED') ORDER BY id")
          .all(this.projectId, phaseId) as Row[];
        if (open.length) throw new StoreError('PHASE_HAS_OPEN_TASKS', `${phaseId} has open tasks: ${open.map((t) => `${t.id}(${t.state})`).join(', ')}`);
      }
      this.db.prepare('UPDATE phases SET state = ?, version = version + 1, updated_at = ? WHERE project_id = ? AND id = ? AND version = ?')
        .run(to, this.now(), this.projectId, phaseId, expectedVersion);
      this.appendEvent({ eventType: 'PhaseUpdated', phaseId, payload: { from, to, reason } });
      return expectedVersion + 1;
    });
  }

  listPhases(): PhaseRow[] {
    return (this.db.prepare('SELECT id, sort_order, title, state, version FROM phases WHERE project_id = ? ORDER BY sort_order').all(this.projectId) as Row[])
      .map((r) => ({ id: String(r.id), sortOrder: Number(r.sort_order), title: String(r.title), state: r.state as PhaseState, version: Number(r.version) }));
  }

  listTasks(phaseId?: string): TaskRow[] {
    const rows = this.db.prepare(`SELECT id, phase_id, title, description, state, priority, risk, version FROM tasks
      WHERE project_id = ? AND (? IS NULL OR phase_id = ?) ORDER BY id`).all(this.projectId, phaseId ?? null, phaseId ?? null) as Row[];
    const reqs = this.db.prepare('SELECT req_id FROM task_requirements WHERE project_id = ? AND task_id = ? ORDER BY req_id');
    const deps = this.db.prepare('SELECT depends_on_task_id d FROM task_dependencies WHERE project_id = ? AND task_id = ? ORDER BY d');
    return rows.map((r) => ({
      id: String(r.id), phaseId: String(r.phase_id), title: String(r.title), description: String(r.description), state: r.state as TaskState,
      priority: Number(r.priority), risk: r.risk as Risk, version: Number(r.version),
      reqs: (reqs.all(this.projectId, r.id as string) as Row[]).map((x) => String(x.req_id)),
      dependsOn: (deps.all(this.projectId, r.id as string) as Row[]).map((x) => String(x.d)),
    }));
  }

  getTask(taskId: string): TaskRow | undefined {
    return this.listTasks().find((t) => t.id === taskId);
  }

  /** Leitura paginada por seq (AER-REQ-069). */
  eventsSince(afterSeq: number, limit = 500): EventEnvelope[] {
    const n = Math.min(Math.max(1, Math.trunc(limit)), MAX_PAGE);
    return (this.db.prepare('SELECT * FROM events WHERE project_id = ? AND seq > ? ORDER BY seq LIMIT ?').all(this.projectId, afterSeq, n) as Row[]).map(toEvent);
  }

  lastSeq(): number {
    return Number((this.db.prepare('SELECT COALESCE(MAX(seq), 0) s FROM events WHERE project_id = ?').get(this.projectId) as Row).s);
  }

  /** Snapshot consistente + cursor numa única transação de leitura (AER-REQ-074, §10.3). */
  snapshot(): Snapshot {
    if (this.inTx) throw new StoreError('NESTED_TRANSACTION', 'snapshot cannot run inside a write transaction');
    this.db.exec('BEGIN');
    try {
      return { snapshotSeq: this.lastSeq(), phases: this.listPhases(), tasks: this.listTasks() };
    } finally {
      this.db.exec('COMMIT');
    }
  }
}
