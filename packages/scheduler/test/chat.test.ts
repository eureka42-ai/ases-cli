import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectStore } from '@aer/persistence';
import { createBaseAdapter, detectPlatform } from '@aer/platform-core';
import type { AgentProvider, AgentStreamEvent } from '@aer/provider-sdk';
import { SimulatorProvider } from '@aer/provider-simulator';
import { ChatQueue, buildMainPrompt, runChatTurn, type WorkerDeps } from '../src/index.ts';
import { tempRepo } from '../../git-bridge/test/helpers.ts';

const adapter = createBaseAdapter(detectPlatform(), 'test');
const P = { id: 'prj_chat000001', name: 'chat' };

async function setup(extra: Record<string, AgentProvider> = {}) {
  const root = await tempRepo();
  const s = ProjectStore.open(':memory:', P);
  const providers: Record<string, AgentProvider> = {
    simulator: new SimulatorProvider(adapter), 'simulator-2': new SimulatorProvider(adapter, { id: 'simulator-2' }), 'simulator-3': new SimulatorProvider(adapter, { id: 'simulator-3' }), ...extra,
  };
  const d: WorkerDeps = { root, mutate: (fn) => fn(s), providers, ttlMs: 30_000, timeoutMs: 15_000, consented: new Set() };
  const cnv = s.startConversation('simulator', 'manual');
  return { root, s, d, cnv };
}
const turn = (d: WorkerDeps, cnv: string, message: string, o: Partial<Parameters<typeof runChatTurn>[1]> = {}) =>
  runChatTurn(d, { conversationId: cnv, message, main: 'simulator', ready: ['simulator', 'simulator-2', 'simulator-3'], signal: new AbortController().signal, ...o });

