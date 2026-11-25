import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { git } from '@aer/git-bridge';
import { ProjectStore } from '@aer/persistence';
import { createBaseAdapter, detectPlatform } from '@aer/platform-core';
import { SimulatorProvider } from '@aer/provider-simulator';
import { parseProviderSpec, runAttempt, runQueue, tick, type WorkerDeps } from '../src/index.ts';
import { tempRepo } from '../../git-bridge/test/helpers.ts';

const adapter = createBaseAdapter(detectPlatform(), 'test');
const sim = new SimulatorProvider(adapter, { graceMs: 200 });
const P = { id: 'prj_worker0001', name: 'w' };

async function setup(providers: string[], o: { timeoutMs?: number; deps?: [number, number][] } = {}) {
  const root = await tempRepo();
  const s = ProjectStore.open(':memory:', P);
  const phase = s.createPhase('PHASE-06 test');
  const ids = providers.map((provider, i) => s.createTask({ phaseId: phase, title: `t${i}`, provider }));
  for (const [a, b] of o.deps ?? []) s.addDependency(ids[a]!, ids[b]!);
  for (const id of ids) s.transitionTask(id, 'READY', s.getTask(id)!.version);
  const d: WorkerDeps = { root, mutate: (fn) => fn(s), providers: { simulator: sim }, ttlMs: 30_000, timeoutMs: o.timeoutMs ?? 10_000 };
  return { root, s, ids, d };
}
const reserve = (s: ProjectStore, n = 1) => tick(s, { ownerId: 'w', ttlMs: 30_000, maxParallel: n }).reserved;
const types = (s: ProjectStore, taskId: string) => s.eventsSince(0, 1000).filter((e) => e.taskId === taskId).map((e) => e.eventType);

describe('parseProviderSpec', () => {
  it('splits provider and preference, rejects junk', () => {
    expect(parseProviderSpec('simulator:hang')).toEqual({ providerId: 'simulator', preference: 'hang' });
    expect(parseProviderSpec('simulator')).toEqual({ providerId: 'simulator' });
    expect(parseProviderSpec('sim; rm -rf')).toBeUndefined();
    expect(parseProviderSpec(null)).toBeUndefined();
  });
  it('accepts real model ids after the colon, never shell metacharacters (PHASE-20)', () => {
    expect(parseProviderSpec('kimi:kimi-code/kimi-for-coding,thinking')).toEqual({ providerId: 'kimi', preference: 'kimi-code/kimi-for-coding,thinking' });
    expect(parseProviderSpec('google:gemini-4-neon-high')).toEqual({ providerId: 'google', preference: 'gemini-4-neon-high' });
    expect(parseProviderSpec('opencode:ollama/gpt-oss:120b-cloud')).toEqual({ providerId: 'opencode', preference: 'ollama/gpt-oss:120b-cloud' });
    expect(parseProviderSpec('codex:gpt-5; rm -rf /')).toBeUndefined();
    expect(parseProviderSpec('codex:$(whoami)')).toBeUndefined();
  });
});

