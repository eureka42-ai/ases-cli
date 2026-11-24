import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openStore, tempDir } from './helpers.ts';

const dir = tempDir();
let n = 0;
const fresh = () => openStore(path.join(dir, `chat-${++n}.sqlite`));
const plannedTask = (title: string) => ({ title, instructions: `faça ${title}`, provider: 'codex', kind: 'code' as const, dependsOn: [] as number[] });

describe('conversation store (PHASE-18, TAR-0080)', () => {
  it('conversation lifecycle emits events in order', () => {
    const s = fresh();
    const before = s.lastSeq();
    const cnv = s.startConversation('claude', 'manual');
    expect(cnv).toBe('CNV-0001');
    expect(s.addChatMessage(cnv, { role: 'user', provider: null, text: 'olá' })).toBe(1);
    expect(s.addChatMessage(cnv, { role: 'main', provider: 'claude', text: 'oi' })).toBe(2);
    s.setMainProvider(cnv, 'codex');
    const plan = s.proposePlan(cnv, [plannedTask('A')], ['codex: a menos ocupada']);
    expect(plan).toBe('PLN-0001');
    s.decidePlan(plan, 'approved', 'user');
    expect(s.eventsSince(before).map((e) => e.eventType)).toEqual(['ConversationStarted', 'ChatMessageAdded', 'ChatMessageAdded', 'MainProviderChanged', 'PlanProposed', 'PlanDecided']);
    expect(s.currentConversation()).toMatchObject({ id: cnv, main: 'codex', mode: 'manual', phaseId: null });
    expect(s.listChatMessages(cnv).map((m) => [m.n, m.role, m.text])).toEqual([[1, 'user', 'olá'], [2, 'main', 'oi']]);
    expect(s.getPlan(plan)).toMatchObject({ state: 'APPROVED', tasks: [plannedTask('A')] });
  });

  it('chat text is redacted before storage', () => {
    const s = fresh();
    const cnv = s.startConversation('claude', 'manual');
    s.addChatMessage(cnv, { role: 'user', provider: null, text: 'token sk-ant-abc123456789012345678901234567890' });
    const m = s.listChatMessages(cnv)[0]!;
    expect(m.text).not.toContain('sk-ant-');
    expect(s.eventsSince(0).filter((e) => e.eventType === 'ChatMessageAdded').at(-1)!.payload).toMatchObject({ redacted: true });
  });

  it('only one PENDING plan per conversation', () => {
    const s = fresh();
    const cnv = s.startConversation('claude', 'manual');
    const a = s.proposePlan(cnv, [plannedTask('A')], []);
    const b = s.proposePlan(cnv, [plannedTask('B')], []);
    expect(s.getPlan(a)!.state).toBe('CANCELLED');
    expect(s.pendingPlan(cnv)!.id).toBe(b);
    expect(s.eventsSince(0).filter((e) => e.eventType === 'PlanDecided').map((e) => e.payload)).toEqual([{ planId: a, decision: 'cancelled', by: 'system' }]);
  });

  it('mode, phase, plan state and restore points', () => {
    const s = fresh();
    const cnv = s.startConversation('claude', 'manual');
    s.setConversationMode(cnv, 'auto');
    const ph = s.createPhase(`Conversa ${cnv}`);
    s.setConversationPhase(cnv, ph);
    expect(s.currentConversation()).toMatchObject({ mode: 'auto', phaseId: ph });
    const p = s.proposePlan(cnv, [plannedTask('A')], []);
    s.decidePlan(p, 'edited', 'user', [{ ...plannedTask('A'), provider: 'kimi' }]);
    expect(s.getPlan(p)).toMatchObject({ state: 'APPROVED', tasks: [{ provider: 'kimi' }] });
    s.setPlanState(p, 'RUNNING');
    s.setPlanState(p, 'DONE');
    expect(s.getPlan(p)!.state).toBe('DONE');
    expect(s.addRestorePoint(cnv, { ref: `refs/ases/restore/${cnv}/1`, commit: 'a'.repeat(40), files: ['x.txt'] })).toBe(1);
    expect(s.lastRestorePoint(cnv)).toMatchObject({ n: 1, files: ['x.txt'], appliedAt: null });
    s.markRestoreApplied(cnv, 1);
    expect(s.lastRestorePoint(cnv)).toBeUndefined();
    expect(s.eventsSince(0).filter((e) => e.eventType.startsWith('RestorePoint')).map((e) => e.eventType)).toEqual(['RestorePointCreated', 'RestorePointApplied']);
  });

  it('rejects unknown roles and modes', () => {
    const s = fresh();
    expect(() => s.startConversation('claude', 'turbo' as 'manual')).toThrow(/mode/);
    const cnv = s.startConversation('claude', 'manual');
    expect(() => s.addChatMessage(cnv, { role: 'bot' as 'user', provider: null, text: 'x' })).toThrow();
  });
});
