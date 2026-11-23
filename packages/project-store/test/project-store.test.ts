import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findProjectRoot, initProject, isInterimProject, loadPlatformAdapter, paths, readSession } from '../src/index.ts';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'aer proj ã '));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const adapter = await loadPlatformAdapter();

function hashes(dir: string, out: Record<string, string> = {}): Record<string, string> {
  for (const n of readdirSync(dir)) {
    const f = path.join(dir, n);
    if (statSync(f).isDirectory()) hashes(f, out);
    else out[path.relative(tmp, f)] = createHash('sha256').update(readFileSync(f)).digest('hex');
  }
  return out;
}

describe('ases init (TAR-0011, AER-REQ-011, AER-REQ-017)', () => {
  const root = path.join(tmp, 'meu projeto');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'app.ts'), 'export {};\n');

  it('creates .ases/ with a valid manifest and private db dir', () => {
    const { created, manifest } = initProject(root, adapter, 'meu projeto');
    expect(created).toContain('.ases/MANIFEST.json');
    expect(manifest.projectId).toMatch(/^prj_[0-9a-f]{12}$/);
    if (process.platform !== 'win32') expect(statSync(paths(root).dbDir).mode & 0o777).toBe(0o700);
    expect(readFileSync(path.join(root, '.ases', '.gitignore'), 'utf8')).toMatch(/^db\/$/m);
  });

  it('second run changes no byte, keeps user edits and user files', () => {
    writeFileSync(path.join(root, '.ases', 'STATUS.md'), 'editado\n');
    const before = hashes(root);
    expect(initProject(root, adapter).created).toEqual([]);
    expect(hashes(root)).toEqual(before);
  });

  it('finds the root from a subdirectory (AER-REQ-012)', () => {
    expect(findProjectRoot(path.join(root, 'src'))).toBe(root);
    expect(findProjectRoot(tmp)).toBeUndefined();
  });

  it('detects the interim bootstrap history', () => {
    expect(isInterimProject(root)).toBe(false);
    writeFileSync(paths(root).history, `${JSON.stringify({ actor: 'ases-dev-interim', seq: 1 })}\n`);
    expect(isInterimProject(root)).toBe(true);
  });

  it('reports a missing engine session clearly', () => {
    expect(() => readSession(adapter, 'prj_naoexiste01')).toThrow(/no running ases engine/);
  });
});

describe('loadPlatformAdapter (CHANGE-0001)', () => {
  it('refuses macOS Intel before loading anything', async () => {
    await expect(loadPlatformAdapter('darwin', 'x64')).rejects.toThrow(/fora do escopo/);
    expect((await loadPlatformAdapter('linux', 'x64')).id).toBe('linux');
  });
});
