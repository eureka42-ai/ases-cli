import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '@aer/contracts';
import { metricsText, providerMetrics } from '../src/metrics.ts';

let seq = 0;
const ev = (eventType: string, t: string, payload: Record<string, unknown>, ids: { taskId?: string; attemptId?: string } = {}) =>
  ({ seq: ++seq, eventType, occurredAt: `2026-11-27T10:00:${t}.000Z`, taskId: ids.taskId ?? null, attemptId: ids.attemptId ?? null, payload }) as unknown as EventEnvelope;

describe('métricas por IA (PHASE-26, runner metrics do ESAA)', () => {
  const events = [
    ev('AttemptStarted', '00', { providerId: 'codex' }, { taskId: 'TAR-0001', attemptId: 'ATT-0001' }),
    ev('ProviderUsageObserved', '05', { metric: 'output_tokens', value: 1200, unit: 'tokens', source: 'x' }, { taskId: 'TAR-0001', attemptId: 'ATT-0001' }),
    ev('AttemptExited', '10', { state: 'EXITED', exitCode: 0, failureCode: null }, { taskId: 'TAR-0001', attemptId: 'ATT-0001' }),
    ev('TaskReworkRequested', '11', { reason: 'TESTS_FAILING' }, { taskId: 'TAR-0001' }),
    ev('AttemptStarted', '20', { providerId: 'kimi' }, { taskId: 'TAR-0002', attemptId: 'ATT-0002' }),
    ev('AttemptExited', '50', { state: 'FAILED', exitCode: 1, failureCode: 'TASK_FAILED' }, { taskId: 'TAR-0002', attemptId: 'ATT-0002' }),
  ];

  it('counts attempts, successes, failures, reworks, average time and tokens per AI', () => {
    expect(providerMetrics(events)).toEqual([
      { provider: 'codex', attempts: 1, ok: 1, failed: 0, reworks: 1, avgSeconds: 10, tokens: 1200 },
      { provider: 'kimi', attempts: 1, ok: 0, failed: 1, reworks: 0, avgSeconds: 30, tokens: 0 },
    ]);
  });

  it('prints one line per AI, or says there is nothing yet', () => {
    expect(metricsText(events)).toContain('codex · 1 tentativa(s) · 100% ok · 1 refação(ões) · média 10 s · 1.200 tokens');
    expect(metricsText([])).toMatch(/nenhuma tarefa executada/);
  });
});