describe('chat turn of the main IA (PHASE-18, TAR-0084)', () => {
  it('a plain message gets a SIMULATED reply stored as role main', async () => {
    const { s, d, cnv } = await setup();
    const r = await turn(d, cnv, 'olá');
    expect(r).toMatchObject({ ok: true, reply: 'SIMULATED: entendi — olá' });
    expect(s.listChatMessages(cnv).map((m) => [m.role, m.provider, m.text])).toEqual([['user', null, 'olá'], ['main', 'simulator', 'SIMULATED: entendi — olá']]);
  });

  it('an edit request writes the file and records a restore point', async () => {
    const { root, s, d, cnv } = await setup();
    const r = await turn(d, cnv, 'edite o readme');
    expect(r).toMatchObject({ ok: true, restore: { n: 1, files: ['SIMULATED/CHAT.md'] } });
    expect(existsSync(path.join(root, 'SIMULATED', 'CHAT.md'))).toBe(true);
    expect(s.lastRestorePoint(cnv)).toMatchObject({ n: 1, ref: `refs/ases/restore/${cnv}/1`, files: ['SIMULATED/CHAT.md'] });
  });

  it('engine files under .ases never count as edits of the turn', async () => {
    const { root, d, cnv } = await setup();
    mkdirSync(path.join(root, '.ases'), { recursive: true });
    // o engine reescreve o espelho (.ases/HISTORY.jsonl) a cada mutação, inclusive durante o turno
    const d2: WorkerDeps = { ...d, mutate: (fn) => { writeFileSync(path.join(root, '.ases', 'HISTORY.jsonl'), String(Math.random())); return d.mutate(fn); } };
    const r = await turn(d2, cnv, 'edite o readme');
    expect(r).toMatchObject({ ok: true, restore: { files: ['SIMULATED/CHAT.md'] } });
  });

  it('a split request stores a PENDING plan with assignments excluding the main', async () => {
    const { s, d, cnv } = await setup();
    const r = await turn(d, cnv, 'divida em tarefas o cadastro');
    expect(r.ok && r.planId).toBe('PLN-0001');
    const plan = s.pendingPlan(cnv)!;
    expect(plan.tasks.map((t) => t.provider)).toEqual(['simulator-2', 'simulator-3', 'simulator-2']);
    expect(plan.tasks[2]!.dependsOn).toEqual([1]);
    expect(r.ok && r.reply).toBe('SIMULATED: proposta abaixo');
  });

  it('provider failure becomes ChatTurnFailed, never a reply', async () => {
    const { s, d, cnv } = await setup();
    const r = await turn(d, cnv, 'olá', { preference: 'fail' });
    expect(r.ok).toBe(false);
    expect(s.listChatMessages(cnv).map((m) => m.role)).toEqual(['user']);
    expect(s.eventsSince(0).some((e) => e.eventType === 'ChatTurnFailed')).toBe(true);
  });

  it('real provider without consent does not run', async () => {
    let started = 0;
    const fake: AgentProvider = {
      id: 'claude', contractVersion: 1, requiresConsent: true,
      probe: async () => { throw new Error('probe must not run'); },
      start: () => { started++; return (async function* (): AsyncGenerator<AgentStreamEvent> {})(); },
      cancel: async () => undefined,
    };
    const { d, cnv } = await setup({ claude: fake });
    const r = await turn(d, cnv, 'olá', { main: 'claude' });
    expect(r).toMatchObject({ ok: false, code: 'CONSENT_REQUIRED' });
    expect(started).toBe(0);
  });

  it('a file_change into .git or a secret aborts the turn as a security violation', async () => {
    const evil: AgentProvider = {
      id: 'simulator-4', contractVersion: 1, requiresConsent: false,
      probe: async () => ({ providerId: 'simulator-4', contractVersion: 1, simulated: true, contractStatus: 'SIMULATED', availability: 'READY', capabilities: [], evidence: [] }),
      start: () => (async function* (): AsyncGenerator<AgentStreamEvent> {
        yield { type: 'file_change', relativePath: '.env', kind: 'modify' };
        yield { type: 'message', text: 'pronto', visibleToUser: true };
        yield { type: 'exit', exitCode: 0, signal: null, cancelled: false, reconciled: true };
      })(),
      cancel: async () => undefined,
    };
    const { s, d, cnv } = await setup({ 'simulator-4': evil });
    const r = await turn(d, cnv, 'olá', { main: 'simulator-4' });
    expect(r).toMatchObject({ ok: false, code: 'SECURITY_VIOLATION' });
    expect(s.eventsSince(0).some((e) => e.eventType === 'SecurityViolationBlocked')).toBe(true);
  });

  it('queue runs turns one at a time in order', async () => {
    const log: string[] = [];
    let active = 0;
    const q = new ChatQueue(async (m) => {
      active++;
      log.push(`start ${m} (${active})`);
      await new Promise((r) => setTimeout(r, 30));
      active--;
      log.push(`end ${m}`);
      return { ok: true, reply: m };
    });
    const a = q.enqueue('a');
    const b = q.enqueue('b');
    expect(q.pending).toBe(2);
    await Promise.all([a, b]);
    expect(log).toEqual(['start a (1)', 'end a', 'start b (1)', 'end b']);
    expect(q.pending).toBe(0);
  });

  it('history beyond budget is trimmed, the new message is always kept', () => {
    const history = Array.from({ length: 200 }, (_, i) => ({ n: i + 1, role: (i % 2 ? 'main' : 'user') as 'main' | 'user', provider: null, text: `m${i} ${'x'.repeat(500)}`, createdAt: '' }));
    const p = buildMainPrompt({ project: 'p', phases: [], openTasks: [], ready: ['codex'], main: 'claude', history, message: 'MENSAGEM NOVA' });
    expect(p.length).toBeLessThanOrEqual(24_000);
    expect(p).toContain('MENSAGEM NOVA');
    expect(p).toContain('resumido');
    expect(p).toContain('m199');
    expect(p.trimEnd().endsWith('MENSAGEM NOVA')).toBe(true);
  });
});
