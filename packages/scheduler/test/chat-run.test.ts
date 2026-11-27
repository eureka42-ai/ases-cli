import { describe, expect, it } from 'vitest';
import { ProjectStore, type PlannedTask } from '@aer/persistence';
import { createBaseAdapter, detectPlatform } from '@aer/platform-core';
import type { AgentProvider } from '@aer/provider-sdk';
import { SimulatorProvider } from '@aer/provider-simulator';
import { executePlan, summaryMessage, type WorkerDeps } from '../src/index.ts';
import { tempRepo } from '../../git-bridge/test/helpers.ts';

const adapter = createBaseAdapter(detectPlatform(), 'test');
const P = { id: 'prj_chatrun0001', name: 'cr' };
const sims = (): Record<string, AgentProvider> => Object.fromEntries(['simulator', 'simulator-2', 'simulator-3'].map((id) => [id, new SimulatorProvider(adapter, { id: id as 'simulator', graceMs: 200 })]));
const task = (title: string, provider: string, dependsOn: number[] = []): PlannedTask => ({ title, instructions: `faça ${title}`, provider, kind: 'code', dependsOn });

async function setup(tasks: PlannedTask[]) {
  const root = await tempRepo();
  const s = ProjectStore.open(':memory:', P);
  const d: WorkerDeps = { root, mutate: (fn) => fn(s), providers: sims(), ttlMs: 30_000, timeoutMs: 15_000, consented: new Set() };
  const cnv = s.startConversation('simulator', 'manual');
  const planId = s.proposePlan(cnv, tasks, []);
  s.decidePlan(planId, 'approved', 'user');
  const run = (o: Partial<Parameters<typeof executePlan>[1]> = {}) => executePlan(d, {
    planId, ready: ['simulator', 'simulator-2', 'simulator-3'], main: 'simulator', limits: {}, crossReview: false, testsApproved: false, platform: adapter, signal: new AbortController().signal, ...o,
  });
  return { root, s, d, cnv, planId, run };
}

