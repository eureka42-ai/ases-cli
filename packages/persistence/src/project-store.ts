import { randomUUID } from 'node:crypto';
import {
  EVENT_TYPES, PHASE_STATES, TASK_STATES, canTransitionPhase, canTransitionTask, formatAttemptId, formatPhaseId, formatTaskId,
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
  resources: string[];
  provider: string | null;
}

export interface CreateTaskInput {
  phaseId: string;
  title: string;
  description?: string;
  priority?: number;
  risk?: Risk;
  reqs?: string[];
  dependsOn?: string[];
  /** recursos compartilhados (schema, migração, porta...): duas tarefas com o mesmo recurso não rodam juntas */
  resources?: string[];
  provider?: string;
}

export interface Lease {
  taskId: string;
  ownerId: string;
  fencingToken: number;
  expiresAt: string;
}

export interface ReserveOptions {
  ownerId: string;
  ttlMs: number;
  explanation: string;
  /** limite global de tarefas com lease ativo (verificado dentro da transação, AER-REQ-043) */
  maxActive?: number;
  /** limite por provider (AER-REQ-044) */
  maxPerProvider?: Record<string, number>;
}

export interface AttemptRow {
  id: string;
  taskId: string;
  providerId: string;
  state: 'RUNNING' | 'EXITED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';
  fencingToken: number;
  worktreePath: string | null;
  branch: string | null;
  baseCommit: string | null;
  exitCode: number | null;
}

export interface TestRunInput {
  command: string;
  exitCode: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  environment: string;
  startedAt: string;
  endedAt: string;
  attemptId?: string;
}

export interface Snapshot {
  snapshotSeq: number;
  phases: PhaseRow[];
  tasks: TaskRow[];
}

