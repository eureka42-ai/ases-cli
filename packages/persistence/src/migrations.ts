export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const TASK_STATES_SQL = `'DRAFT','PLANNED','READY','RESERVED','RUNNING','PAUSED','VERIFYING','REVIEW','REWORK',
  'APPROVED','MERGING','CONFLICT','BLOCKED','FAILED','CANCEL_REQUESTED','CANCELLED','COMPLETED'`;
const PHASE_STATES_SQL = `'DRAFT','PLANNED','READY','RUNNING','BLOCKED','VERIFYING','COMPLETED','CANCELLED','FAILED'`;

// §6.3: phases antes de tasks; FKs compostas com PK correspondente.
// Tabelas de attempts/leases/worktrees/approvals entram nas fases que as usam (PHASE-05/06/10).
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial',
    sql: `
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE id_counters (
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('PHASE','TASK')),
  last_value INTEGER NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (project_id, kind)
);
CREATE TABLE phases (
  project_id TEXT NOT NULL REFERENCES projects(id),
  id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (${PHASE_STATES_SQL})),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, id)
);
CREATE TABLE tasks (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  phase_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK (state IN (${TASK_STATES_SQL})),
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  risk TEXT NOT NULL DEFAULT 'MODERATE' CHECK (risk IN ('LOW','MODERATE','HIGH','CRITICAL')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, phase_id) REFERENCES phases(project_id, id)
);
CREATE INDEX idx_tasks_phase ON tasks(project_id, phase_id);
CREATE TABLE task_dependencies (
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  dependency_type TEXT NOT NULL DEFAULT 'FINISH_TO_START',
  PRIMARY KEY (project_id, task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id),
  FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, id),
  FOREIGN KEY (project_id, depends_on_task_id) REFERENCES tasks(project_id, id)
);
CREATE TABLE task_requirements (
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  req_namespace TEXT NOT NULL CHECK (req_namespace IN ('AER','ASES')),
  req_id TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'IMPLEMENTS',
  PRIMARY KEY (project_id, task_id, req_namespace, req_id),
  FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, id)
);
CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(id),
  phase_id TEXT,
  task_id TEXT,
  attempt_id TEXT,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_sha256 TEXT NOT NULL,
  redaction_level TEXT NOT NULL DEFAULT 'SAFE'
);
CREATE INDEX idx_events_project_seq ON events(project_id, seq);
CREATE INDEX idx_events_task_seq ON events(project_id, task_id, seq);
CREATE TRIGGER events_append_only_update BEFORE UPDATE ON events
  BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER events_append_only_delete BEFORE DELETE ON events
  BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
`,
  },
  // PHASE-05 (ADR-0004): scheduler, leases com fencing, attempts, recursos compartilhados, travas e evidências.
  {
    version: 2,
    name: 'scheduler-leases-evidence',
    sql: `
  ALTER TABLE tasks ADD COLUMN fencing_seq INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE tasks ADD COLUMN provider TEXT;
  CREATE TABLE task_leases (
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    fencing_token INTEGER NOT NULL CHECK (fencing_token >= 1),
    acquired_at TEXT NOT NULL,
    heartbeat_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY (project_id, task_id),
    FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, id)
  );
  CREATE TABLE task_resources (
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    resource TEXT NOT NULL,
    PRIMARY KEY (project_id, task_id, resource),
    FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, id)
  );
  CREATE TABLE attempts (
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('RUNNING','EXITED','FAILED','CANCELLED','UNKNOWN')),
    fencing_token INTEGER NOT NULL,
    worktree_path TEXT,
    branch TEXT,
    base_commit TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    exit_code INTEGER,
    failure_code TEXT,
    PRIMARY KEY (project_id, task_id, id),
    FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, id)
  );
  CREATE TABLE locks (
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    acquired_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY (project_id, name)
  );
  CREATE TABLE artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    attempt_id TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('EVIDENCE','LOG','REPORT','DIFF')),
    relative_path TEXT NOT NULL,
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    note TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, id)
  );
  CREATE TABLE test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    attempt_id TEXT,
    command TEXT NOT NULL,
    exit_code INTEGER NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    environment TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, id)
  );
  CREATE INDEX idx_test_runs_task ON test_runs(project_id, task_id, id);
  `,
  },
];
