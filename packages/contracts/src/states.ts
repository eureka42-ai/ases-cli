// §5.1 / §5.2 do MD mestre. Transições válidas são implementadas na PHASE-02 (TAR-0008).
export const TASK_STATES = [
  'DRAFT', 'PLANNED', 'READY', 'RESERVED', 'RUNNING', 'PAUSED', 'VERIFYING', 'REVIEW', 'REWORK',
  'APPROVED', 'MERGING', 'CONFLICT', 'BLOCKED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED', 'COMPLETED',
] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const PHASE_STATES = [
  'DRAFT', 'PLANNED', 'READY', 'RUNNING', 'BLOCKED', 'VERIFYING', 'COMPLETED', 'CANCELLED', 'FAILED',
] as const;
export type PhaseState = (typeof PHASE_STATES)[number];

// §15.2: NOT_RUN jamais significa PASS.
export const TEST_RESULTS = ['PASS', 'FAIL', 'SKIPPED', 'NOT_RUN', 'BLOCKED'] as const;
export type TestResult = (typeof TEST_RESULTS)[number];
