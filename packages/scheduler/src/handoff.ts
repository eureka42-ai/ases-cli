import type { TaskState } from '@aer/contracts';
import { StoreError } from '@aer/persistence';
import { checkpointLeftovers, writeHandoff } from './continuity.ts';
import { agentAuthor, type WorkerDeps } from './worker.ts';

const TO_READY: Partial<Record<TaskState, TaskState[]>> = { REVIEW: ['REWORK', 'READY'], REWORK: ['READY'], FAILED: ['READY'], BLOCKED: ['READY'] };

/**
 * Troca (ou mantém) o executor de uma tarefa parada e a devolve a READY: sobras viram checkpoint de recuperação, o
 * HANDOFF.md registra motivo e estado, e a próxima tentativa parte do último checkpoint (nada se perde).
 */
export async function handoffTask(d: WorkerDeps, taskId: string, to: string, reason: string): Promise<{ path: string; recoveryCommit?: string }> {
  const read = d.read ?? d.mutate;
  const task = read((s) => s.getTask(taskId));
  if (!task) throw new StoreError('NOT_FOUND', `task ${taskId} not found`);
  const steps = TO_READY[task.state];
  if (!steps) throw new StoreError('INVALID_TRANSITION', `${taskId} está ${task.state}; handoff só de REVIEW, REWORK, FAILED ou BLOCKED`);
  const last = read((s) => s.listAttempts(taskId)).at(-1);
  const recoveryCommit = last ? await checkpointLeftovers(last, agentAuthor(last.providerId)) : undefined;
  if (recoveryCommit && last) d.mutate((st) => st.appendEvent({ eventType: 'GitCheckpointCreated', phaseId: task.phaseId, taskId, attemptId: last.id, payload: { branch: last.branch, commit: recoveryCommit, baseCommit: last.baseCommit, recovery: true } }));
  d.mutate((st) => st.setTaskProvider(taskId, to));
  const h = await read((s) => writeHandoff(d.root, s, taskId, { from: task.provider, to, reason, recoveryCommit }));
  d.mutate((st) => {
    st.recordArtifact(taskId, { kind: 'REPORT', relativePath: h.path, sha256: h.sha256, note: `handoff ${task.provider ?? '—'} → ${to}` });
    st.appendEvent({ eventType: 'HandoffCreated', phaseId: task.phaseId, taskId, payload: { from: task.provider, to, reason, document: h.path, sha256: h.sha256 } });
  });
  for (const step of steps) d.mutate((s) => s.transitionTask(taskId, step, s.getTask(taskId)!.version, reason));
  return { path: h.path, ...(recoveryCommit ? { recoveryCommit } : {}) };
}
