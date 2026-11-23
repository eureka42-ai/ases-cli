import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWorktree, git } from '@aer/git-bridge';
import { ProjectStore } from '@aer/persistence';
import { createBaseAdapter, detectPlatform } from '@aer/platform-core';
import type { AgentProvider } from '@aer/provider-sdk';
import { SimulatorProvider } from '@aer/provider-simulator';
import { agentAuthor, buildPromptPack, nextAttemptBase, recoverInterrupted, runAttempt, runReview, tick, writeHandoff, type WorkerDeps } from '../src/index.ts';
import { tempRepo } from '../../git-bridge/test/helpers.ts';

const adapter = createBaseAdapter(detectPlatform(), 'test');
const sim = new SimulatorProvider(adapter, { graceMs: 200 });
// segundo "provider" para os testes: o mesmo simulador sob outro id (nenhum binário real é chamado)
const other = Object.create(sim, { id: { value: 'codex' }, requiresConsent: { value: false } }) as AgentProvider;
const P = { id: 'prj_cont00001', name: 'c' };

async function setup(provider = 'simulator') {
  const root = await tempRepo();
  const s = ProjectStore.open(':memory:', P);
  const phase = s.createPhase('PHASE-11 test');
  const id = s.createTask({ phaseId: phase, title: 'continuar', provider, reqs: ['AER-REQ-176'] });
  s.transitionTask(id, 'READY', s.getTask(id)!.version);
  const d: WorkerDeps = { root, mutate: (fn) => fn(s), providers: { simulator: sim, codex: other }, ttlMs: 30_000, timeoutMs: 10_000 };
  return { root, s, id, d };
}
const reserve = (s: ProjectStore) => tick(s, { ownerId: 'w', ttlMs: 30_000, maxParallel: 1 }).reserved[0]!;
const toReady = (s: ProjectStore, id: string) => {
  for (const to of ['REWORK', 'READY'] as const) s.transitionTask(id, to, s.getTask(id)!.version, 'handoff');
};

describe('provider switch keeps files, tests and history (TAR-0054/0058 gate)', () => {
  it('attempt 2 on another provider starts from attempt 1 checkpoint and receives the handoff', async () => {
    const { root, s, id, d } = await setup();
    expect(await runAttempt(d, reserve(s), new AbortController().signal)).toMatchObject({ state: 'REVIEW', attemptId: 'ATT-0001' });
    const tip1 = await git(root, ['rev-parse', `ases/${id}/ATT-0001`]);
    s.recordTestRun(id, { command: 'node -e 0', exitCode: 0, total: 0, passed: 0, failed: 0, skipped: 0, environment: 'test', startedAt: '2026-11-23T00:00:00Z', endedAt: '2026-11-23T00:00:01Z', attemptId: 'ATT-0001' });
    s.setTaskProvider(id, 'codex');
    const h = await writeHandoff(root, s, id, { from: 'simulator', to: 'codex', reason: 'segunda opinião' });
    s.recordArtifact(id, { kind: 'REPORT', relativePath: h.path, sha256: h.sha256 });
    expect(h.text).toMatch(/simulator → codex\. Motivo: segunda opinião/);
    expect(h.text).toMatch(new RegExp(`ponta \`${tip1.slice(0, 12)}\``));
    expect(h.text).toMatch(/`node -e 0` → exit 0/);
    expect(h.text).toMatch(/Resumo ≠ fonte\. Fontes: eventos seq \d+\.\.\d+/);
    toReady(s, id);
    expect(await nextAttemptBase(root, s.listAttempts(id))).toEqual({ base: tip1, from: 'ATT-0001' });
    expect(await runAttempt(d, reserve(s), new AbortController().signal)).toMatchObject({ state: 'REVIEW', attemptId: 'ATT-0002', providerId: 'codex' });
    const a2 = s.listAttempts(id)[1]!;
    expect(a2).toMatchObject({ providerId: 'codex', baseCommit: tip1 });
    // nada se perdeu: o checkpoint 1 é ancestral do 2, os dois providers estão no histórico e o test run continua lá
    await git(root, ['merge-base', '--is-ancestor', tip1, `ases/${id}/ATT-0002`]);
    expect(s.listAttempts(id).map((a) => a.providerId)).toEqual(['simulator', 'codex']);
    expect(s.listTestRuns(id)).toHaveLength(1);
    const instr = readFileSync(path.join(root, '.ases', 'worktrees', `${id}-ATT-0002.instructions.md`), 'utf8');
    expect(instr).toContain(`# HANDOFF ${id}`);
    expect(instr).toContain('Resumo ≠ fonte');
  });
});

