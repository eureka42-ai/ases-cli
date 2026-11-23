import { describe, expect, it } from 'vitest';
import {
  ManifestSchema, formatAttemptId, formatPhaseId, formatTaskId, parsePhaseId, parseTaskId,
} from '../src/index.ts';

describe('ids (AER-REQ-021, AER-REQ-031)', () => {
  it('formats with padding and widens past the default width', () => {
    expect(formatPhaseId(1)).toBe('PHASE-01');
    expect(formatPhaseId(100)).toBe('PHASE-100');
    expect(formatTaskId(7)).toBe('TAR-0007');
    expect(formatTaskId(10000)).toBe('TAR-10000');
    expect(formatAttemptId(2)).toBe('ATT-0002');
  });

  it('101 phases never collide and round-trip', () => {
    const ids = Array.from({ length: 101 }, (_, i) => formatPhaseId(i + 1));
    expect(new Set(ids).size).toBe(101);
    ids.forEach((id, i) => expect(parsePhaseId(id)).toBe(i + 1));
  });

  it('rejects invalid or non-canonical ids', () => {
    for (const bad of ['TAR-1', 'TAR-0000', 'TAR-00001', 'tar-0001', 'TAR-0001x']) expect(() => parseTaskId(bad)).toThrow();
    expect(() => formatTaskId(0)).toThrow(RangeError);
    expect(() => formatTaskId(1.5)).toThrow(RangeError);
  });
});

describe('ManifestSchema (AER-REQ-013)', () => {
  const ok = {
    schemaVersion: 1, projectId: 'prj_0123456789', name: 'aer', createdAt: '2026-11-22T00:00:00.000Z',
    versions: { projectSchema: 1, dbSchema: 0 },
    sources: [{ path: 'fontes/ASES-300_DOCUMENTACAO_INTEGRAL.md', sha256: 'a'.repeat(64) }],
  };

  it('accepts a valid manifest', () => expect(ManifestSchema.parse(ok)).toEqual(ok));

  it.each(['/Users/x/file.md', 'C:\\x\\file.md', '\\\\server\\share\\f', '../outside.md'])('rejects non-relative path %s', (path) => {
    expect(ManifestSchema.safeParse({ ...ok, sources: [{ path, sha256: 'a'.repeat(64) }] }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(ManifestSchema.safeParse({ ...ok, token: 'x' }).success).toBe(false);
  });
});

describe('repository .ases/MANIFEST.json (AER-REQ-013, AER-REQ-151)', async () => {
  const { createHash } = await import('node:crypto');
  const { existsSync, readFileSync } = await import('node:fs');
  const root = new URL('../../../', import.meta.url);
  const file = new URL('.ases/MANIFEST.json', root);

  it.runIf(existsSync(file))('matches the schema and the current source checksums', () => {
    const manifest = ManifestSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    for (const s of manifest.sources) {
      expect(createHash('sha256').update(readFileSync(new URL(s.path, root))).digest('hex'), s.path).toBe(s.sha256);
    }
  });
});
