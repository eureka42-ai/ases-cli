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
