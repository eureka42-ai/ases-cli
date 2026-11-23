import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWorktree, git } from '@aer/git-bridge';
import { ProjectStore } from '@aer/persistence';
import { mergeTask, plan, tick } from '../src/index.ts';
import { tempRepo } from '../../git-bridge/test/helpers.ts';

const P = { id: 'prj_sched00001', name: 's' };
const ready = (s: ProjectStore, id: string) => s.transitionTask(id, 'READY', s.getTask(id)!.version);

describe('plan (pure)', () => {
  it('orders by priority, then how many tasks it unblocks, then id; explains choices and waits', () => {
    const s = ProjectStore.open(':memory:', P);
    const p = s.createPhase('f');
    const base = s.createTask({ phaseId: p, title: 'base', priority: 50 });
    const t2 = s.createTask({ phaseId: p, title: 'p50 isolada', priority: 50 });
    const hi = s.createTask({ phaseId: p, title: 'p90', priority: 90 });
    const dep = s.createTask({ phaseId: p, title: 'depende de base', dependsOn: [base] });
    [base, t2, hi, dep].forEach((id) => ready(s, id));
    const r = plan(s.listTasks(), []);
    expect(r.eligible.map((c) => c.taskId)).toEqual([hi, base, t2]); // base desbloqueia 1, vence t2 no empate
    expect(r.eligible[1]!.explanation).toMatch(/prioridade 50; desbloqueia 1 tarefa\(s\)/);
    expect(r.eligible[0]!.explanation).toMatch(/alternativas: TAR-0001\(p50\), TAR-0002\(p50\)/);
    expect(r.waiting).toEqual([{ taskId: dep, reason: 'aguarda TAR-0001(READY)' }]);
  });
});

