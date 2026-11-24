import { currentBranch, isCleanForMerge, mergeBranch, GitError } from '@aer/git-bridge';
import { StoreError, type ProjectStore } from '@aer/persistence';

export type MergeOutcome =
  | { status: 'COMPLETED'; commit: string }
  | { status: 'MERGED_PENDING_EVIDENCE'; commit: string; reason: string }
  | { status: 'CONFLICT'; files: string[] };

/**
 * Fila de merge serializada (AER-REQ-056): uma trava por branch alvo no banco, válida entre processos.
 * Pré-condições são verificadas ANTES de entrar em MERGING (a máquina de estados só sai de MERGING para COMPLETED/CONFLICT).
 */
export async function mergeTask(store: ProjectStore, root: string, taskId: string, o: { ownerId: string; target: string; lockTtlMs?: number }): Promise<MergeOutcome> {
  const task = store.getTask(taskId);
  if (!task) throw new StoreError('NOT_FOUND', `task ${taskId} not found`);
  if (task.state !== 'APPROVED') throw new StoreError('INVALID_TRANSITION', `${taskId} must be APPROVED to merge (is ${task.state})`);
  const attempt = store.listAttempts(taskId).filter((a) => a.branch).at(-1);
  if (!attempt?.branch) throw new StoreError('NOT_FOUND', `${taskId} has no attempt branch to merge`);
  const lock = `merge:${o.target}`;
  if (!store.acquireLock(lock, o.ownerId, o.lockTtlMs ?? 120_000)) throw new StoreError('LOCKED', `another merge into ${o.target} is in progress`);
  try {
    if ((await currentBranch(root)) !== o.target) throw new GitError('WRONG_BRANCH', `main checkout is not on ${o.target}`);
    // .ases/ é do engine (espelho e relatórios reescritos a cada evento) e nenhuma tarefa escreve nele: não conta como sujo
    if (!(await isCleanForMerge(root))) throw new GitError('DIRTY_TREE', 'main checkout has uncommitted changes; refusing to merge (human work is preserved)');
    let v = store.transitionTask(taskId, 'MERGING', task.version, `merge ${attempt.branch} -> ${o.target}`);
    store.appendEvent({ eventType: 'TaskMergeStarted', phaseId: task.phaseId, taskId, attemptId: attempt.id, payload: { branch: attempt.branch, target: o.target } });
    const r = await mergeBranch(root, attempt.branch, o.target, `${taskId}: ${task.title} (${attempt.id})`);
    if (r.status === 'CONFLICT') {
      store.transitionTask(taskId, 'CONFLICT', v, `conflito em ${r.files.join(', ')}`);
      return r;
    }
    store.appendEvent({ eventType: 'TaskMerged', phaseId: task.phaseId, taskId, attemptId: attempt.id, payload: { branch: attempt.branch, target: o.target, commit: r.commit } });
    try {
      v = store.transitionTask(taskId, 'COMPLETED', v, `merge ${r.commit.slice(0, 12)}`);
      return { status: 'COMPLETED', commit: r.commit };
    } catch (err) {
      // integrado, mas sem evidência/teste aprovado: fica em MERGING até a evidência existir (nunca falso DONE)
      if (err instanceof StoreError && (err.code === 'EVIDENCE_REQUIRED' || err.code === 'TESTS_FAILING')) return { status: 'MERGED_PENDING_EVIDENCE', commit: r.commit, reason: err.message };
      throw err;
    }
  } finally {
    store.releaseLock(lock, o.ownerId);
  }
}