type Row = Record<string, unknown>;
const MAX_PAGE = 1000;
const RISKS: readonly Risk[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
const LEASED_STATES: readonly TaskState[] = ['RESERVED', 'RUNNING', 'VERIFYING'];

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
      this.db.prepare(`INSERT INTO tasks (project_id, id, phase_id, title, description, state, priority, risk, provider, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'PLANNED', ?, ?, ?, ?, ?)`).run(this.projectId, id, input.phaseId, input.title, input.description ?? '', priority, risk, input.provider ?? null, now, now);
      for (const r of new Set(input.resources ?? [])) {
        if (!r.trim()) throw new StoreError('INVALID_INPUT', 'empty resource name');
        this.db.prepare('INSERT INTO task_resources (project_id, task_id, resource) VALUES (?, ?, ?)').run(this.projectId, id, r);
      }
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
      if (to === 'COMPLETED') this.assertEvidence(taskId);
      const r = this.db.prepare('UPDATE tasks SET state = ?, version = version + 1, updated_at = ? WHERE project_id = ? AND id = ? AND version = ?')
        .run(to, this.now(), this.projectId, taskId, expectedVersion);
      if (r.changes !== 1) throw new StoreError('VERSION_CONFLICT', `${taskId} changed concurrently`);
      // o lease só vale enquanto a tarefa está reservada/em execução/verificação
      if (!LEASED_STATES.includes(to)) this.db.prepare('DELETE FROM task_leases WHERE project_id = ? AND task_id = ?').run(this.projectId, taskId);
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
    const rows = this.db.prepare(`SELECT id, phase_id, title, description, state, priority, risk, version, provider FROM tasks
      WHERE project_id = ? AND (? IS NULL OR phase_id = ?) ORDER BY id`).all(this.projectId, phaseId ?? null, phaseId ?? null) as Row[];
    const reqs = this.db.prepare('SELECT req_id FROM task_requirements WHERE project_id = ? AND task_id = ? ORDER BY req_id');
    const deps = this.db.prepare('SELECT depends_on_task_id d FROM task_dependencies WHERE project_id = ? AND task_id = ? ORDER BY d');
    const res = this.db.prepare('SELECT resource FROM task_resources WHERE project_id = ? AND task_id = ? ORDER BY resource');
    return rows.map((r) => ({
      id: String(r.id), phaseId: String(r.phase_id), title: String(r.title), description: String(r.description), state: r.state as TaskState,
      priority: Number(r.priority), risk: r.risk as Risk, version: Number(r.version),
      reqs: (reqs.all(this.projectId, r.id as string) as Row[]).map((x) => String(x.req_id)),
      dependsOn: (deps.all(this.projectId, r.id as string) as Row[]).map((x) => String(x.d)),
      resources: (res.all(this.projectId, r.id as string) as Row[]).map((x) => String(x.resource)),
      provider: (r.provider as string | null) ?? null,
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


  // ---------------------------------------------------------------- DAG (TAR-0021)

  /** Adiciona dependência depois da criação; rejeita ciclo com o caminho que o fecharia (AER-REQ-041). */
  addDependency(taskId: string, dependsOn: string): void {
    if (taskId === dependsOn) throw new StoreError('DEPENDENCY_CYCLE', `${taskId} cannot depend on itself`);
    this.inWriteTx(() => {
      const task = this.db.prepare('SELECT phase_id FROM tasks WHERE project_id = ? AND id = ?').get(this.projectId, taskId) as Row | undefined;
      if (!task) throw new StoreError('NOT_FOUND', `task ${taskId} not found`);
      if (!this.db.prepare('SELECT 1 FROM tasks WHERE project_id = ? AND id = ?').get(this.projectId, dependsOn)) throw new StoreError('NOT_FOUND', `task ${dependsOn} not found`);
      const path = this.dependencyPath(dependsOn, taskId);
      if (path) throw new StoreError('DEPENDENCY_CYCLE', `cycle: ${[taskId, ...path].join(' -> ')}`);
      const r = this.db.prepare('INSERT OR IGNORE INTO task_dependencies (project_id, task_id, depends_on_task_id) VALUES (?, ?, ?)').run(this.projectId, taskId, dependsOn);
      if (r.changes === 1) this.appendEvent({ eventType: 'TaskDependencyAdded', phaseId: String(task.phase_id), taskId, payload: { dependsOn } });
    });
  }

  /** Caminho from → … → to seguindo "depende de", ou undefined. */
  private dependencyPath(from: string, to: string): string[] | undefined {
    const edges = this.db.prepare('SELECT depends_on_task_id d FROM task_dependencies WHERE project_id = ? AND task_id = ?');
    const prev = new Map<string, string>([[from, '']]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === to) {
        const path: string[] = [];
        for (let n: string | undefined = to; n; n = prev.get(n) || undefined) path.unshift(n);
        return path;
      }
      for (const e of edges.all(this.projectId, cur) as Row[]) {
        const d = String(e.d);
        if (!prev.has(d)) {
          prev.set(d, cur);
          queue.push(d);
        }
      }
    }
    return undefined;
  }

  // ---------------------------------------------------------------- leases (TAR-0022)

  activeLeases(nowIso = this.now()): Lease[] {
    return (this.db.prepare('SELECT task_id, owner_id, fencing_token, expires_at FROM task_leases WHERE project_id = ? AND expires_at > ? ORDER BY task_id').all(this.projectId, nowIso) as Row[])
      .map((r) => ({ taskId: String(r.task_id), ownerId: String(r.owner_id), fencingToken: Number(r.fencing_token), expiresAt: String(r.expires_at) }));
  }

  /**
   * Reserva READY → RESERVED numa transação: dependências concluídas, sem lease vivo, recursos livres e
   * capacidade disponível. Exatamente um vencedor entre processos concorrentes (AER-REQ-045). Devolve o fencing token.
   */
  reserveTask(taskId: string, o: ReserveOptions): { fencingToken: number; version: number; expiresAt: string } {
    if (!Number.isInteger(o.ttlMs) || o.ttlMs <= 0) throw new StoreError('INVALID_INPUT', 'ttlMs must be a positive integer');
    return this.inWriteTx(() => {
      const nowIso = this.now();
      const t = this.db.prepare('SELECT phase_id, state, version, fencing_seq, provider FROM tasks WHERE project_id = ? AND id = ?').get(this.projectId, taskId) as Row | undefined;
      if (!t) throw new StoreError('NOT_FOUND', `task ${taskId} not found`);
      if (t.state !== 'READY') throw new StoreError('NOT_READY', `${taskId} is ${String(t.state)}, not READY`);
      const pending = this.db.prepare(`SELECT d.depends_on_task_id id, x.state FROM task_dependencies d JOIN tasks x ON x.project_id = d.project_id AND x.id = d.depends_on_task_id
        WHERE d.project_id = ? AND d.task_id = ? AND x.state <> 'COMPLETED' ORDER BY id`).all(this.projectId, taskId) as Row[];
      if (pending.length) throw new StoreError('DEPENDENCIES_PENDING', `${taskId} waits for ${pending.map((p) => `${p.id}(${p.state})`).join(', ')}`);
      const existing = this.db.prepare('SELECT owner_id, expires_at FROM task_leases WHERE project_id = ? AND task_id = ?').get(this.projectId, taskId) as Row | undefined;
      if (existing && String(existing.expires_at) > nowIso) throw new StoreError('LEASED', `${taskId} already leased by ${String(existing.owner_id)}`);
      const active = this.activeLeases(nowIso);
      if (o.maxActive !== undefined && active.length >= o.maxActive) throw new StoreError('CAPACITY', `max ${o.maxActive} active task(s) reached`);
      const provider = (t.provider as string | null) ?? null;
      if (provider && o.maxPerProvider?.[provider] !== undefined) {
        const n = Number((this.db.prepare(`SELECT count(*) n FROM task_leases l JOIN tasks x ON x.project_id = l.project_id AND x.id = l.task_id
          WHERE l.project_id = ? AND l.expires_at > ? AND x.provider = ?`).get(this.projectId, nowIso, provider) as Row).n);
        if (n >= o.maxPerProvider[provider]!) throw new StoreError('CAPACITY', `max ${o.maxPerProvider[provider]} active task(s) for provider ${provider}`);
      }
      const busy = this.db.prepare(`SELECT r.resource, l.task_id FROM task_resources r
        JOIN task_resources o2 ON o2.project_id = r.project_id AND o2.resource = r.resource AND o2.task_id <> r.task_id
        JOIN task_leases l ON l.project_id = o2.project_id AND l.task_id = o2.task_id AND l.expires_at > ?
        WHERE r.project_id = ? AND r.task_id = ?`).get(nowIso, this.projectId, taskId) as Row | undefined;
      if (busy) throw new StoreError('RESOURCE_BUSY', `resource ${String(busy.resource)} is held by ${String(busy.task_id)}`);
      const token = Number(t.fencing_seq) + 1;
      const expiresAt = new Date(Date.parse(nowIso) + o.ttlMs).toISOString();
      const version = Number(t.version);
      this.db.prepare("UPDATE tasks SET state = 'RESERVED', version = version + 1, fencing_seq = ?, updated_at = ? WHERE project_id = ? AND id = ? AND version = ?")
        .run(token, nowIso, this.projectId, taskId, version);
      this.db.prepare('INSERT OR REPLACE INTO task_leases (project_id, task_id, owner_id, fencing_token, acquired_at, heartbeat_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(this.projectId, taskId, o.ownerId, token, nowIso, nowIso, expiresAt);
      const phaseId = String(t.phase_id);
      this.appendEvent({ eventType: 'TaskUpdated', phaseId, taskId, payload: { from: 'READY', to: 'RESERVED', reason: `lease ${o.ownerId}` } });
      this.appendEvent({ eventType: 'TaskReserved', phaseId, taskId, payload: { ownerId: o.ownerId, fencingToken: token, expiresAt, explanation: o.explanation } });
      return { fencingToken: token, version: version + 1, expiresAt };
    });
  }

  private assertLease(taskId: string, fencingToken: number): void {
    const l = this.db.prepare('SELECT fencing_token, expires_at FROM task_leases WHERE project_id = ? AND task_id = ?').get(this.projectId, taskId) as Row | undefined;
    if (!l || Number(l.fencing_token) !== fencingToken || String(l.expires_at) <= this.now()) {
      throw new StoreError('STALE_LEASE', `${taskId}: fencing token ${fencingToken} is not the current live lease`);
    }
  }

  /** Renova o lease; dono com token antigo é recusado (AER-REQ-046/047). */
  heartbeat(taskId: string, fencingToken: number, ttlMs: number): string {
    return this.inWriteTx(() => {
      this.assertLease(taskId, fencingToken);
      const nowIso = this.now();
      const expiresAt = new Date(Date.parse(nowIso) + ttlMs).toISOString();
      this.db.prepare('UPDATE task_leases SET heartbeat_at = ?, expires_at = ? WHERE project_id = ? AND task_id = ?').run(nowIso, expiresAt, this.projectId, taskId);
      return expiresAt;
    });
  }

  /** Transição feita por quem detém o lease: token antigo nunca publica conclusão tardia (AER-REQ-046). */
  transitionTaskFenced(taskId: string, to: TaskState, fencingToken: number, reason: string | null = null): number {
    return this.inWriteTx(() => {
      this.assertLease(taskId, fencingToken);
      const t = this.getTaskRow(taskId);
      return this.transitionTask(taskId, to, t.version, reason);
    });
  }

  /**
   * Leases vencidos (dono morto ou travado): RESERVED volta a READY (nada começou); RUNNING/VERIFYING vira
   * BLOCKED com motivo LEASE_EXPIRED e o attempt fica UNKNOWN. Nunca reinicia nada sozinho (§5.3-7).
   */
  expireLeases(): { taskId: string; to: TaskState }[] {
    return this.inWriteTx(() => {
      const nowIso = this.now();
      const expired = this.db.prepare(`SELECT l.task_id, t.state, t.version FROM task_leases l JOIN tasks t ON t.project_id = l.project_id AND t.id = l.task_id
        WHERE l.project_id = ? AND l.expires_at <= ? ORDER BY l.task_id`).all(this.projectId, nowIso) as Row[];
      const out: { taskId: string; to: TaskState }[] = [];
      for (const e of expired) {
        const taskId = String(e.task_id);
        const to: TaskState = e.state === 'RESERVED' ? 'READY' : 'BLOCKED';
        for (const a of this.db.prepare("SELECT id FROM attempts WHERE project_id = ? AND task_id = ? AND state = 'RUNNING'").all(this.projectId, taskId) as Row[]) {
          this.endAttempt(taskId, String(a.id), { state: 'UNKNOWN', exitCode: null, failureCode: 'LEASE_EXPIRED' });
        }
        this.transitionTask(taskId, to, Number(e.version), 'LEASE_EXPIRED');
        out.push({ taskId, to });
      }
      return out;
    });
  }

  private getTaskRow(taskId: string): TaskRow {
    const t = this.getTask(taskId);
    if (!t) throw new StoreError('NOT_FOUND', `task ${taskId} not found`);
    return t;
  }

  // ---------------------------------------------------------------- attempts

  startAttempt(taskId: string, fencingToken: number, a: { providerId: string; worktreePath?: string; branch?: string; baseCommit?: string }): string {
    return this.inWriteTx(() => {
      this.assertLease(taskId, fencingToken);
      const n = Number((this.db.prepare('SELECT count(*) n FROM attempts WHERE project_id = ? AND task_id = ?').get(this.projectId, taskId) as Row).n) + 1;
      const id = formatAttemptId(n);
      this.db.prepare(`INSERT INTO attempts (project_id, task_id, id, provider_id, state, fencing_token, worktree_path, branch, base_commit, started_at)
        VALUES (?, ?, ?, ?, 'RUNNING', ?, ?, ?, ?, ?)`).run(this.projectId, taskId, id, a.providerId, fencingToken, a.worktreePath ?? null, a.branch ?? null, a.baseCommit ?? null, this.now());
      this.appendEvent({ eventType: 'AttemptStarted', phaseId: this.getTaskRow(taskId).phaseId, taskId, attemptId: id, payload: { providerId: a.providerId, fencingToken, branch: a.branch ?? null, baseCommit: a.baseCommit ?? null } });
      return id;
    });
  }

  endAttempt(taskId: string, attemptId: string, r: { state: 'EXITED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN'; exitCode: number | null; failureCode: string | null }): void {
    this.inWriteTx(() => {
      const u = this.db.prepare("UPDATE attempts SET state = ?, exit_code = ?, failure_code = ?, ended_at = ? WHERE project_id = ? AND task_id = ? AND id = ? AND state = 'RUNNING'")
        .run(r.state, r.exitCode, r.failureCode, this.now(), this.projectId, taskId, attemptId);
      if (u.changes !== 1) throw new StoreError('NOT_FOUND', `running attempt ${taskId}/${attemptId} not found`);
      this.appendEvent({ eventType: 'AttemptExited', phaseId: this.getTaskRow(taskId).phaseId, taskId, attemptId, payload: r });
    });
  }

  listAttempts(taskId: string): AttemptRow[] {
    return (this.db.prepare('SELECT * FROM attempts WHERE project_id = ? AND task_id = ? ORDER BY id').all(this.projectId, taskId) as Row[]).map((r) => ({
      id: String(r.id), taskId, providerId: String(r.provider_id), state: r.state as AttemptRow['state'], fencingToken: Number(r.fencing_token),
      worktreePath: (r.worktree_path as string | null) ?? null, branch: (r.branch as string | null) ?? null, baseCommit: (r.base_commit as string | null) ?? null,
      exitCode: r.exit_code === null ? null : Number(r.exit_code),
    }));
  }

  // ---------------------------------------------------------------- travas (fila de merge)

  /** Trava nomeada com expiração (p.ex. merge:main): um dono por vez, entre processos (AER-REQ-056). */
  acquireLock(name: string, ownerId: string, ttlMs: number): boolean {
    return this.inWriteTx(() => {
      const nowIso = this.now();
      const cur = this.db.prepare('SELECT owner_id, expires_at FROM locks WHERE project_id = ? AND name = ?').get(this.projectId, name) as Row | undefined;
      if (cur && String(cur.expires_at) > nowIso && cur.owner_id !== ownerId) return false;
      this.db.prepare('INSERT OR REPLACE INTO locks (project_id, name, owner_id, acquired_at, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(this.projectId, name, ownerId, nowIso, new Date(Date.parse(nowIso) + ttlMs).toISOString());
      return true;
    });
  }

  releaseLock(name: string, ownerId: string): void {
    this.inWriteTx(() => {
      this.db.prepare('DELETE FROM locks WHERE project_id = ? AND name = ? AND owner_id = ?').run(this.projectId, name, ownerId);
    });
  }

  // ---------------------------------------------------------------- evidências (TAR-0026)

  recordArtifact(taskId: string, a: { kind: 'EVIDENCE' | 'LOG' | 'REPORT' | 'DIFF'; relativePath: string; sha256: string; note?: string; attemptId?: string }): number {
    if (/^([a-zA-Z]:[\\/]|[\\/])/.test(a.relativePath) || a.relativePath.split(/[\\/]/).includes('..')) {
      throw new StoreError('INVALID_INPUT', `artifact path must be relative to the project: ${a.relativePath}`);
    }
    if (!/^[0-9a-f]{64}$/.test(a.sha256)) throw new StoreError('INVALID_INPUT', 'sha256 must be 64 hex chars');
    return this.inWriteTx(() => {
      this.getTaskRow(taskId);
      const r = this.db.prepare('INSERT INTO artifacts (project_id, task_id, attempt_id, kind, relative_path, sha256, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(this.projectId, taskId, a.attemptId ?? null, a.kind, a.relativePath.split('\\').join('/'), a.sha256, a.note ?? null, this.now());
      return Number(r.lastInsertRowid);
    });
  }

  listArtifacts(taskId: string): { id: number; kind: string; relativePath: string; sha256: string; note: string | null }[] {
    return (this.db.prepare('SELECT id, kind, relative_path, sha256, note FROM artifacts WHERE project_id = ? AND task_id = ? ORDER BY id').all(this.projectId, taskId) as Row[])
      .map((r) => ({ id: Number(r.id), kind: String(r.kind), relativePath: String(r.relative_path), sha256: String(r.sha256), note: (r.note as string | null) ?? null }));
  }

  /** Registra um test run REAL (comando, exit code, contagens, ambiente) + evento TestRunCompleted (AER-REQ-186). */
  recordTestRun(taskId: string, t: TestRunInput): number {
    for (const k of ['total', 'passed', 'failed', 'skipped'] as const) if (!Number.isInteger(t[k]) || t[k] < 0) throw new StoreError('INVALID_INPUT', `${k} must be an integer >= 0`);
    return this.inWriteTx(() => {
      const task = this.getTaskRow(taskId);
      const r = this.db.prepare(`INSERT INTO test_runs (project_id, task_id, attempt_id, command, exit_code, total, passed, failed, skipped, environment, started_at, ended_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(this.projectId, taskId, t.attemptId ?? null, t.command, t.exitCode, t.total, t.passed, t.failed, t.skipped, t.environment, t.startedAt, t.endedAt);
      this.appendEvent({ eventType: 'TestRunCompleted', phaseId: task.phaseId, taskId, payload: { command: t.command, exitCode: t.exitCode, total: t.total, passed: t.passed, failed: t.failed, skipped: t.skipped } });
      return Number(r.lastInsertRowid);
    });
  }

  latestTestRun(taskId: string): { exitCode: number; failed: number; command: string } | undefined {
    const r = this.db.prepare('SELECT exit_code, failed, command FROM test_runs WHERE project_id = ? AND task_id = ? ORDER BY id DESC LIMIT 1').get(this.projectId, taskId) as Row | undefined;
    return r ? { exitCode: Number(r.exit_code), failed: Number(r.failed), command: String(r.command) } : undefined;
  }

  /** DoD mínimo (§5.6): COMPLETED exige evidência ou test run, e o último test run não pode estar falhando (AER-REQ-158/189). */
  private assertEvidence(taskId: string): void {
    const last = this.latestTestRun(taskId);
    if (last && (last.exitCode !== 0 || last.failed > 0)) {
      throw new StoreError('TESTS_FAILING', `${taskId}: last test run failed (${last.command}: exit ${last.exitCode}, ${last.failed} failed)`);
    }
    const artifacts = Number((this.db.prepare('SELECT count(*) n FROM artifacts WHERE project_id = ? AND task_id = ?').get(this.projectId, taskId) as Row).n);
    if (!last && artifacts === 0) throw new StoreError('EVIDENCE_REQUIRED', `${taskId} cannot be COMPLETED without evidence or a recorded test run`);
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
