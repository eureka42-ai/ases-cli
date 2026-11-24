import { describe, expect, it } from 'vitest';
import { matrix, render, stateOf } from '../scripts/support-matrix.mjs';

describe('support matrix (TAR-0068, AER-REQ-233/239)', () => {
  it('only success is PASS; cancelled/queued are NOT_RUN; a target passes only if every job passed', () => {
    expect(stateOf({ status: 'completed', conclusion: 'success' })).toBe('PASS');
    expect(stateOf({ status: 'completed', conclusion: 'failure' })).toBe('FAIL');
    expect(stateOf({ status: 'completed', conclusion: 'cancelled' })).toBe('NOT_RUN');
    expect(stateOf({ status: 'queued', conclusion: '' })).toBe('NOT_RUN');
    const rows = matrix([
      { name: 'verify (macos-latest, 22.x)', status: 'completed', conclusion: 'success' },
      { name: 'verify (macos-latest, 24.x)', status: 'completed', conclusion: 'cancelled' },
      { name: 'verify (windows-11-arm, 22.x)', status: 'completed', conclusion: 'success' },
      { name: 'support-matrix', status: 'completed', conclusion: 'success' },
    ]);
    expect(rows.map((r) => `${r.target}/${r.node}:${r.state}`)).toEqual(['darwin-arm64/22.x:PASS', 'darwin-arm64/24.x:NOT_RUN', 'win32-arm64/22.x:PASS']);
    const md = render(rows, { run: 1 });
    expect(md).toContain('| darwin-arm64 | NOT_RUN |');
    expect(md).toContain('| win32-arm64 | PASS |');
  });
});