describe('runAttempt (TAR-0030)', () => {
  it('ok: worktree, SIMULATED events, checkpoint commit, attempt EXITED 0, task REVIEW', async () => {
    const { root, s, ids, d } = await setup(['simulator']);
    const [r] = reserve(s);
    const o = await runAttempt(d, r!, new AbortController().signal);
    expect(o).toMatchObject({ state: 'REVIEW', simulated: true, attemptId: 'ATT-0001' });
    const att = s.listAttempts(ids[0]!)[0]!;
    expect(att).toMatchObject({ state: 'EXITED', exitCode: 0, branch: `ases/${ids[0]}/ATT-0001` });
    expect(await git(root, ['show', '--name-only', '--format=%an|%s', att.branch!])).toMatch(new RegExp(`^AER agent \\(simulator\\)\\|${ids[0]} ATT-0001: t0 \\[SIMULATED\\]\\n\\nSIMULATED/${ids[0]}\\.md$`));
    expect(existsSync(path.join(root, 'SIMULATED'))).toBe(false); // nada no checkout principal
    const t = types(s, ids[0]!);
    for (const e of ['ProviderDetected', 'AttemptStarted', 'TaskStarted', 'ProviderOutputChunk', 'ProviderToolCallObserved', 'ProviderToolResultObserved', 'ProviderUsageObserved', 'GitCheckpointCreated', 'AttemptExited']) expect(t).toContain(e);
    const chunk = s.eventsSince(0, 1000).find((e) => e.eventType === 'ProviderOutputChunk')!;
    expect(chunk.payload).toMatchObject({ providerId: 'simulator', simulated: true });
    expect(s.eventsSince(0, 1000).find((e) => e.eventType === 'ProviderUsageObserved')!.payload).toMatchObject({ source: 'UNKNOWN', value: null });
    expect(s.activeLeases()).toEqual([]);
  });

  it('exit 1 is FAILED with the real code (AER-REQ-105)', async () => {
    const { s, ids, d } = await setup(['simulator:fail']);
    expect(await runAttempt(d, reserve(s)[0]!, new AbortController().signal)).toMatchObject({ state: 'FAILED' });
    expect(s.listAttempts(ids[0]!)[0]).toMatchObject({ state: 'FAILED', exitCode: 1 });
  });

  it('auth expired blocks as AUTH_EXPIRED, not RATE_LIMITED (AER-REQ-107)', async () => {
    const { s, d } = await setup(['simulator:auth-expired']);
    const o = await runAttempt(d, reserve(s)[0]!, new AbortController().signal);
    expect(o).toMatchObject({ state: 'BLOCKED', reason: 'AUTH_EXPIRED' });
    expect(o.reason).not.toMatch(/RATE/);
  });

  it('429 starts a provider cooldown: the next task on that provider is BLOCKED without a new process (AER-REQ-048)', async () => {
    const { s, ids, d } = await setup(['simulator:rate-limit', 'simulator']);
    expect(await runAttempt(d, reserve(s)[0]!, new AbortController().signal)).toMatchObject({ state: 'BLOCKED', reason: 'RATE_LIMITED' });
    const o = await runAttempt(d, reserve(s)[0]!, new AbortController().signal);
    expect(o).toMatchObject({ state: 'BLOCKED', providerId: 'simulator', attemptId: null });
    expect(o.reason).toMatch(/^PROVIDER_COOLDOWN: simulator teve RATE_LIMITED; novas tentativas só após /);
    expect(s.listAttempts(ids[1]!)).toEqual([]);
    expect(s.providerCooldownUntil('simulator', 0)).toBeUndefined(); // cooldown vencido libera o provider
  });

  it('garbage stream with exit 0 is never success; attempt UNKNOWN', async () => {
    const { s, ids, d } = await setup(['simulator:garbage']);
    expect(await runAttempt(d, reserve(s)[0]!, new AbortController().signal)).toMatchObject({ state: 'FAILED', reason: expect.stringMatching(/^PARSE_ERROR/) });
    expect(s.listAttempts(ids[0]!)[0]).toMatchObject({ state: 'UNKNOWN', exitCode: 0 });
  });

  it('path escape is blocked and recorded as a security violation', async () => {
    const { s, ids, d } = await setup(['simulator:escape']);
    expect(await runAttempt(d, reserve(s)[0]!, new AbortController().signal)).toMatchObject({ state: 'FAILED', reason: expect.stringMatching(/^SECURITY_VIOLATION/) });
    expect(types(s, ids[0]!)).toContain('SecurityViolationBlocked');
  });

  it('approval request stops the agent and blocks the task until approval exists', async () => {
    const { s, ids, d } = await setup(['simulator:approval']);
    expect(await runAttempt(d, reserve(s)[0]!, new AbortController().signal)).toMatchObject({ state: 'BLOCKED', reason: expect.stringMatching(/^APPROVAL_REQUIRED/) });
    expect(types(s, ids[0]!)).toContain('ApprovalRequested');
    expect(s.listAttempts(ids[0]!)[0]).toMatchObject({ state: 'CANCELLED' });
  });

  it('hung agent past timeout is terminated and FAILED TIMEOUT (AER-REQ-106)', async () => {
    const { s, ids, d } = await setup(['simulator:hang'], { timeoutMs: 600 });
    expect(await runAttempt(d, reserve(s)[0]!, new AbortController().signal)).toMatchObject({ state: 'FAILED', reason: expect.stringMatching(/^TIMEOUT/) });
    expect(s.listAttempts(ids[0]!)[0]).toMatchObject({ state: 'FAILED' });
  });

  it('user cancel reconciles the process tree, then CANCELLED', async () => {
    const { s, ids, d } = await setup(['simulator:hang']);
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 400);
    expect(await runAttempt(d, reserve(s)[0]!, ac.signal)).toMatchObject({ state: 'CANCELLED' });
    expect(s.listAttempts(ids[0]!)[0]).toMatchObject({ state: 'CANCELLED' });
    expect(s.getTask(ids[0]!)!.state).toBe('CANCELLED');
  });

  it('unavailable provider blocks the task and the run goes on (AER-REQ-108)', async () => {
    const { s, ids, d } = await setup(['simulator', 'ghost']);
    const down = new SimulatorProvider(adapter, { script: path.join(d.root, 'missing.mjs') });
    const r = await runQueue({ ...d, providers: { simulator: down } }, { ownerId: 'w', maxParallel: 2, signal: new AbortController().signal });
    expect(Object.fromEntries(r.outcomes.map((o) => [o.taskId, `${o.state}:${o.reason}`]))).toEqual({ [ids[0]!]: 'BLOCKED:PROVIDER_UNAVAILABLE', [ids[1]!]: 'BLOCKED:PROVIDER_UNKNOWN: ghost' });
    expect(types(s, ids[0]!)).toContain('ProviderUnavailable');
  });
});