describe('plan execution and quality loop (PHASE-18, TAR-0085)', () => {
  it('3 tasks run in parallel across 2 IAs; dependsOn is respected', async () => {
    const { s, planId, run } = await setup([task('A', 'simulator-2'), task('B', 'simulator-3'), task('C', 'simulator-2', [1])]);
    const r = await run();
    expect(r.tasks.map((t) => [t.provider, t.state, t.tests])).toEqual([['simulator-2', 'REVIEW', 'NONE'], ['simulator-3', 'REVIEW', 'NONE'], ['simulator-2', 'REVIEW', 'NONE']]);
    const ev = s.eventsSince(0, 5000);
    const [a, , c] = r.tasks.map((t) => t.taskId);
    const aReview = ev.find((e) => e.taskId === a && e.eventType === 'TaskUpdated' && e.payload.to === 'REVIEW')!.seq;
    const cRunning = ev.find((e) => e.taskId === c && e.eventType === 'TaskUpdated' && e.payload.to === 'RUNNING')!.seq;
    expect(cRunning).toBeGreaterThan(aReview);
    expect(s.getPlan(planId)!.state).toBe('DONE');
    expect(s.listPhases().map((p) => p.title)).toEqual(['Conversa CNV-0001']);
  });

  it('failing tests send the task back for rework at most twice, then BLOCKED', async () => {
    const { s, run } = await setup([task('A', 'simulator-2')]);
    const r = await run({ testCommand: [process.execPath, '-e', 'process.exit(1)'], testsApproved: true });
    expect(r.tasks[0]).toMatchObject({ state: 'BLOCKED', tests: 'FAIL', reworks: 2 });
    expect(s.listLessons()[0]).toMatchObject({ state: 'PROPOSED', text: `Antes de entregar, rode \`${process.execPath} -e process.exit(1)\` e só entregue com os testes passando.` });
    expect(r.tasks[0]!.reason).toMatch(/TESTS_FAILING_AFTER_2_REWORKS/);
  });

  it('a test task that changes non-test files is blocked; a docs task writing .md passes (PHASE-26, ESAA boundaries)', async () => {
    const { s, run } = await setup([{ ...task('T', 'simulator-2'), kind: 'test' }, { ...task('D', 'simulator-3'), kind: 'docs' }]);
    const r = await run();
    expect(s.listLessons()).toMatchObject([{ state: 'PROPOSED', source: 'TAR-0001', text: 'Tarefas de teste só alteram arquivos de teste; outras mudanças vão numa tarefa "code".' }]);
    expect(r.tasks[0]).toMatchObject({ state: 'BLOCKED' });
    expect(r.tasks[0]!.reason).toMatch(/BOUNDARY_VIOLATION: tarefa de teste alterou SIMULATED\/TAR-0001\.md/);
    expect(r.tasks[1]).toMatchObject({ state: 'REVIEW' }); // o simulador grava SIMULATED/<tarefa>.md, que é documentação
  });

  it('passing tests are recorded as PASS', async () => {
    const { s, run } = await setup([task('A', 'simulator-2')]);
    const r = await run({ testCommand: [process.execPath, '-e', 'process.exit(0)'], testsApproved: true });
    expect(r.tasks[0]).toMatchObject({ state: 'REVIEW', tests: 'PASS', reworks: 0 });
    expect(s.latestTestRun(r.tasks[0]!.taskId)).toMatchObject({ exitCode: 0 });
  });

  it('no test command never counts as PASS', async () => {
    const { run } = await setup([task('A', 'simulator-2')]);
    const r = await run({ testCommand: [process.execPath, '-e', 'process.exit(0)'], testsApproved: false });
    expect(r.tasks[0]!.tests).toBe('NONE');
    expect(r.tasks[0]!.reason).toMatch(/não autorizado/); // comando do CONFIG sem autorização local
    const { run: run2 } = await setup([task('B', 'simulator-2')]);
    const r2 = await run2();
    expect(r2.tasks[0]!.tests).toBe('NONE');
    expect(r2.tasks[0]!.reason).toMatch(/sem teste/);
  });

  it('rate-limit swaps to another IA with a handoff', async () => {
    const { s, run } = await setup([task('A', 'simulator-2:rate-limit')]);
    const r = await run();
    expect(r.tasks[0]).toMatchObject({ state: 'REVIEW', provider: 'simulator-3', swaps: 1 });
    expect(s.listArtifacts(r.tasks[0]!.taskId).some((a) => a.relativePath.startsWith('.ases/handoffs/'))).toBe(true);
  });

  it('cross review runs with a non-author IA and records the verdict', async () => {
    const { s, run } = await setup([task('A', 'simulator-2')]);
    const r = await run({ crossReview: true });
    expect(r.tasks[0]!.review).toBe('APPROVED');
    const rev = s.eventsSince(0, 5000).find((e) => e.eventType === 'TaskReviewRequested')!;
    expect(String(rev.payload.reviewer)).not.toMatch(/^simulator-2/);
  });

  it('I2b: cross review prefers a non-main IA so the main stays free for the chat', async () => {
    const { s, run } = await setup([task('A', 'simulator-2')]);
    await run({ crossReview: true });
    const rev = s.eventsSince(0, 5000).find((e) => e.eventType === 'TaskReviewRequested')!;
    expect(String(rev.payload.reviewer)).toMatch(/^simulator-3/);
  });

  it('summaryMessage lists every task with its outcome', () => {
    const m = summaryMessage({ planId: 'PLN-0001', tasks: [{ taskId: 'TAR-0001', provider: 'codex', state: 'REVIEW', tests: 'PASS', review: 'APPROVED', swaps: 0, reworks: 1, reason: 'ok' }, { taskId: 'TAR-0002', provider: 'kimi', state: 'BLOCKED', tests: 'NONE', swaps: 2, reworks: 0, reason: 'RATE_LIMITED' }] });
    expect(m.split('\n')).toEqual([
      'RESUMO DO PLANO PLN-0001',
      '- TAR-0001 codex REVIEW testes:PASS revisão:APPROVED trocas:0 refações:1 — ok',
      '- TAR-0002 kimi BLOCKED testes:NONE revisão:— trocas:2 refações:0 — RATE_LIMITED',
    ]);
  });
});
