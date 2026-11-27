import { createHash, randomUUID } from 'node:crypto';
import {
  EVENT_TYPES, PHASE_STATES, TASK_STATES, canTransitionPhase, canTransitionTask, formatAttemptId, formatPhaseId, formatTaskId,
  payloadSha256, redactText, sha256Hex, validatePayload, type EventEnvelope, type EventType, type PhaseState, type TaskState,
} from '@aer/contracts';
import { DECISION_STATES, PRIORITIES, REQUIREMENT_STATES, type DecisionState, type RequirementState } from '@aer/ases-methodology';
import { openDatabase, withBusyRetry, type OpenResult } from './database.ts';
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
  /** extensões (EXT-XXXX) que a tarefa usa; o worker só inicia se forem VERIFIED e compatíveis com o provider */
  extensions: string[];
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
  extensions?: string[];
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
  failureCode: string | null;
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
// ===== PHASE-09: metodologia ASES-300/500 (ADR-0014) =====
export interface GeneralRequirementInput {
  id: string;
  title: string;
  classification: string;
  priority: string;
  group: string;
  text: string;
  textSha256: string;
  acceptance: string;
}

export interface RequirementRow {
  id: string;
  series: 'GENERAL' | 'DOMAIN';
  title: string;
  classification: string;
  priority: string;
  group: string;
  text: string;
  textSha256: string;
  acceptance: string;
  origin: string;
  dependencies: string[];
  status: RequirementState;
  note: string | null;
  evidencePath: string | null;
  evidenceSha256: string | null;
  approvedBy: string | null;
  version: number;
}

const GENESIS = '0'.repeat(64);