describe('PHASE-06 gate: parallel simulated tasks with a dependency', () => {
  it('runs A and B at the same time in separate worktrees; C waits for A', async () => {
    const { s, ids, d } = await setup(['simulator', 'simulator', 'simulator'], { deps: [[2, 0]] });
    const r = await runQueue(d, { ownerId: 'w', maxParallel: 2, signal: new AbortController().signal });
    expect(r.outcomes.map((o) => o.taskId).sort()).toEqual([ids[0], ids[1]]);
    expect(r.outcomes.every((o) => o.state === 'REVIEW')).toBe(true);
    expect(r.waiting).toEqual([{ taskId: ids[2], reason: `aguarda ${ids[0]}(REVIEW)` }]);
    // paralelismo real: as duas tentativas começaram antes de qualquer uma terminar
    const ev = s.eventsSince(0, 1000);
    const firstExit = ev.find((e) => e.eventType === 'AttemptExited')!.seq;
    expect(ev.filter((e) => e.eventType === 'AttemptStarted' && e.seq < firstExit)).toHaveLength(2);
    const wts = ids.slice(0, 2).map((id) => s.listAttempts(id)[0]!.worktreePath);
    expect(new Set(wts).size).toBe(2);
  });
});

describe('real providers: consent and per-provider limit (PHASE-07, fake binary)', async () => {
  const { ClaudeCodeProvider } = await import('@aer/provider-claude');
  const fake = fileURLToPath(new URL('../../provider-claude/test/fixtures/fake-claude.mjs', import.meta.url));
  const claude = new ClaudeCodeProvider(adapter, { executable: process.execPath, prefixArgs: [fake], env: { PATH: process.env.PATH, HOME: process.env.HOME, SystemRoot: process.env.SystemRoot, FAKE_SCENARIO: 'ok' }, graceMs: 200 });

  it('without consent the task is BLOCKED CONSENT_REQUIRED and no attempt starts (AER-REQ-123)', async () => {
    const { s, ids, d } = await setup(['claude']);
    const o = await runAttempt({ ...d, providers: { claude } }, reserve(s)[0]!, new AbortController().signal);
    expect(o).toMatchObject({ state: 'BLOCKED', reason: expect.stringMatching(/^CONSENT_REQUIRED/) });
    expect(s.listAttempts(ids[0]!)).toEqual([]);
  });

  it('with consent a real-provider task reaches REVIEW, labelled with its contract status, never SIMULATED', async () => {
    const { s, ids, d } = await setup(['claude:sonnet']);
    const o = await runAttempt({ ...d, providers: { claude }, consented: new Set(['claude']) }, reserve(s)[0]!, new AbortController().signal);
    expect(o).toMatchObject({ state: 'REVIEW', simulated: false });
    const det = s.eventsSince(0, 1000).find((e) => e.eventType === 'ProviderDetected')!;
    expect(det.payload).toMatchObject({ providerId: 'claude', contractStatus: 'VERIFIED', simulated: false, label: null });
    expect(types(s, ids[0]!)).toContain('GitCheckpointCreated');
  });

  it('maxPerProvider counts claude:<model> as claude: two claude tasks never overlap', async () => {
    const { s, d } = await setup(['claude', 'claude:sonnet']);
    const r = await runQueue({ ...d, providers: { claude }, consented: new Set(['claude']) }, { ownerId: 'w', maxParallel: 2, maxPerProvider: { claude: 1 }, signal: new AbortController().signal });
    expect(r.outcomes.map((o) => o.state)).toEqual(['REVIEW', 'REVIEW']);
    const ev = s.eventsSince(0, 1000);
    const firstExit = ev.find((e) => e.eventType === 'AttemptExited')!.seq;
    expect(ev.filter((e) => e.eventType === 'AttemptStarted' && e.seq < firstExit)).toHaveLength(1);
  });
});