describe('PHASE-05 gate: two parallel tasks, one blocked, conflict, no duplication', () => {
  it('runs the vertical scenario end to end with real Git', async () => {
    const root = await tempRepo();
    const s = ProjectStore.open(':memory:', P);
    const p = s.createPhase('Gate');
    const a = s.createTask({ phaseId: p, title: 'edita a.txt' });
    const b = s.createTask({ phaseId: p, title: 'edita app.txt' });
    const c = s.createTask({ phaseId: p, title: 'depende de A', dependsOn: [a] });
    const d = s.createTask({ phaseId: p, title: 'também edita app.txt' });
    [a, b, c, d].forEach((id) => ready(s, id));

    // rodada 1, limite 2: A e B reservadas; C espera A; D fica de fora por capacidade
    const r1 = tick(s, { ownerId: 'eng', ttlMs: 60_000, maxParallel: 2 });
    expect(r1.reserved.map((x) => x.taskId)).toEqual([a, b]);
    expect(r1.waiting).toEqual([{ taskId: c, reason: 'aguarda TAR-0001(RESERVED)' }]);
    expect(s.activeLeases()).toHaveLength(2);
    expect(tick(s, { ownerId: 'outro', ttlMs: 60_000, maxParallel: 2 }).reserved).toEqual([]); // nada duplicado

    // cada uma na sua worktree, em paralelo
    const work = async (id: string, file: string, content: string) => {
      const token = s.activeLeases().find((l) => l.taskId === id)!.fencingToken;
      s.transitionTaskFenced(id, 'RUNNING', token);
      const wt = await createWorktree(root, id, 'ATT-0001');
      s.startAttempt(id, token, { providerId: 'simulator', worktreePath: wt.path, branch: wt.branch, baseCommit: wt.baseCommit });
      writeFileSync(path.join(wt.path, file), content);
      await git(wt.path, ['add', file]);
      await git(wt.path, ['commit', '-q', '-m', `${id}`]);
      s.endAttempt(id, 'ATT-0001', { state: 'EXITED', exitCode: 0, failureCode: null });
      s.transitionTaskFenced(id, 'VERIFYING', token);
      s.recordTestRun(id, { command: 'fake test', exitCode: 0, total: 1, passed: 1, failed: 0, skipped: 0, environment: 'test', startedAt: new Date().toISOString(), endedAt: new Date().toISOString() });
      s.transitionTaskFenced(id, 'REVIEW', token);
      s.transitionTask(id, 'APPROVED', s.getTask(id)!.version);
    };
    await Promise.all([work(a, 'a.txt', 'A\n'), work(b, 'app.txt', 'B\n')]);
    expect(await mergeTask(s, root, a, { ownerId: 'eng', target: 'main' })).toMatchObject({ status: 'COMPLETED' });
    expect(await mergeTask(s, root, b, { ownerId: 'eng', target: 'main' })).toMatchObject({ status: 'COMPLETED' });

    // rodada 2: C liberada (A concluída) e D entra
    const r2 = tick(s, { ownerId: 'eng', ttlMs: 60_000, maxParallel: 2 });
    expect(r2.reserved.map((x) => x.taskId).sort()).toEqual([c, d]);
    // D partiu da base antiga e mexe em app.txt → conflito com B, sem merge automático
    const token = s.activeLeases().find((l) => l.taskId === d)!.fencingToken;
    s.transitionTaskFenced(d, 'RUNNING', token);
    const wt = await createWorktree(root, d, 'ATT-0001', `${s.listAttempts(a)[0]!.baseCommit}`);
    s.startAttempt(d, token, { providerId: 'simulator', worktreePath: wt.path, branch: wt.branch, baseCommit: wt.baseCommit });
    writeFileSync(path.join(wt.path, 'app.txt'), 'D\n');
    await git(wt.path, ['commit', '-qam', d]);
    s.endAttempt(d, 'ATT-0001', { state: 'EXITED', exitCode: 0, failureCode: null });
    for (const to of ['VERIFYING', 'REVIEW'] as const) s.transitionTaskFenced(d, to, token);
    s.transitionTask(d, 'APPROVED', s.getTask(d)!.version);
    expect(await mergeTask(s, root, d, { ownerId: 'eng', target: 'main' })).toEqual({ status: 'CONFLICT', files: ['app.txt'] });
    expect(s.getTask(d)!.state).toBe('CONFLICT');

    // um merge por vez: com a trava tomada por outro dono, o merge é recusado
    expect(s.acquireLock('merge:main', 'outro-processo', 60_000)).toBe(true);
    s.transitionTask(d, 'REVIEW', s.getTask(d)!.version);
    s.transitionTask(d, 'APPROVED', s.getTask(d)!.version);
    await expect(mergeTask(s, root, d, { ownerId: 'eng', target: 'main' })).rejects.toMatchObject({ code: 'LOCKED' });
    expect(s.getTask(d)!.state).toBe('APPROVED'); // pré-condição falhou antes de MERGING
  }, 60_000);

  it('a merged task without evidence stays MERGING (never a false DONE)', async () => {
    const root = await tempRepo();
    const s = ProjectStore.open(':memory:', P);
    const t = s.createTask({ phaseId: s.createPhase('f'), title: 'sem teste' });
    ready(s, t);
    const { reserved } = tick(s, { ownerId: 'eng', ttlMs: 60_000, maxParallel: 1 });
    const token = reserved[0]!.fencingToken;
    s.transitionTaskFenced(t, 'RUNNING', token);
    const wt = await createWorktree(root, t, 'ATT-0001');
    s.startAttempt(t, token, { providerId: 'simulator', branch: wt.branch, baseCommit: wt.baseCommit });
    writeFileSync(path.join(wt.path, 'x.txt'), 'x');
    await git(wt.path, ['add', 'x.txt']);
    await git(wt.path, ['commit', '-qm', 'x']);
    for (const to of ['VERIFYING', 'REVIEW'] as const) s.transitionTaskFenced(t, to, token);
    s.transitionTask(t, 'APPROVED', s.getTask(t)!.version);
    expect(await mergeTask(s, root, t, { ownerId: 'eng', target: 'main' })).toMatchObject({ status: 'MERGED_PENDING_EVIDENCE' });
    expect(s.getTask(t)!.state).toBe('MERGING');
  }, 60_000);
});
