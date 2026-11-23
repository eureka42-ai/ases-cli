import type { PhaseState, TaskState } from './states.ts';

// §5.1. Estados terminais: COMPLETED e CANCELLED (reabrir exige CHANGE + nova tarefa/attempt, AER-REQ-038).
const TASK_EDGES: Record<TaskState, readonly TaskState[]> = {
  DRAFT: ['PLANNED'],
  PLANNED: ['READY'],
  READY: ['RESERVED'],
  RESERVED: ['RUNNING', 'READY'], // READY: lease liberado/expirado antes de iniciar
  RUNNING: ['VERIFYING', 'PAUSED', 'FAILED'],
  PAUSED: ['READY'],
  VERIFYING: ['REVIEW', 'FAILED'],
  REVIEW: ['APPROVED', 'REWORK'],
  REWORK: ['READY'],
  FAILED: ['READY'],
  APPROVED: ['MERGING'],
  MERGING: ['COMPLETED', 'CONFLICT'],
  CONFLICT: ['REVIEW', 'REWORK'],
  BLOCKED: ['PLANNED', 'READY'],
  CANCEL_REQUESTED: ['CANCELLED'], // somente após reconciliação de processo e worktree (quem chama garante)
  CANCELLED: [],
  COMPLETED: [],
};
const TASK_NO_BLOCK_OR_CANCEL: readonly TaskState[] = ['BLOCKED', 'CANCEL_REQUESTED', 'CANCELLED', 'COMPLETED'];

export function canTransitionTask(from: TaskState, to: TaskState): boolean {
  if (TASK_EDGES[from].includes(to)) return true;
  // "qualquer estado ativo -> BLOCKED ou CANCEL_REQUESTED"; BLOCKED também pode pedir cancelamento
  if (to === 'BLOCKED') return !TASK_NO_BLOCK_OR_CANCEL.includes(from);
  if (to === 'CANCEL_REQUESTED') return !TASK_NO_BLOCK_OR_CANCEL.includes(from) || from === 'BLOCKED';
  return false;
}

// §5.2
const PHASE_EDGES: Record<PhaseState, readonly PhaseState[]> = {
  DRAFT: ['PLANNED', 'CANCELLED'],
  PLANNED: ['READY', 'CANCELLED'],
  READY: ['RUNNING', 'CANCELLED'],
  RUNNING: ['VERIFYING', 'BLOCKED', 'FAILED', 'CANCELLED'],
  BLOCKED: ['READY', 'RUNNING', 'CANCELLED'],
  VERIFYING: ['COMPLETED', 'RUNNING', 'FAILED'],
  FAILED: ['READY'],
  COMPLETED: [],
  CANCELLED: [],
};

export const canTransitionPhase = (from: PhaseState, to: PhaseState): boolean => PHASE_EDGES[from].includes(to);
