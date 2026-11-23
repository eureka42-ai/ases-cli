import { z } from 'zod';
import { PHASE_STATES, TASK_STATES } from './states.ts';

// §6.5 + PhaseUpdated (transição de fase registrada pelo bootstrap e pelo store).
export const EVENT_TYPES = [
  'ProjectInitialized', 'PhaseCreated', 'PhaseUpdated', 'PhaseStarted', 'PhaseCompleted',
  'TaskCreated', 'TaskUpdated', 'TaskDependencyAdded', 'TaskReady', 'TaskReserved', 'TaskStarted', 'TaskPaused', 'TaskResumed', 'TaskBlocked',
  'TaskFailed', 'TaskReviewRequested', 'TaskReviewApproved', 'TaskReworkRequested', 'TaskMergeStarted', 'TaskMerged',
  'TaskCompleted', 'TaskCancelled', 'AttemptStarted', 'AttemptExited', 'ProviderDetected', 'ProviderUnavailable',
  'ProviderOutputChunk', 'ProviderToolCallObserved', 'ProviderToolResultObserved', 'ProviderUsageObserved',
  'ApprovalRequested', 'ApprovalGranted', 'ApprovalDenied', 'ExtensionDiscovered', 'ExtensionScanned', 'ExtensionInstalled',
  'TestRunStarted', 'TestRunCompleted', 'GitCheckpointCreated', 'HandoffCreated', 'RecoveryStarted', 'RecoveryCompleted',
  'SecurityViolationBlocked', 'AuditExported',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const REDACTION_LEVELS = ['SAFE', 'REDACTED', 'SENSITIVE'] as const;

const phaseId = z.string().regex(/^PHASE-\d{2,}$/);
const taskId = z.string().regex(/^TAR-\d{4,}$/);
const attemptId = z.string().regex(/^ATT-\d{4,}$/);

/** AER-REQ-065: eventos críticos têm payload validado e sem campos imprevistos. */
export const CRITICAL_PAYLOADS = {
  PhaseCreated: z.strictObject({ title: z.string().min(1) }),
  TaskCreated: z.strictObject({ title: z.string().min(1), reqs: z.array(z.string()) }),
  TaskUpdated: z.strictObject({ from: z.enum(TASK_STATES), to: z.enum(TASK_STATES), reason: z.string().nullable() }),
  PhaseUpdated: z.strictObject({ from: z.enum(PHASE_STATES), to: z.enum(PHASE_STATES), reason: z.string().nullable() }),
  TaskDependencyAdded: z.strictObject({ dependsOn: taskId }),
  TaskReserved: z.strictObject({ ownerId: z.string().min(1), fencingToken: z.number().int().min(1), expiresAt: z.iso.datetime(), explanation: z.string() }),
  AttemptStarted: z.strictObject({ providerId: z.string().min(1), fencingToken: z.number().int().min(1), branch: z.string().nullable(), baseCommit: z.string().nullable() }),
  AttemptExited: z.strictObject({ state: z.enum(['EXITED', 'FAILED', 'CANCELLED', 'UNKNOWN']), exitCode: z.number().int().nullable(), failureCode: z.string().nullable() }),
  TestRunCompleted: z.strictObject({ command: z.string().min(1), exitCode: z.number().int(), total: z.number().int().min(0), passed: z.number().int().min(0), failed: z.number().int().min(0), skipped: z.number().int().min(0) }),
} as const satisfies Partial<Record<EventType, z.ZodType>>;

export const EventEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  eventId: z.uuid(),
  seq: z.number().int().min(1),
  projectId: z.string().min(1),
  phaseId: phaseId.nullable(),
  taskId: taskId.nullable(),
  attemptId: attemptId.nullable(),
  eventType: z.enum(EVENT_TYPES),
  occurredAt: z.iso.datetime(),
  observedAt: z.iso.datetime(),
  actor: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  redactionLevel: z.enum(REDACTION_LEVELS),
  payloadSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export function validatePayload(eventType: EventType, payload: unknown): void {
  const schema = (CRITICAL_PAYLOADS as Partial<Record<EventType, z.ZodType>>)[eventType];
  if (schema) schema.parse(payload);
}
