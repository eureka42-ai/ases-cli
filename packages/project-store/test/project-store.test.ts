import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findProjectRoot, historyState, initProject, isInterimProject, loadPlatformAdapter, paths, readManifest, readSession } from '../src/index.ts';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'aer proj ã '));
afterAll(() => rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
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

  it('project id survives renaming/moving the folder (AER-REQ-019)', () => {
    const a = path.join(tmp, 'antes ç');
    mkdirSync(a, { recursive: true });
    const id = initProject(a, adapter).manifest.projectId;
    const b = path.join(tmp, 'depois renomeado ç');
    renameSync(a, b);
    expect(readManifest(b).projectId).toBe(id);
    expect(initProject(b, adapter)).toMatchObject({ created: [], manifest: { projectId: id } });
  });

  it('finds the root from a subdirectory (AER-REQ-012)', () => {
    expect(findProjectRoot(path.join(root, 'src'))).toBe(root);
    expect(findProjectRoot(tmp)).toBeUndefined();
  });

  it('detects the interim bootstrap history', () => {
    expect(isInterimProject(root)).toBe(false);
    writeFileSync(paths(root).history, `${JSON.stringify({ actor: 'ases-dev-interim', seq: 1 })}\n`);
    expect(isInterimProject(root)).toBe(true);
    writeFileSync(paths(root).history, `${JSON.stringify({ actor: 'ases-dev-interim', seq: 1 })}\n${JSON.stringify({ actor: 'ases', seq: 2 })}\n`);
    expect(historyState(root)).toBe('DB_MISSING'); // histórico do engine sem banco: não pode recriar
    writeFileSync(paths(root).db, ''); // depois do corte existe banco: deixa de ser interino
    expect(isInterimProject(root)).toBe(false);
    expect(historyState(root)).toBe('OK');
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

describe('brand preferences from config files (TAR-0073, AER-REQ-249)', () => {
  it('reads ui.theme/ui.logo from the project, then the global file; bad JSON names the file', async () => {
    const { brandConfigLayers, globalConfigFile } = await import('../src/index.ts');
    const d = mkdtempSync(path.join(os.tmpdir(), 'aer cfg ç '));
    mkdirSync(path.join(d, '.ases'));
    writeFileSync(path.join(d, '.ases', 'CONFIG.json'), JSON.stringify({ schemaVersion: 1, ui: { theme: 'purple' } }));
    const g = path.join(d, 'global.json');
    writeFileSync(g, JSON.stringify({ ui: { theme: 'gold', logo: 'minimal' } }));
    expect(brandConfigLayers(d, g)).toEqual([{ source: '.ases/CONFIG.json', theme: 'purple', logo: undefined }, { source: g, theme: 'gold', logo: 'minimal' }]);
    expect(brandConfigLayers(undefined, path.join(d, 'nao-existe.json'))).toEqual([{ source: path.join(d, 'nao-existe.json') }]);
    writeFileSync(g, '{ quebrado');
    expect(() => brandConfigLayers(undefined, g)).toThrow(/global\.json/);
    expect(globalConfigFile('win32', { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' }, 'C:\\Users\\u')).toBe('C:\\Users\\u\\AppData\\Roaming\\ases\\config.json');
    expect(globalConfigFile('linux', { XDG_CONFIG_HOME: '/x' }, '/home/u')).toBe('/x/ases/config.json');
    expect(globalConfigFile('darwin', {}, '/Users/u')).toBe('/Users/u/.config/ases/config.json');
    rmSync(d, { recursive: true, force: true });
  });
});

describe('chat config by layers (PHASE-18, TAR-0079)', () => {
  const setup = (project: unknown, global: unknown) => {
    const d = mkdtempSync(path.join(os.tmpdir(), 'aer chat cfg ç '));
    mkdirSync(path.join(d, '.ases'));
    if (project !== undefined) writeFileSync(path.join(d, '.ases', 'CONFIG.json'), JSON.stringify(project));
    const g = path.join(d, 'global.json');
    if (global !== undefined) writeFileSync(g, JSON.stringify(global));
    return { d, g };
  };
  it('chat config: project overrides global, defaults otherwise', async () => {
    const { chatConfig } = await import('../src/index.ts');
    const { d, g } = setup({ chat: { main: 'claude' } }, { chat: { main: 'codex', mode: 'auto' } });
    const c = chatConfig(d, g);
    expect(c.main).toBe('claude');
    expect(c.sources.main).toBe('.ases/CONFIG.json');
    expect(c.mode).toBe('auto');
    expect(c.sources.mode).toBe(g);
    expect(c.crossReview).toBe(true);
    expect(c.sources.crossReview).toBe('default');
    expect(c.limits).toEqual({});
    expect(c.consent).toEqual([]);
    expect(chatConfig(undefined, path.join(d, 'none.json')).mode).toBe('manual');
    rmSync(d, { recursive: true, force: true });
  });
  it('saveChatConfig keeps other keys and is atomic', async () => {
    const { chatConfig, saveChatConfig } = await import('../src/index.ts');
    const { d, g } = setup({ ui: { theme: 'blue' } }, undefined);
    saveChatConfig('project', d, { main: 'kimi', limits: { codex: 2 } }, g);
    const j = JSON.parse(readFileSync(path.join(d, '.ases', 'CONFIG.json'), 'utf8'));
    expect(j.ui.theme).toBe('blue');
    expect(j.chat).toEqual({ main: 'kimi', limits: { codex: 2 } });
    saveChatConfig('global', undefined, { mode: 'hybrid' }, g);
    expect(chatConfig(d, g).mode).toBe('hybrid');
    expect(readdirSync(path.join(d, '.ases')).filter((f) => f.includes('.tmp'))).toEqual([]);
    rmSync(d, { recursive: true, force: true });
  });
  it('invalid chat values name the file', async () => {
    const { chatConfig } = await import('../src/index.ts');
    const { d, g } = setup({ chat: { mode: 'turbo' } }, undefined);
    expect(() => chatConfig(d, g)).toThrow(/CONFIG\.json.*chat\.mode/);
    writeFileSync(path.join(d, '.ases', 'CONFIG.json'), JSON.stringify({ chat: { limits: { codex: 0 } } }));
    expect(() => chatConfig(d, g)).toThrow(/chat\.limits/);
    writeFileSync(path.join(d, '.ases', 'CONFIG.json'), JSON.stringify({ chat: { testCommand: 'npm test' } }));
    expect(() => chatConfig(d, g)).toThrow(/chat\.testCommand/);
    rmSync(d, { recursive: true, force: true });
  });
});