describe('prompt pack (AER-REQ-177/179)', () => {
  it('only this task and its requirements; handoff truncated inside the budget with a pointer to the source', () => {
    const task = { id: 'TAR-0009', phaseId: 'PHASE-01', title: 'x', description: 'descrição', state: 'READY', priority: 50, risk: 'LOW', version: 1, reqs: ['REQ-301'], dependsOn: [], resources: [], provider: null, extensions: [] } as const;
    const text = buildPromptPack({ task: { ...task, dependsOn: [], resources: [], reqs: [...task.reqs], extensions: [] }, requirements: [{ id: 'REQ-301', title: 'Agendar', acceptance: 'aparece na agenda' }], handoff: { path: '.ases/handoffs/TAR-0009-H01.md', text: 'x'.repeat(50_000) }, budgetChars: 4000 });
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).toContain('REQ-301 — Agendar');
    expect(text).toContain('Aceite: aparece na agenda');
    expect(text).toMatch(/truncado pelo orçamento de 4000 caracteres; texto completo em \.ases\/handoffs\/TAR-0009-H01\.md/);
  });
});

describe('recovery (TAR-0057, AER-REQ-180/182)', () => {
  it('interrupted attempt: leftovers saved as recovery checkpoint, task READY; resume is idempotent', async () => {
    const { root, s, id } = await setup();
    const { fencingToken } = s.reserveTask(id, { ownerId: 'morto', ttlMs: 400, explanation: 'test', maxActive: 1 });
    s.transitionTaskFenced(id, 'RUNNING', fencingToken, 'rodando');
    const wt = await createWorktree(root, id, 'ATT-0001');
    s.startAttempt(id, fencingToken, { providerId: 'simulator', worktreePath: wt.path, branch: wt.branch, baseCommit: wt.baseCommit });
    writeFileSync(path.join(wt.path, 'meio-feito.md'), 'trabalho em andamento\n');
    await new Promise((r) => setTimeout(r, 450));
    const out = await recoverInterrupted(root, (fn) => fn(s), agentAuthor);
    expect(out[0]).toBe(`${id}: lease vencido → BLOCKED`);
    expect(out[1]).toMatch(new RegExp(`${id}: ATT-0001 interrompida \\(LEASE_EXPIRED\\) → READY; sobras salvas em [0-9a-f]{12} \\(NÃO verificadas\\)`));
    expect(s.getTask(id)!.state).toBe('READY');
    expect(await git(root, ['show', '--name-only', '--format=%s', wt.branch])).toMatch(/checkpoint de recuperação \(NÃO verificado; tentativa UNKNOWN\)\n\nmeio-feito\.md/);
    expect(await recoverInterrupted(root, (fn) => fn(s), agentAuthor)).toEqual([]); // 2º resume: nada, nenhuma tentativa nova
    expect(s.listAttempts(id)).toHaveLength(1);
  });
});

describe('independent read-only review (TAR-0056, AER-REQ-187)', () => {
  it('author cannot review; another provider reviews read-only; a reviewer that writes is INVALID and its write is discarded', async () => {
    const { root, s, id, d } = await setup();
    await runAttempt(d, reserve(s), new AbortController().signal);
    await expect(runReview(d, id, 'simulator:review', new AbortController().signal)).rejects.toThrow(/independent review needs another provider/);
    const ok = await runReview(d, id, 'codex:review', new AbortController().signal);
    expect(ok).toMatchObject({ reviewId: 'REV-0001', verdict: 'APPROVED' });
    expect(readFileSync(path.join(root, ok.reportPath), 'utf8')).toMatch(/Veredito:\*\* APPROVED/);
    expect(s.getTask(id)!.state).toBe('REVIEW'); // decisão final é humana
    const bad = await runReview(d, id, 'codex:review-write', new AbortController().signal);
    expect(bad).toMatchObject({ reviewId: 'REV-0002', verdict: 'INVALID', reason: expect.stringContaining('REVIEWER_WROTE') });
    expect(existsSync(path.join(root, 'REVISOR-ESCREVEU.md'))).toBe(false);
    expect(await git(root, ['branch', '--list', `ases/${id}/REV-*`])).toBe(''); // worktrees de revisão removidas
    expect(await git(root, ['ls-tree', '-r', '--name-only', `ases/${id}/ATT-0001`])).not.toContain('REVISOR-ESCREVEU.md');
  });
});
