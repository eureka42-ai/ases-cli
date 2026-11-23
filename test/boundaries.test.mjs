import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkBoundaries } from '../scripts/check-boundaries.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('architecture boundaries (AER-REQ-006, AER-REQ-226, AER-REQ-109)', () => {
  it('flags every forbidden import and shell usage in the fixture', () => {
    const rules = checkBoundaries(path.join(here, 'fixtures/boundaries')).map((v) => `${path.basename(path.dirname(path.dirname(v.file)))}:${v.rule}`).sort();
    expect(rules).toEqual([
      'contracts:contracts-imports-nothing-internal',
      'core:no-shell-true',
      'core:portable-imports-os-specific',
      'platform-linux:platform-cross-import',
      'provider-claude:no-child-process-exec',
      'provider-claude:ui-lib-outside-tui',
    ]);
  });

  it('passes on the real repository', () => {
    expect(checkBoundaries(path.join(here, '..'))).toEqual([]);
  });
});
