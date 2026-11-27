import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openStore, tempDir } from './helpers.ts';

const dir = tempDir();
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return 'NO_ERROR';
};

describe('registro de problemas (PHASE-27, issues do ESAA)', () => {
  it('a problem is reported with symptom and repro, then resolved by a person; both are events and survive /verificar', () => {
    const s = openStore(path.join(dir, 'i.sqlite'));
    const id = s.reportIssue({ title: 'Testes falham', symptom: 'npm test sai com 1', repro: 'rode npm test na branch', taskId: 'TAR-0002' });
    expect(id).toBe('ISS-0001');
    expect(s.listIssues()).toMatchObject([{ id, state: 'OPEN', title: 'Testes falham', symptom: 'npm test sai com 1', repro: 'rode npm test na branch', taskId: 'TAR-0002', resolution: null }]);
    s.resolveIssue(id, 'corrigido no TAR-0005', 'Prof. Raul');
    expect(s.listIssues()[0]).toMatchObject({ state: 'RESOLVED', resolution: 'corrigido no TAR-0005', resolvedBy: 'Prof. Raul' });
    expect(s.eventsSince(0).filter((e) => e.eventType.startsWith('Issue')).map((e) => e.eventType)).toEqual(['IssueReported', 'IssueResolved']);
    expect(s.verifyState().problems).toEqual([]);
  });

  it('refuses a problem without title or symptom, resolving twice, and unknown ids', () => {
    const s = openStore(path.join(dir, 'j.sqlite'));
    expect(code(() => s.reportIssue({ title: 'x', symptom: ' ' }))).toBe('INVALID_INPUT');
    const id = s.reportIssue({ title: 'x', symptom: 'y' });
    expect(code(() => s.resolveIssue(id, ' ', 'p'))).toBe('INVALID_INPUT');
    s.resolveIssue(id, 'ok', 'p');
    expect(code(() => s.resolveIssue(id, 'de novo', 'p'))).toBe('INVALID_TRANSITION');
    expect(code(() => s.resolveIssue('ISS-0099', 'ok', 'p'))).toBe('NOT_FOUND');
  });
});