export interface IssueRow {
  id: string;
  title: string;
  symptom: string;
  repro: string | null;
  taskId: string | null;
  state: 'OPEN' | 'RESOLVED';
  resolution: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

export const LESSON_STATES = ['PROPOSED', 'ACTIVE', 'ARCHIVED'] as const;
export type LessonState = (typeof LESSON_STATES)[number];
export interface LessonRow {
  id: string;
  text: string;
  state: LessonState;
  source: string | null;
  approvedBy: string | null;
  createdAt: string;
}

export interface DecisionRow {
  id: string;
  questionId: string;
  question: string;
  answer: string;
  state: DecisionState;
  changeId: string | null;
  createdAt: string;
}

export interface ChangeRow {
  id: string;
  reason: string;
  targets: string[];
  approvedBy: string;
  createdAt: string;
}

// ===== PHASE-10: approvals e extensões (ADR-0015) =====
export type ApprovalState = 'PENDING' | 'GRANTED' | 'DENIED' | 'EXPIRED' | 'CONSUMED';
// ---- PHASE-18: conversa com a IA principal ----
export type ChatMode = 'manual' | 'auto' | 'hybrid';
export type ChatRole = 'user' | 'main' | 'system';
export type TaskKind = 'code' | 'test' | 'docs' | 'review' | 'other';
export interface PlannedTask { title: string; instructions: string; provider: string; kind: TaskKind; dependsOn: number[] }
export interface ConversationRow { id: string; main: string; mode: ChatMode; phaseId: string | null; startedAt: string }
export interface ChatMessageRow { n: number; role: ChatRole; provider: string | null; text: string; createdAt: string }
export type PlanState = 'PENDING' | 'APPROVED' | 'CANCELLED' | 'RUNNING' | 'DONE';
export interface PlanRow { id: string; conversationId: string; state: PlanState; tasks: PlannedTask[]; reasons: string[]; createdAt: string }
export interface RestorePointRow { n: number; ref: string; commit: string; files: string[]; appliedAt: string | null }
const CHAT_MODES: readonly string[] = ['manual', 'auto', 'hybrid'];

export interface ApprovalRow {
  id: string;
  scope: string;
  subject: string;
  operationHash: string;
  description: string;
  taskId: string | null;
  state: ApprovalState;
  decidedBy: string | null;
  expiresAt: string | null;
}
export type ExtensionState = 'DISCOVERED' | 'INSPECTED' | 'APPROVED' | 'INSTALLED' | 'VERIFIED' | 'FAILED' | 'REJECTED';
export interface ExtensionRow {
  id: string;
  kind: 'SKILL' | 'MCP' | 'PLUGIN';
  name: string;
  origin: string;
  scope: string;
  manifestSha256: string;
  state: ExtensionState;
  verdict: string | null;
  findings: { code: string; severity: string; path: string; detail: string }[];
  compatibility: Record<string, string>;
  detail: Record<string, unknown>;
}
export interface ExtensionInput {
  kind: ExtensionRow['kind'];
  name: string;
  origin: string;
  scope: string;
  manifestSha256: string;
  verdict: string;
  findings: ExtensionRow['findings'];
  compatibility: Record<string, string>;
  detail?: Record<string, unknown>;
}
const EXT_EDGES: Record<ExtensionState, readonly ExtensionState[]> = {
  DISCOVERED: ['INSPECTED', 'REJECTED'], INSPECTED: ['APPROVED', 'REJECTED'], APPROVED: ['INSTALLED', 'FAILED', 'REJECTED'],
  INSTALLED: ['VERIFIED', 'FAILED', 'REJECTED'], VERIFIED: ['REJECTED'], FAILED: ['INSPECTED', 'REJECTED'], REJECTED: ['INSPECTED'],
};

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
      store.extendChain(); // bancos de versões anteriores ganham a cadeia ao abrir
    });
    return store;
  }

  close(): void {
    this.db.close();
  }

  /** Transação de escrita (BEGIN IMMEDIATE): commit se fn retornar, rollback se lançar. */
  tx<T>(fn: () => T): T {
    if (this.inTx) throw new StoreError('NESTED_TRANSACTION', 'nested transactions are not supported');
    // BEGIN IMMEDIATE pode devolver BUSY sem passar pelo busy_timeout com vários processos (CI Windows arm64, run 45191096847)
    withBusyRetry(() => this.db.exec('BEGIN IMMEDIATE'));
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
      this.extendChain();
      return { seq: Number(r.lastInsertRowid), inserted: true };
    });
  }

  /** PHASE-27: elo da cadeia = SHA-256 do elo anterior + os campos do evento (inclui o hash do payload). */
  static chainLink(prev: string, e: EventEnvelope): string {
    return sha256Hex([prev, e.seq, e.eventId, e.eventType, e.phaseId ?? '', e.taskId ?? '', e.attemptId ?? '', e.occurredAt, e.observedAt, e.actor, e.payloadSha256].join('|'));
  }

  /** Calcula os elos que faltam, em ordem (dentro da transação de quem chama). */
  private extendChain(): void {
    const last = this.db.prepare('SELECT seq, hash FROM event_chain ORDER BY seq DESC LIMIT 1').get() as Row | undefined;
    let prev = last ? String(last.hash) : GENESIS;
    let after = last ? Number(last.seq) : 0;
    const ins = this.db.prepare('INSERT INTO event_chain (seq, hash) VALUES (?, ?)');
    for (;;) {
      const page = this.eventsSince(after, 1000);
      if (!page.length) break;
      for (const e of page) {
        prev = ProjectStore.chainLink(prev, e);
        ins.run(e.seq, prev);
        after = e.seq;
      }
    }
  }

  chainHead(): { seq: number; hash: string } {
    const r = this.db.prepare('SELECT seq, hash FROM event_chain ORDER BY seq DESC LIMIT 1').get() as Row | undefined;
    return r ? { seq: Number(r.seq), hash: String(r.hash) } : { seq: 0, hash: GENESIS };
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
      if (this.hasRequirements()) {
        // metodologia ativa: toda tarefa aponta para requisitos existentes (AER-REQ-157)
        if (!reqs.length) throw new StoreError('REQUIREMENT_REQUIRED', 'this project uses the ASES matrix: a task must cite at least one requirement (--reqs)');
        for (const [k, req] of reqs.entries()) if (namespaces[k] === 'ASES' && !this.getRequirement(req)) throw new StoreError('NOT_FOUND', `requirement ${req} not found in the matrix`);
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
      for (const e of new Set(input.extensions ?? [])) {
        if (!this.db.prepare('SELECT 1 FROM extensions WHERE project_id = ? AND id = ?').get(this.projectId, e)) throw new StoreError('NOT_FOUND', `extension ${e} not found`);
        this.db.prepare('INSERT INTO task_extensions (project_id, task_id, extension_id) VALUES (?, ?, ?)').run(this.projectId, id, e);
      }
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

  /** Nova ordem de exibição/execução das fases; os IDs nunca mudam (AER-REQ-027). `order` deve listar todas as fases. */
  reorderPhases(order: readonly string[]): void {
    this.inWriteTx(() => {
      const phases = this.listPhases();
      const ids = new Set(phases.map((p) => p.id));
      if (order.length !== ids.size || new Set(order).size !== order.length || order.some((id) => !ids.has(id))) {
        throw new StoreError('INVALID_INPUT', `order must list every phase exactly once: ${[...ids].join(', ')}`);
      }
      order.forEach((id, i) => {
        const p = phases.find((x) => x.id === id)!;
        if (p.sortOrder === i + 1) return;
        this.db.prepare('UPDATE phases SET sort_order = ?, version = version + 1, updated_at = ? WHERE project_id = ? AND id = ?').run(i + 1, this.now(), this.projectId, id);
        this.appendEvent({ eventType: 'PhaseUpdated', phaseId: id, payload: { from: p.state, to: p.state, reason: `reordenada: posição ${p.sortOrder} -> ${i + 1}`, sortOrder: i + 1 } });
      });
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
    const exts = this.db.prepare('SELECT extension_id e FROM task_extensions WHERE project_id = ? AND task_id = ? ORDER BY e');
    return rows.map((r) => ({
      id: String(r.id), phaseId: String(r.phase_id), title: String(r.title), description: String(r.description), state: r.state as TaskState,
      priority: Number(r.priority), risk: r.risk as Risk, version: Number(r.version),
      reqs: (reqs.all(this.projectId, r.id as string) as Row[]).map((x) => String(x.req_id)),
      dependsOn: (deps.all(this.projectId, r.id as string) as Row[]).map((x) => String(x.d)),
      resources: (res.all(this.projectId, r.id as string) as Row[]).map((x) => String(x.resource)),
      provider: (r.provider as string | null) ?? null,
      extensions: (exts.all(this.projectId, r.id as string) as Row[]).map((x) => String(x.e)),
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
      // `claude:sonnet` conta como `claude`: o limite é por provider, não por preferência de modelo/cenário
      const provider = ((t.provider as string | null) ?? '').split(':')[0] || null;
      if (provider && o.maxPerProvider?.[provider] !== undefined) {
        const n = Number((this.db.prepare(`SELECT count(*) n FROM task_leases l JOIN tasks x ON x.project_id = l.project_id AND x.id = l.task_id
          WHERE l.project_id = ? AND l.expires_at > ? AND (x.provider = ? OR x.provider LIKE ? || ':%')`).get(this.projectId, nowIso, provider, provider) as Row).n);
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

  /** Fim do cooldown do provider após o último RATE_LIMITED, se ainda vigente (AER-REQ-048). */
  providerCooldownUntil(providerId: string, cooldownMs: number): string | undefined {
    const r = this.db.prepare("SELECT MAX(ended_at) AS t FROM attempts WHERE project_id = ? AND provider_id = ? AND failure_code = 'RATE_LIMITED'").get(this.projectId, providerId) as Row;
    if (!r.t) return undefined;
    const until = new Date(Date.parse(String(r.t)) + cooldownMs).toISOString();
    return until > this.now() ? until : undefined;
  }

  listAttempts(taskId: string): AttemptRow[] {
    return (this.db.prepare('SELECT * FROM attempts WHERE project_id = ? AND task_id = ? ORDER BY id').all(this.projectId, taskId) as Row[]).map((r) => ({
      id: String(r.id), taskId, providerId: String(r.provider_id), state: r.state as AttemptRow['state'], fencingToken: Number(r.fencing_token),
      worktreePath: (r.worktree_path as string | null) ?? null, branch: (r.branch as string | null) ?? null, baseCommit: (r.base_commit as string | null) ?? null,
      exitCode: r.exit_code === null ? null : Number(r.exit_code), failureCode: (r.failure_code as string | null) ?? null,
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

  listTestRuns(taskId: string): { id: number; command: string; exitCode: number; total: number; passed: number; failed: number; skipped: number; environment: string; startedAt: string; endedAt: string; attemptId: string | null }[] {
    return (this.db.prepare('SELECT * FROM test_runs WHERE project_id = ? AND task_id = ? ORDER BY id').all(this.projectId, taskId) as Row[]).map((r) => ({
      id: Number(r.id), command: String(r.command), exitCode: Number(r.exit_code), total: Number(r.total), passed: Number(r.passed), failed: Number(r.failed), skipped: Number(r.skipped),
      environment: String(r.environment), startedAt: String(r.started_at), endedAt: String(r.ended_at), attemptId: (r.attempt_id as string | null) ?? null,
    }));
  }

  /** Troca o provider de uma tarefa parada (handoff). Tarefa com lease ativo não muda de executor no meio. */
  setTaskProvider(taskId: string, provider: string): void {
    this.inWriteTx(() => {
      this.getTaskRow(taskId);
      if (this.db.prepare('SELECT 1 FROM task_leases WHERE project_id = ? AND task_id = ?').get(this.projectId, taskId)) throw new StoreError('LEASED', `${taskId} is running; cancel it before a handoff`);
      this.db.prepare('UPDATE tasks SET provider = ?, updated_at = ? WHERE project_id = ? AND id = ?').run(provider, this.now(), this.projectId, taskId);
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

  // ===== PHASE-09: metodologia ASES-300/500 =====

  private hasRequirements(): boolean {
    return !!this.db.prepare('SELECT 1 FROM requirements WHERE project_id = ? LIMIT 1').get(this.projectId);
  }

  /**
   * Registra uma fonte ASES (SHA-256) e, para o ASES-300, os 300 REQ gerais literais. Idempotente: reimportar o mesmo
   * texto não muda nada; texto diferente para um REQ já importado é recusado (o núcleo geral nunca é reescrito, AER-REQ-152).
   */
  importMethodologySource(key: string, relativePath: string, sourceSha256: string, general: readonly GeneralRequirementInput[] = []): { inserted: number } {
    return this.inWriteTx(() => {
      let inserted = 0;
      const now = this.now();
      for (const r of general) {
        const cur = this.db.prepare('SELECT text_sha256 FROM requirements WHERE project_id = ? AND id = ?').get(this.projectId, r.id) as Row | undefined;
        if (cur) {
          if (cur.text_sha256 !== r.textSha256) throw new StoreError('SOURCE_CONFLICT', `${r.id} already imported with different text; general requirements are never rewritten`);
          continue;
        }
        this.db.prepare(`INSERT INTO requirements (project_id, id, series, title, classification, priority, grp, text, text_sha256, acceptance, origin, updated_at)
          VALUES (?, ?, 'GENERAL', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(this.projectId, r.id, r.title, r.classification, r.priority, r.group, r.text, r.textSha256, r.acceptance, `${relativePath}#${r.id}`, now);
        inserted++;
      }
      this.db.prepare(`INSERT INTO methodology_sources (project_id, key, relative_path, sha256, imported_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (project_id, key) DO UPDATE SET relative_path = excluded.relative_path, sha256 = excluded.sha256, imported_at = excluded.imported_at`)
        .run(this.projectId, key, relativePath, sourceSha256, now);
      this.appendEvent({ eventType: 'MethodologySourceImported', payload: { key, path: relativePath, sha256: sourceSha256, requirements: inserted } });
      return { inserted };
    });
  }

  listMethodologySources(): { key: string; relativePath: string; sha256: string }[] {
    return (this.db.prepare('SELECT key, relative_path, sha256 FROM methodology_sources WHERE project_id = ? ORDER BY key').all(this.projectId) as Row[])
      .map((r) => ({ key: String(r.key), relativePath: String(r.relative_path), sha256: String(r.sha256) }));
  }

  private toRequirement(r: Row): RequirementRow {
    return {
      id: String(r.id), series: r.series as RequirementRow['series'], title: String(r.title), classification: String(r.classification), priority: String(r.priority),
      group: String(r.grp), text: String(r.text), textSha256: String(r.text_sha256), acceptance: String(r.acceptance), origin: String(r.origin),
      dependencies: JSON.parse(String(r.dependencies)) as string[], status: r.status as RequirementState, note: (r.note as string | null) ?? null,
      evidencePath: (r.evidence_path as string | null) ?? null, evidenceSha256: (r.evidence_sha256 as string | null) ?? null, approvedBy: (r.approved_by as string | null) ?? null, version: Number(r.version),
    };
  }

  listRequirements(series?: 'GENERAL' | 'DOMAIN'): RequirementRow[] {
    const rows = series
      ? this.db.prepare('SELECT * FROM requirements WHERE project_id = ? AND series = ? ORDER BY id').all(this.projectId, series)
      : this.db.prepare('SELECT * FROM requirements WHERE project_id = ? ORDER BY id').all(this.projectId);
    return (rows as Row[]).map((r) => this.toRequirement(r));
  }

  getRequirement(id: string): RequirementRow | undefined {
    const r = this.db.prepare('SELECT * FROM requirements WHERE project_id = ? AND id = ?').get(this.projectId, id) as Row | undefined;
    return r ? this.toRequirement(r) : undefined;
  }

  private requireRequirement(id: string): RequirementRow {
    const r = this.getRequirement(id);
    if (!r) throw new StoreError('NOT_FOUND', `requirement ${id} not found`);
    return r;
  }

  /** Requisito específico do projeto: REQ-301+ (§13.3), com critério de aceite verificável e origem. */
  createDomainRequirement(i: { title: string; acceptance: string; priority: string; origin: string; dependencies?: string[] }): string {
    if (!i.title.trim()) throw new StoreError('INVALID_INPUT', 'requirement title is required');
    if (!i.acceptance.trim()) throw new StoreError('INVALID_INPUT', 'a verifiable acceptance criterion is required');
    if (!i.origin.trim()) throw new StoreError('INVALID_INPUT', 'requirement origin is required (p.ex. DEC-0001)');
    if (!(PRIORITIES as readonly string[]).includes(i.priority)) throw new StoreError('INVALID_INPUT', `priority must be one of ${PRIORITIES.join(', ')}`);
    return this.inWriteTx(() => {
      for (const d of i.dependencies ?? []) this.requireRequirement(d);
      const max = Number((this.db.prepare("SELECT max(CAST(substr(id, 5) AS INTEGER)) m FROM requirements WHERE project_id = ? AND series = 'DOMAIN'").get(this.projectId) as Row).m ?? 300);
      const id = `REQ-${String(Math.max(300, max) + 1).padStart(3, '0')}`;
      const text = domainText(id, i.title, i.acceptance);
      this.db.prepare(`INSERT INTO requirements (project_id, id, series, title, classification, priority, text, text_sha256, acceptance, origin, dependencies, updated_at)
        VALUES (?, ?, 'DOMAIN', ?, 'DOMAIN', ?, ?, ?, ?, ?, ?, ?)`).run(this.projectId, id, i.title.trim(), i.priority, text, sha256(text), i.acceptance.trim(), i.origin.trim(), JSON.stringify(i.dependencies ?? []), this.now());
      this.appendEvent({ eventType: 'RequirementCreated', payload: { id, title: i.title.trim(), priority: i.priority, origin: i.origin.trim() } });
      return id;
    });
  }

  /** Aprovação humana de um requisito de domínio (G1). Depois dela, mudar o conteúdo exige CHANGE (AER-REQ-159). */
  approveRequirement(id: string, approvedBy: string): void {
    if (!approvedBy.trim()) throw new StoreError('INVALID_INPUT', 'approvedBy is required');
    this.inWriteTx(() => {
      const r = this.requireRequirement(id);
      if (r.series !== 'DOMAIN') throw new StoreError('INVALID_INPUT', `${id} is a general ASES-300 requirement; only its status/applicability changes`);
      this.db.prepare('UPDATE requirements SET approved_by = ?, version = version + 1, updated_at = ? WHERE project_id = ? AND id = ?').run(approvedBy.trim(), this.now(), this.projectId, id);
      this.appendEvent({ eventType: 'RequirementUpdated', payload: { id, field: 'approval', from: r.approvedBy, to: approvedBy.trim(), note: null, changeId: null } });
    });
  }

  /**
   * Estado do requisito (fonte ASES-300 24.2): PASS exige evidência real (arquivo + SHA-256); N/A, FAIL e BLOCKED exigem
   * justificativa; N/A num CORE exige quem aprovou a exceção. Diferencia "não aplicável" de "não implementado".
   */
  setRequirementStatus(id: string, status: string, o: { note?: string; evidence?: { path: string; sha256: string }; approvedBy?: string } = {}): void {
    if (!(REQUIREMENT_STATES as readonly string[]).includes(status)) throw new StoreError('INVALID_INPUT', `status must be one of ${REQUIREMENT_STATES.join(', ')}`);
    const note = o.note?.trim() || null;
    if (status === 'PASS' && !o.evidence) throw new StoreError('EVIDENCE_REQUIRED', `${id}: PASS requires evidence (file inside the project)`);
    if ((status === 'N/A' || status === 'FAIL' || status === 'BLOCKED') && !note) throw new StoreError('JUSTIFICATION_REQUIRED', `${id}: ${status} requires a justification`);
    this.inWriteTx(() => {
      const r = this.requireRequirement(id);
      if (status === 'N/A' && r.classification === 'CORE' && !o.approvedBy?.trim()) {
        throw new StoreError('APPROVAL_REQUIRED', `${id} is CORE: N/A only as an explicitly approved exception (--approved-by)`);
      }
      const ev = status === 'PASS' ? o.evidence! : { path: r.evidencePath, sha256: r.evidenceSha256 };
      const fullNote = status === 'N/A' && o.approvedBy?.trim() ? `${note} (exceção aprovada por ${o.approvedBy.trim()})` : note;
      this.db.prepare('UPDATE requirements SET status = ?, note = ?, evidence_path = ?, evidence_sha256 = ?, version = version + 1, updated_at = ? WHERE project_id = ? AND id = ?')
        .run(status, fullNote, ev.path, ev.sha256, this.now(), this.projectId, id);
      this.appendEvent({ eventType: 'RequirementUpdated', payload: { id, field: 'status', from: r.status, to: status, note: fullNote ?? (status === 'PASS' ? `evidence ${ev.path}` : null), changeId: null } });
    });
  }

  /** Conteúdo de requisito de domínio: livre até a aprovação; depois, só com CHANGE que cite o requisito (AER-REQ-159). */
  editDomainRequirement(id: string, i: { title?: string; acceptance?: string }, changeId?: string): void {
    this.inWriteTx(() => {
      const r = this.requireRequirement(id);
      if (r.series !== 'DOMAIN') throw new StoreError('INVALID_INPUT', `${id} is a general ASES-300 requirement and is never rewritten`);
      if (r.approvedBy) this.requireChangeFor(changeId, id);
      const title = i.title?.trim() || r.title;
      const acceptance = i.acceptance?.trim() || r.acceptance;
      const text = domainText(id, title, acceptance);
      this.db.prepare('UPDATE requirements SET title = ?, acceptance = ?, text = ?, text_sha256 = ?, version = version + 1, updated_at = ? WHERE project_id = ? AND id = ?')
        .run(title, acceptance, text, sha256(text), this.now(), this.projectId, id);
      this.appendEvent({ eventType: 'RequirementUpdated', payload: { id, field: 'content', from: r.textSha256, to: sha256(text), note: null, changeId: changeId ?? null } });
    });
  }

  private requireChangeFor(changeId: string | undefined, target: string): void {
    if (!changeId) throw new StoreError('CHANGE_REQUIRED', `${target} is already approved/confirmed; a CHANGE-XXXX citing it is required (AER-REQ-159)`);
    const c = this.getChange(changeId);
    if (!c) throw new StoreError('NOT_FOUND', `change ${changeId} not found`);
    if (!c.targets.includes(target)) throw new StoreError('CHANGE_REQUIRED', `${changeId} does not cite ${target}`);
  }

  /** PHASE-25 (lições do ESAA): uma lição nasce PROPOSED e só entra nas instruções das IAs depois que uma pessoa a aprova. */
  addLesson(i: { text: string; source?: string }): string {
    if (!i.text.trim()) throw new StoreError('INVALID_INPUT', 'lesson text is required');
    return this.inWriteTx(() => {
      const n = Number((this.db.prepare('SELECT count(*) n FROM lessons WHERE project_id = ?').get(this.projectId) as Row).n) + 1;
      const id = `LES-${String(n).padStart(4, '0')}`;
      this.db.prepare("INSERT INTO lessons (project_id, id, text, state, source, approved_by, created_at) VALUES (?, ?, ?, 'PROPOSED', ?, NULL, ?)")
        .run(this.projectId, id, i.text.trim(), i.source ?? null, this.now());
      this.appendEvent({ eventType: 'LessonRecorded', payload: { id, source: i.source ?? null } });
      return id;
    });
  }

  setLessonState(id: string, state: LessonState, by: string): void {
    if (!(LESSON_STATES as readonly string[]).includes(state)) throw new StoreError('INVALID_INPUT', `state must be one of ${LESSON_STATES.join(', ')}`);
    if (!by.trim()) throw new StoreError('INVALID_INPUT', 'a person must approve or archive a lesson');
    this.inWriteTx(() => {
      const cur = this.listLessons().find((l) => l.id === id);
      if (!cur) throw new StoreError('NOT_FOUND', `lesson ${id} not found`);
      this.db.prepare('UPDATE lessons SET state = ?, approved_by = ? WHERE project_id = ? AND id = ?').run(state, state === 'ACTIVE' ? by.trim() : cur.approvedBy, this.projectId, id);
      this.appendEvent({ eventType: 'LessonUpdated', payload: { id, from: cur.state, to: state, by: by.trim() } });
    });
  }

  /**
   * PHASE-26 (verify/replay do ESAA): refaz o estado de fases, tarefas e lições a partir dos eventos e compara com o banco;
   * também confere a sequência e o hash de cada evento. Itens importados do legado sem eventos não têm o que conferir.
   */
  verifyState(o: { pin?: { seq: number; hash: string } } = {}): { events: number; checked: number; problems: string[]; head: { seq: number; hash: string } } {
    const problems: string[] = [];
    const replay = new Map<string, string>();
    const stored = new Map((this.db.prepare('SELECT seq, hash FROM event_chain').all() as Row[]).map((r) => [Number(r.seq), String(r.hash)]));
    let link = GENESIS;
    let chainBroken = false;
    let events = 0;
    let last = 0;
    for (;;) {
      const page = this.eventsSince(last, 1000);
      if (!page.length) break;
      for (const e of page) {
        events++;
        if (e.seq !== last + 1) problems.push(`evento seq ${e.seq}: esperado ${last + 1} (lacuna no histórico)`);
        last = e.seq;
        if (payloadSha256(e.payload) !== e.payloadSha256) problems.push(`evento seq ${e.seq}: conteúdo não bate com o hash`);
        link = ProjectStore.chainLink(link, e);
        if (!chainBroken && stored.get(e.seq) !== link) {
          // só o primeiro elo quebrado interessa: dali em diante todos divergem
          problems.push(`cadeia de integridade quebrada no evento seq ${e.seq}: o histórico foi alterado depois de gravado`);
          chainBroken = true;
        }
        if (o.pin && e.seq === o.pin.seq && stored.get(e.seq) !== o.pin.hash) problems.push(`o ponto fixado (seq ${o.pin.seq}) não confere: o histórico foi reescrito desde que foi fixado`);
        const p = e.payload as Record<string, unknown>;
        if (e.eventType === 'PhaseCreated' && e.phaseId) replay.set(e.phaseId, 'PLANNED');
        else if (e.eventType === 'PhaseUpdated' && e.phaseId) replay.set(e.phaseId, String(p.to));
        else if (e.eventType === 'TaskCreated' && e.taskId) replay.set(e.taskId, 'PLANNED');
        else if (e.eventType === 'TaskUpdated' && e.taskId) replay.set(e.taskId, String(p.to));
        else if (e.eventType === 'LessonRecorded') replay.set(String(p.id), 'PROPOSED');
        else if (e.eventType === 'LessonUpdated') replay.set(String(p.id), String(p.to));
        else if (e.eventType === 'IssueReported') replay.set(String(p.id), 'OPEN');
        else if (e.eventType === 'IssueResolved') replay.set(String(p.id), 'RESOLVED');
      }
    }
    const actual = [...this.listPhases(), ...this.listTasks(), ...this.listLessons(), ...this.listIssues()];
    let checked = 0;
    for (const x of actual) {
      const want = replay.get(x.id);
      if (want === undefined) continue; // legado sem eventos
      checked++;
      if (want !== x.state) problems.push(`${x.id}: o banco diz ${x.state}, o histórico diz ${want}`);
    }
    if (o.pin && o.pin.seq > last) problems.push(`o ponto fixado (seq ${o.pin.seq}) não existe mais: o histórico foi encurtado`);
    return { events, checked, problems, head: this.chainHead() };
  }

  /** PHASE-27 (issues do ESAA): problema com sintoma e passos para reproduzir; só uma pessoa o dá por resolvido. */
  reportIssue(i: { title: string; symptom: string; repro?: string; taskId?: string }): string {
    if (!i.title.trim() || !i.symptom.trim()) throw new StoreError('INVALID_INPUT', 'issue title and symptom are required');
    return this.inWriteTx(() => {
      const n = Number((this.db.prepare('SELECT count(*) n FROM issues WHERE project_id = ?').get(this.projectId) as Row).n) + 1;
      const id = `ISS-${String(n).padStart(4, '0')}`;
      this.db.prepare("INSERT INTO issues (project_id, id, title, symptom, repro, task_id, state, created_at) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)")
        .run(this.projectId, id, i.title.trim(), i.symptom.trim(), i.repro?.trim() || null, i.taskId ?? null, this.now());
      this.appendEvent({ eventType: 'IssueReported', taskId: i.taskId ?? null, payload: { id, title: i.title.trim() } });
      return id;
    });
  }

  resolveIssue(id: string, resolution: string, by: string): void {
    if (!resolution.trim() || !by.trim()) throw new StoreError('INVALID_INPUT', 'resolution and who resolved are required');
    this.inWriteTx(() => {
      const cur = this.listIssues().find((x) => x.id === id);
      if (!cur) throw new StoreError('NOT_FOUND', `issue ${id} not found`);
      if (cur.state === 'RESOLVED') throw new StoreError('INVALID_TRANSITION', `${id} is already resolved`);
      this.db.prepare("UPDATE issues SET state = 'RESOLVED', resolution = ?, resolved_by = ?, resolved_at = ? WHERE project_id = ? AND id = ?").run(resolution.trim(), by.trim(), this.now(), this.projectId, id);
      this.appendEvent({ eventType: 'IssueResolved', taskId: cur.taskId, payload: { id, by: by.trim() } });
    });
  }

  listIssues(): IssueRow[] {
    return (this.db.prepare('SELECT * FROM issues WHERE project_id = ? ORDER BY id').all(this.projectId) as Row[]).map((r) => ({
      id: String(r.id), title: String(r.title), symptom: String(r.symptom), repro: (r.repro as string | null) ?? null, taskId: (r.task_id as string | null) ?? null,
      state: r.state as IssueRow['state'], resolution: (r.resolution as string | null) ?? null, resolvedBy: (r.resolved_by as string | null) ?? null, createdAt: String(r.created_at),
    }));
  }

  listLessons(): LessonRow[] {
    return (this.db.prepare('SELECT * FROM lessons WHERE project_id = ? ORDER BY id').all(this.projectId) as Row[]).map((r) => ({
      id: String(r.id), text: String(r.text), state: r.state as LessonState, source: (r.source as string | null) ?? null,
      approvedBy: (r.approved_by as string | null) ?? null, createdAt: String(r.created_at),
    }));
  }

  activeLessons(): LessonRow[] {
    return this.listLessons().filter((l) => l.state === 'ACTIVE');
  }

  listDecisions(): DecisionRow[] {
    return (this.db.prepare('SELECT * FROM decisions WHERE project_id = ? ORDER BY id').all(this.projectId) as Row[]).map((r) => ({
      id: String(r.id), questionId: String(r.question_id), question: String(r.question), answer: String(r.answer), state: r.state as DecisionState,
      changeId: (r.change_id as string | null) ?? null, createdAt: String(r.created_at),
    }));
  }

  /**
   * Decisão da entrevista ASES-500. A decisão vigente anterior da mesma pergunta vira SUPERSEDED (preservada).
   * Substituir uma decisão CONFIRMED exige CHANGE (§13.6: nenhuma edição silenciosa de decisão confirmada).
   */
  recordDecision(i: { questionId: string; question: string; answer: string; state: string; changeId?: string }): string {
    if (!(DECISION_STATES as readonly string[]).includes(i.state) || i.state === 'SUPERSEDED') throw new StoreError('INVALID_INPUT', `state must be one of ${DECISION_STATES.filter((x) => x !== 'SUPERSEDED').join(', ')}`);
    if (!i.questionId.trim() || !i.question.trim()) throw new StoreError('INVALID_INPUT', 'questionId and question are required');
    if (i.state !== 'OPEN' && !i.answer.trim()) throw new StoreError('INVALID_INPUT', `${i.state} requires an answer or justification`);
    return this.inWriteTx(() => {
      const prev = this.db.prepare("SELECT id, state FROM decisions WHERE project_id = ? AND question_id = ? AND state <> 'SUPERSEDED' ORDER BY id DESC LIMIT 1").get(this.projectId, i.questionId) as Row | undefined;
      if (prev?.state === 'CONFIRMED') this.requireChangeFor(i.changeId, i.questionId);
      const n = Number((this.db.prepare('SELECT count(*) n FROM decisions WHERE project_id = ?').get(this.projectId) as Row).n) + 1;
      const id = `DEC-${String(n).padStart(4, '0')}`;
      if (prev) this.db.prepare("UPDATE decisions SET state = 'SUPERSEDED' WHERE project_id = ? AND id = ?").run(this.projectId, String(prev.id));
      this.db.prepare('INSERT INTO decisions (project_id, id, question_id, question, answer, state, change_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(this.projectId, id, i.questionId, i.question, i.answer.trim(), i.state, i.changeId ?? null, this.now());
      this.appendEvent({ eventType: 'DecisionRecorded', payload: { id, questionId: i.questionId, state: i.state, supersedes: (prev?.id as string | undefined) ?? null, changeId: i.changeId ?? null } });
      return id;
    });
  }

  /** CHANGE-XXXX (§13.6): motivo, itens afetados e aprovação humana. */
  createChange(i: { reason: string; targets: string[]; approvedBy: string }): string {
    if (!i.reason.trim()) throw new StoreError('INVALID_INPUT', 'change reason is required');
    if (!i.approvedBy.trim()) throw new StoreError('INVALID_INPUT', 'approvedBy is required');
    const targets = [...new Set(i.targets.map((t) => t.trim()).filter(Boolean))];
    if (!targets.length) throw new StoreError('INVALID_INPUT', 'a change must cite at least one requirement or question');
    return this.inWriteTx(() => {
      for (const t of targets) if (/^REQ-\d{3,}$/.test(t)) this.requireRequirement(t);
      const n = Number((this.db.prepare('SELECT count(*) n FROM changes WHERE project_id = ?').get(this.projectId) as Row).n) + 1;
      const id = `CHANGE-${String(n).padStart(4, '0')}`;
      this.db.prepare('INSERT INTO changes (project_id, id, reason, targets, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(this.projectId, id, i.reason.trim(), JSON.stringify(targets), i.approvedBy.trim(), this.now());
      this.appendEvent({ eventType: 'ChangeRecorded', payload: { id, reason: i.reason.trim(), targets, approvedBy: i.approvedBy.trim() } });
      return id;
    });
  }

  getChange(id: string): ChangeRow | undefined {
    const r = this.db.prepare('SELECT * FROM changes WHERE project_id = ? AND id = ?').get(this.projectId, id) as Row | undefined;
    return r ? { id: String(r.id), reason: String(r.reason), targets: JSON.parse(String(r.targets)) as string[], approvedBy: String(r.approved_by), createdAt: String(r.created_at) } : undefined;
  }

  listChanges(): ChangeRow[] {
    return (this.db.prepare('SELECT id FROM changes WHERE project_id = ? ORDER BY id').all(this.projectId) as Row[]).map((r) => this.getChange(String(r.id))!);
  }

  // ===== PHASE-10: approvals vinculados a hash (AER-REQ-162/173) =====

  private toApproval(r: Row): ApprovalRow {
    const expired = r.state === 'GRANTED' && r.expires_at !== null && Date.parse(String(r.expires_at)) <= Date.parse(this.now());
    return {
      id: String(r.id), scope: String(r.scope), subject: String(r.subject), operationHash: String(r.operation_hash), description: String(r.description),
      taskId: (r.task_id as string | null) ?? null, state: expired ? 'EXPIRED' : (r.state as ApprovalState), decidedBy: (r.decided_by as string | null) ?? null, expiresAt: (r.expires_at as string | null) ?? null,
    };
  }

  listApprovals(): ApprovalRow[] {
    return (this.db.prepare('SELECT * FROM approvals WHERE project_id = ? ORDER BY id').all(this.projectId) as Row[]).map((r) => this.toApproval(r));
  }

  getApproval(id: string): ApprovalRow | undefined {
    const r = this.db.prepare('SELECT * FROM approvals WHERE project_id = ? AND id = ?').get(this.projectId, id) as Row | undefined;
    return r ? this.toApproval(r) : undefined;
  }

  /** Pede aprovação para uma operação exata. Pedido igual ainda aberto (ou concedido e válido) é reaproveitado. */
  requestApproval(i: { scope: string; subject: string; operationHash: string; description: string; taskId?: string | null }): ApprovalRow {
    if (!/^[0-9a-f]{64}$/.test(i.operationHash)) throw new StoreError('INVALID_INPUT', 'operationHash must be a sha256 hex');
    return this.inWriteTx(() => {
      const same = this.listApprovals().find((a) => a.operationHash === i.operationHash && a.scope === i.scope && a.taskId === (i.taskId ?? null) && (a.state === 'PENDING' || a.state === 'GRANTED'));
      if (same) return same;
      const n = Number((this.db.prepare('SELECT count(*) n FROM approvals WHERE project_id = ?').get(this.projectId) as Row).n) + 1;
      const id = `APR-${String(n).padStart(4, '0')}`;
      this.db.prepare(`INSERT INTO approvals (project_id, id, scope, subject, operation_hash, description, task_id, state, requested_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`)
        .run(this.projectId, id, i.scope, i.subject, i.operationHash, i.description, i.taskId ?? null, this.now());
      this.appendEvent({ eventType: 'ApprovalRequested', taskId: i.taskId ?? null, payload: { id, scope: i.scope, subject: i.subject, operationHash: i.operationHash, description: i.description } });
      return this.getApproval(id)!;
    });
  }

  /** Decisão humana. Concessão tem validade (padrão 60 min, máx. 24 h) e é de uso único (consumeApproval). */
  decideApproval(id: string, decision: 'GRANTED' | 'DENIED', by: string, ttlMinutes = 60): ApprovalRow {
    if (!by.trim()) throw new StoreError('INVALID_INPUT', 'who decides is required');
    if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 24 * 60) throw new StoreError('INVALID_INPUT', 'ttl must be 1..1440 minutes');
    return this.inWriteTx(() => {
      const a = this.getApproval(id);
      if (!a) throw new StoreError('NOT_FOUND', `approval ${id} not found`);
      if (a.state !== 'PENDING') throw new StoreError('INVALID_TRANSITION', `${id} is ${a.state}, not PENDING`);
      const now = this.now();
      const expires = decision === 'GRANTED' ? new Date(Date.parse(now) + ttlMinutes * 60_000).toISOString() : null;
      this.db.prepare('UPDATE approvals SET state = ?, decided_by = ?, decided_at = ?, expires_at = ? WHERE project_id = ? AND id = ?').run(decision, by.trim(), now, expires, this.projectId, id);
      this.appendEvent({ eventType: decision === 'GRANTED' ? 'ApprovalGranted' : 'ApprovalDenied', taskId: a.taskId, payload: { id, scope: a.scope, subject: a.subject, operationHash: a.operationHash, decidedBy: by.trim(), expiresAt: expires } });
      return this.getApproval(id)!;
    });
  }

  consumeApproval(id: string): void {
    this.inWriteTx(() => {
      const a = this.getApproval(id);
      if (!a || a.state !== 'GRANTED') throw new StoreError('INVALID_TRANSITION', `${id} is not a valid granted approval`);
      this.db.prepare("UPDATE approvals SET state = 'CONSUMED' WHERE project_id = ? AND id = ?").run(this.projectId, id);
    });
  }

  // ===== PHASE-10: registry de extensões (§9.6: DISCOVERED → INSPECTED → APPROVED → INSTALLED → VERIFIED | FAILED) =====

  private toExtension(r: Row): ExtensionRow {
    return {
      id: String(r.id), kind: r.kind as ExtensionRow['kind'], name: String(r.name), origin: String(r.origin), scope: String(r.scope), manifestSha256: String(r.manifest_sha256),
      state: r.state as ExtensionState, verdict: (r.verdict as string | null) ?? null, findings: JSON.parse(String(r.findings)) as ExtensionRow['findings'],
      compatibility: JSON.parse(String(r.compatibility)) as Record<string, string>, detail: JSON.parse(String(r.detail)) as Record<string, unknown>,
    };
  }

  listExtensions(): ExtensionRow[] {
    return (this.db.prepare('SELECT * FROM extensions WHERE project_id = ? ORDER BY id').all(this.projectId) as Row[]).map((r) => this.toExtension(r));
  }

  getExtension(id: string): ExtensionRow | undefined {
    const r = this.db.prepare('SELECT * FROM extensions WHERE project_id = ? AND id = ?').get(this.projectId, id) as Row | undefined;
    return r ? this.toExtension(r) : undefined;
  }

  /**
   * Registra o resultado de discovery + inspeção. Se o manifesto mudou (update), a extensão volta a INSPECTED e
   * precisa de nova aprovação — nada é reativado automaticamente (AER-REQ-138).
   */
  upsertExtension(i: ExtensionInput): { id: string; changed: boolean } {
    return this.inWriteTx(() => {
      const cur = this.db.prepare('SELECT * FROM extensions WHERE project_id = ? AND kind = ? AND name = ? AND origin = ?').get(this.projectId, i.kind, i.name, i.origin) as Row | undefined;
      const now = this.now();
      const json = [JSON.stringify(i.findings), JSON.stringify(i.compatibility), JSON.stringify(i.detail ?? {})];
      if (!cur) {
        const n = Number((this.db.prepare('SELECT count(*) n FROM extensions WHERE project_id = ?').get(this.projectId) as Row).n) + 1;
        const id = `EXT-${String(n).padStart(4, '0')}`;
        this.db.prepare(`INSERT INTO extensions (project_id, id, kind, name, origin, scope, manifest_sha256, state, verdict, findings, compatibility, detail, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'INSPECTED', ?, ?, ?, ?, ?)`).run(this.projectId, id, i.kind, i.name, i.origin, i.scope, i.manifestSha256, i.verdict, ...json, now);
        this.appendEvent({ eventType: 'ExtensionDiscovered', payload: { id, kind: i.kind, name: i.name, origin: i.origin, manifestSha256: i.manifestSha256 } });
        this.appendEvent({ eventType: 'ExtensionScanned', payload: { id, verdict: i.verdict, findings: i.findings.map((f) => `${f.severity}:${f.code}`) } });
        return { id, changed: true };
      }
      const id = String(cur.id);
      const changed = cur.manifest_sha256 !== i.manifestSha256;
      const state = changed ? 'INSPECTED' : String(cur.state);
      this.db.prepare('UPDATE extensions SET scope = ?, manifest_sha256 = ?, state = ?, verdict = ?, findings = ?, compatibility = ?, detail = ?, updated_at = ? WHERE project_id = ? AND id = ?')
        .run(i.scope, i.manifestSha256, state, i.verdict, ...json, now, this.projectId, id);
      if (changed) this.appendEvent({ eventType: 'ExtensionScanned', payload: { id, verdict: i.verdict, findings: i.findings.map((f) => `${f.severity}:${f.code}`), manifestChanged: true, previousState: String(cur.state) } });
      return { id, changed };
    });
  }

  setExtensionState(id: string, to: ExtensionState, note: string | null = null): void {
    this.inWriteTx(() => {
      const e = this.getExtension(id);
      if (!e) throw new StoreError('NOT_FOUND', `extension ${id} not found`);
      if (!EXT_EDGES[e.state].includes(to)) throw new StoreError('INVALID_TRANSITION', `${id}: ${e.state} → ${to} not allowed`);
      if (to === 'APPROVED' && e.verdict === 'UNSAFE') throw new StoreError('INVALID_TRANSITION', `${id} is UNSAFE (${e.findings.filter((f) => f.severity === 'HIGH').map((f) => f.code).join(', ')}); it cannot be approved`);
      this.db.prepare('UPDATE extensions SET state = ?, updated_at = ? WHERE project_id = ? AND id = ?').run(to, this.now(), this.projectId, id);
      this.appendEvent({ eventType: to === 'INSTALLED' || to === 'VERIFIED' ? 'ExtensionInstalled' : 'ExtensionScanned', payload: { id, from: e.state, to, note } });
    });
  }

  /** Snapshot consistente + cursor numa única transação de leitura (AER-REQ-074, §10.3). */
  // ---- PHASE-18: conversa, planos e pontos de restauração (cada mudança é um evento) ----
  private countId(table: string, prefix: string): string {
    const n = Number((this.db.prepare(`SELECT count(*) n FROM ${table} WHERE project_id = ?`).get(this.projectId) as Row).n) + 1;
    return `${prefix}-${String(n).padStart(4, '0')}`;
  }

  startConversation(main: string, mode: ChatMode): string {
    if (!CHAT_MODES.includes(mode)) throw new StoreError('INVALID_INPUT', `invalid chat mode ${mode}`);
    if (!main.trim()) throw new StoreError('INVALID_INPUT', 'main provider is required');
    return this.inWriteTx(() => {
      const id = this.countId('conversations', 'CNV');
      this.db.prepare('INSERT INTO conversations (project_id, id, main, mode, phase_id, started_at) VALUES (?, ?, ?, ?, NULL, ?)').run(this.projectId, id, main, mode, this.now());
      this.appendEvent({ eventType: 'ConversationStarted', payload: { conversationId: id, main, mode } });
      return id;
    });
  }

  private toConversation(r: Row): ConversationRow {
    return { id: String(r.id), main: String(r.main), mode: r.mode as ChatMode, phaseId: (r.phase_id as string | null) ?? null, startedAt: String(r.started_at) };
  }

  currentConversation(): ConversationRow | undefined {
    const r = this.db.prepare('SELECT * FROM conversations WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(this.projectId) as Row | undefined;
    return r ? this.toConversation(r) : undefined;
  }

  private conversation(id: string): ConversationRow {
    const r = this.db.prepare('SELECT * FROM conversations WHERE project_id = ? AND id = ?').get(this.projectId, id) as Row | undefined;
    if (!r) throw new StoreError('NOT_FOUND', `conversation ${id} not found`);
    return this.toConversation(r);
  }

  /** Grava uma mensagem já redigida (segredos conhecidos viram [REDACTED]; máx. 16 000 caracteres). */
  addChatMessage(cnv: string, m: { role: ChatRole; provider: string | null; text: string }): number {
    if (!['user', 'main', 'system'].includes(m.role)) throw new StoreError('INVALID_INPUT', `invalid chat role ${m.role}`);
    return this.inWriteTx(() => {
      this.conversation(cnv);
      const n = Number((this.db.prepare('SELECT count(*) n FROM chat_messages WHERE project_id = ? AND conversation_id = ?').get(this.projectId, cnv) as Row).n) + 1;
      const t = redactText(m.text, 16_000);
      this.db.prepare('INSERT INTO chat_messages (project_id, conversation_id, n, role, provider, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(this.projectId, cnv, n, m.role, m.provider, t.text, this.now());
      this.appendEvent({ eventType: 'ChatMessageAdded', payload: { conversationId: cnv, n, role: m.role, provider: m.provider, text: t.text, redacted: t.redacted, truncated: t.truncated } });
      return n;
    });
  }

  /** Mensagens em ordem; com `limit`, só as últimas. */
  listChatMessages(cnv: string, limit?: number): ChatMessageRow[] {
    const rows = this.db.prepare('SELECT * FROM chat_messages WHERE project_id = ? AND conversation_id = ? ORDER BY n').all(this.projectId, cnv) as Row[];
    return (limit ? rows.slice(-limit) : rows).map((r) => ({ n: Number(r.n), role: r.role as ChatRole, provider: (r.provider as string | null) ?? null, text: String(r.text), createdAt: String(r.created_at) }));
  }

  setMainProvider(cnv: string, main: string): void {
    this.inWriteTx(() => {
      const c = this.conversation(cnv);
      if (c.main === main) return;
      this.db.prepare('UPDATE conversations SET main = ? WHERE project_id = ? AND id = ?').run(main, this.projectId, cnv);
      this.appendEvent({ eventType: 'MainProviderChanged', payload: { conversationId: cnv, from: c.main, to: main } });
    });
  }

  setConversationMode(cnv: string, mode: ChatMode): void {
    if (!CHAT_MODES.includes(mode)) throw new StoreError('INVALID_INPUT', `invalid chat mode ${mode}`);
    this.conversation(cnv);
    this.db.prepare('UPDATE conversations SET mode = ? WHERE project_id = ? AND id = ?').run(mode, this.projectId, cnv);
  }

  setConversationPhase(cnv: string, phaseId: string): void {
    this.conversation(cnv);
    this.db.prepare('UPDATE conversations SET phase_id = ? WHERE project_id = ? AND id = ?').run(phaseId, this.projectId, cnv);
  }

  private toPlan(r: Row): PlanRow {
    return { id: String(r.id), conversationId: String(r.conversation_id), state: r.state as PlanState, tasks: JSON.parse(String(r.tasks_json)) as PlannedTask[], reasons: JSON.parse(String(r.reasons_json)) as string[], createdAt: String(r.created_at) };
  }

  /** Um plano PENDING por conversa: um novo cancela o anterior (decisão do sistema). */
  proposePlan(cnv: string, tasks: PlannedTask[], reasons: string[]): string {
    if (!tasks.length) throw new StoreError('INVALID_INPUT', 'a plan needs at least one task');
    return this.inWriteTx(() => {
      this.conversation(cnv);
      const old = this.pendingPlan(cnv);
      if (old) this.decidePlan(old.id, 'cancelled', 'system');
      const id = this.countId('plans', 'PLN');
      this.db.prepare("INSERT INTO plans (project_id, id, conversation_id, state, tasks_json, reasons_json, created_at) VALUES (?, ?, ?, 'PENDING', ?, ?, ?)").run(this.projectId, id, cnv, JSON.stringify(tasks), JSON.stringify(reasons), this.now());
      this.appendEvent({ eventType: 'PlanProposed', payload: { conversationId: cnv, planId: id, tasks: tasks.map((t) => ({ title: t.title, provider: t.provider, kind: t.kind, dependsOn: t.dependsOn })), reasons } });
      return id;
    });
  }

  getPlan(id: string): PlanRow | undefined {
    const r = this.db.prepare('SELECT * FROM plans WHERE project_id = ? AND id = ?').get(this.projectId, id) as Row | undefined;
    return r ? this.toPlan(r) : undefined;
  }

  pendingPlan(cnv: string): PlanRow | undefined {
    const r = this.db.prepare("SELECT * FROM plans WHERE project_id = ? AND conversation_id = ? AND state = 'PENDING' ORDER BY id DESC LIMIT 1").get(this.projectId, cnv) as Row | undefined;
    return r ? this.toPlan(r) : undefined;
  }

  /** Decide um plano PENDING; `edited` grava as tarefas editadas e aprova. */
  decidePlan(id: string, decision: 'approved' | 'edited' | 'cancelled' | 'auto', by: string, tasks?: PlannedTask[]): void {
    this.inWriteTx(() => {
      const p = this.getPlan(id);
      if (!p) throw new StoreError('NOT_FOUND', `plan ${id} not found`);
      if (p.state !== 'PENDING') throw new StoreError('INVALID_TRANSITION', `plan ${id} is ${p.state}`);
      const state: PlanState = decision === 'cancelled' ? 'CANCELLED' : 'APPROVED';
      this.db.prepare('UPDATE plans SET state = ?, tasks_json = ? WHERE project_id = ? AND id = ?').run(state, JSON.stringify(tasks ?? p.tasks), this.projectId, id);
      this.appendEvent({ eventType: 'PlanDecided', payload: { planId: id, decision, by } });
    });
  }

  setPlanState(id: string, state: 'RUNNING' | 'DONE'): void {
    const p = this.getPlan(id);
    if (!p) throw new StoreError('NOT_FOUND', `plan ${id} not found`);
    if ((state === 'RUNNING' && p.state !== 'APPROVED') || (state === 'DONE' && p.state !== 'RUNNING')) throw new StoreError('INVALID_TRANSITION', `plan ${id} ${p.state} -> ${state}`);
    this.db.prepare('UPDATE plans SET state = ? WHERE project_id = ? AND id = ?').run(state, this.projectId, id);
  }

  addRestorePoint(cnv: string, r: { ref: string; commit: string; files: string[] }): number {
    return this.inWriteTx(() => {
      this.conversation(cnv);
      const n = Number((this.db.prepare('SELECT count(*) n FROM restore_points WHERE project_id = ? AND conversation_id = ?').get(this.projectId, cnv) as Row).n) + 1;
      this.db.prepare('INSERT INTO restore_points (project_id, conversation_id, n, ref, commit_sha, files_json, applied_at) VALUES (?, ?, ?, ?, ?, ?, NULL)').run(this.projectId, cnv, n, r.ref, r.commit, JSON.stringify(r.files));
      this.appendEvent({ eventType: 'RestorePointCreated', payload: { conversationId: cnv, n, ref: r.ref, commit: r.commit, files: r.files } });
      return n;
    });
  }

  /** Último ponto ainda não aplicado (o que o próximo /desfazer usa). */
  lastRestorePoint(cnv: string): RestorePointRow | undefined {
    const r = this.db.prepare('SELECT * FROM restore_points WHERE project_id = ? AND conversation_id = ? AND applied_at IS NULL ORDER BY n DESC LIMIT 1').get(this.projectId, cnv) as Row | undefined;
    return r ? { n: Number(r.n), ref: String(r.ref), commit: String(r.commit_sha), files: JSON.parse(String(r.files_json)) as string[], appliedAt: null } : undefined;
  }

  markRestoreApplied(cnv: string, n: number): void {
    this.inWriteTx(() => {
      this.db.prepare('UPDATE restore_points SET applied_at = ? WHERE project_id = ? AND conversation_id = ? AND n = ?').run(this.now(), this.projectId, cnv, n);
      this.appendEvent({ eventType: 'RestorePointApplied', payload: { conversationId: cnv, n } });
    });
  }

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

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

/** Texto de um requisito de domínio, na gramática do catálogo (título + critério de aceite). */
function domainText(id: string, title: string, acceptance: string): string {
  return `### ${id} — ${title.trim()}\n\nCritério de aceite: ${acceptance.trim()}`;
}
