import { describe, expect, it } from 'vitest';
import { boundaryViolations } from '../src/boundaries.ts';

describe('limites de escrita por tipo de tarefa (PHASE-26, boundaries do ESAA)', () => {
  it('docs only touch documentation', () => {
    expect(boundaryViolations('docs', ['README.md', 'docs/guia.md', 'CHANGELOG', 'notas.txt'])).toEqual([]);
    expect(boundaryViolations('docs', ['README.md', 'src/app.ts'])).toEqual(['src/app.ts']);
  });

  it('tests only touch test files', () => {
    expect(boundaryViolations('test', ['test/a.test.ts', 'src/x.spec.js', 'pkg/__tests__/b.js', 'tests/test_api.py', 'api/user_test.go', 'test/fixtures/x.json'])).toEqual([]);
    expect(boundaryViolations('test', ['test/a.test.ts', 'src/app.ts'])).toEqual(['src/app.ts']);
  });

  it('a review changes nothing; code and other change anything', () => {
    expect(boundaryViolations('review', ['a.md'])).toEqual(['a.md']);
    expect(boundaryViolations('code', ['src/app.ts', 'README.md', 'test/a.test.ts'])).toEqual([]);
    expect(boundaryViolations('other', ['qualquer.bin'])).toEqual([]);
  });
});
