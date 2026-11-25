import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '@aer/contracts';
import { eventSeverity, isError } from '../src/format.ts';

const ev = (eventType: string, payload: Record<string, unknown> = {}) => ({ seq: 1, eventType, payload, occurredAt: new Date(0).toISOString() }) as unknown as EventEnvelope;

describe('ases-tar --errors (AER-REQ-095)', () => {
  it('keeps only error/critical across a fixture of mixed severities', () => {
    const fixture = [
      ev('TaskCreated', { title: 'x' }),
      ev('SecurityViolationBlocked'),
      ev('TaskFailed'),
      ev('AttemptExited', { state: 'EXITED', exitCode: 0, failureCode: null }),
      ev('AttemptExited', { state: 'FAILED', exitCode: 1, failureCode: 'TIMEOUT' }),
      ev('TestRunCompleted', { exitCode: 0, failed: 0 }),
      ev('TestRunCompleted', { exitCode: 1, failed: 2 }),
      ev('TaskReworkRequested'),
      ev('ApprovalDenied'),
    ];
    expect(fixture.map(eventSeverity)).toEqual(['info', 'critical', 'error', 'info', 'error', 'info', 'error', 'warning', 'error']);
    expect(fixture.filter(isError)).toHaveLength(5);
  });
});

describe('quick, human actions: who is doing what (PHASE-19)', () => {
  const at = (eventType: string, payload: Record<string, unknown>, taskId: string | null = 'TAR-0003') => ({ seq: 7, eventType, payload, taskId, phaseId: null, occurredAt: new Date(0).toISOString() }) as unknown as EventEnvelope;
  it('tool calls and edits say which IA, which task and the action', async () => {
    const { actionText } = await import('../src/format.ts');
    expect(actionText(at('ProviderToolCallObserved', { providerId: 'codex', name: 'Read', arguments: '{"file_path":"src/app.ts"}' }))).toBe('codex · TAR-0003 · Lendo src/app.ts');
    expect(actionText(at('ProviderToolResultObserved', { providerId: 'kimi', name: 'file_change', success: true, summary: 'modify README.md' }))).toBe('kimi · TAR-0003 · Editou README.md');
    expect(actionText(at('ProviderToolCallObserved', { providerId: 'claude', conversationId: 'CNV-0001', name: 'Edit', arguments: '{"file_path":"x.ts"}' }, null))).toBe('claude (principal) · Editando x.ts');
    expect(actionText(at('ChatMessageAdded', { role: 'user', provider: null, text: 'crie testes para o pagamento' }, null))).toBe('você: crie testes para o pagamento');
    expect(actionText(at('ChatMessageAdded', { role: 'main', provider: 'claude', text: 'Vou dividir em 2 tarefas e mandar para o codex e o kimi agora mesmo, ok?' }, null))).toBe('claude respondeu: Vou dividir em 2 tarefas e mandar para o codex e o kimi…'); // corta na palavra, até 60
    expect(actionText(at('PlanProposed', { planId: 'PLN-0001', tasks: [{ provider: 'codex' }, { provider: 'kimi' }, { provider: 'codex' }] }, null))).toBe('plano PLN-0001: 3 tarefas → codex, kimi');
    expect(actionText(at('AttemptStarted', { providerId: 'codex', fencingToken: 1, branch: 'b', baseCommit: 'c' }))).toBe('codex começou TAR-0003');
    expect(actionText(at('TaskCreated', { title: 'x', reqs: [] }))).toBeUndefined();
  });
  it('formatEvent uses the quick action when there is one', async () => {
    const { formatEvent } = await import('../src/format.ts');
    expect(formatEvent(at('ProviderToolCallObserved', { providerId: 'codex', name: 'Read', arguments: '{"file_path":"a.ts"}' }), true)).toMatch(/^#0007 \S+ +codex · TAR-0003 · Lendo a\.ts$/);
  });
});
