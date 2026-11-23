import { describe, expect, it } from 'vitest';
import {
  TASK_STATES, canTransitionPhase, canTransitionTask, canonicalJson, payloadSha256, validatePayload, type TaskState,
} from '../src/index.ts';

describe('task state machine (AER-REQ-033)', () => {
  it('walks the happy path', () => {
    const path: TaskState[] = ['DRAFT', 'PLANNED', 'READY', 'RESERVED', 'RUNNING', 'VERIFYING', 'REVIEW', 'APPROVED', 'MERGING', 'COMPLETED'];
    for (let i = 1; i < path.length; i++) expect(canTransitionTask(path[i - 1]!, path[i]!), `${path[i - 1]}->${path[i]}`).toBe(true);
  });

  it('rejects 20 invalid jumps', () => {
    const invalid: [TaskState, TaskState][] = [
      ['PLANNED', 'RUNNING'], ['PLANNED', 'COMPLETED'], ['READY', 'RUNNING'], ['READY', 'COMPLETED'], ['RUNNING', 'COMPLETED'],
      ['RUNNING', 'REVIEW'], ['VERIFYING', 'COMPLETED'], ['VERIFYING', 'APPROVED'], ['REVIEW', 'COMPLETED'], ['REVIEW', 'MERGING'],
      ['APPROVED', 'COMPLETED'], ['FAILED', 'COMPLETED'], ['FAILED', 'RUNNING'], ['COMPLETED', 'READY'], ['COMPLETED', 'BLOCKED'],
      ['CANCELLED', 'READY'], ['CANCEL_REQUESTED', 'READY'], ['CANCEL_REQUESTED', 'BLOCKED'], ['DRAFT', 'READY'], ['PAUSED', 'RUNNING'],
    ];
    for (const [a, b] of invalid) expect(canTransitionTask(a, b), `${a}->${b}`).toBe(false);
  });

  it('any active state can block or request cancel; terminals cannot', () => {
    for (const s of TASK_STATES) {
      const terminal = s === 'COMPLETED' || s === 'CANCELLED';
      if (s !== 'BLOCKED' && s !== 'CANCEL_REQUESTED') expect(canTransitionTask(s, 'BLOCKED'), s).toBe(!terminal);
      if (s !== 'CANCEL_REQUESTED') expect(canTransitionTask(s, 'CANCEL_REQUESTED'), s).toBe(!terminal);
    }
    expect(canTransitionTask('CANCEL_REQUESTED', 'CANCELLED')).toBe(true);
  });

  it('phase machine (AER-REQ-022)', () => {
    expect(canTransitionPhase('RUNNING', 'VERIFYING')).toBe(true);
    expect(canTransitionPhase('PLANNED', 'COMPLETED')).toBe(false);
    expect(canTransitionPhase('COMPLETED', 'RUNNING')).toBe(false);
  });
});

describe('canonical payload hash', () => {
  it('is key-order independent and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'x'], c: undefined })).toBe('{"a":[true,null,"x"],"b":1}');
    expect(payloadSha256({ a: 1, b: 2 })).toBe(payloadSha256({ b: 2, a: 1 }));
    expect(() => canonicalJson({ n: Number.NaN })).toThrow();
  });

  it('validates critical payloads strictly (AER-REQ-065)', () => {
    expect(() => validatePayload('TaskUpdated', { from: 'READY', to: 'RESERVED', reason: null })).not.toThrow();
    expect(() => validatePayload('TaskUpdated', { from: 'READY', to: 'DONE', reason: null })).toThrow();
    expect(() => validatePayload('TaskCreated', { title: 't', reqs: [], extra: 1 })).toThrow();
    expect(() => validatePayload('TestRunStarted', { anything: true })).not.toThrow(); // não crítico: livre
    expect(() => validatePayload('TestRunCompleted', { anything: true })).toThrow();
  });
});
