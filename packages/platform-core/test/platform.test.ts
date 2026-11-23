import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  NotImplementedError, PlatformError, assertSupportedTarget, createBaseAdapter, createLocalIpcEndpoint, detectPlatform, ensurePrivateDir, targetStatus, writePrivateFile,
  getRuntimeDir, getTerminalCapabilities, normalizeProjectPath, type PlatformDeps,
} from '../src/index.ts';

const mac: PlatformDeps = { env: {}, tmpdir: '/var/folders/ab/xyz/T', homedir: '/Users/u', username: 'u' };
const linux: PlatformDeps = { env: {}, tmpdir: '/tmp', homedir: '/home/u', username: 'u' };
const win: PlatformDeps = { env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, tmpdir: 'C:\\Temp', homedir: 'C:\\Users\\u', username: 'u' };

describe('detectPlatform (AER-REQ-225)', () => {
  it('accepts the three targets and rejects others', () => {
    for (const p of ['darwin', 'win32', 'linux']) expect(detectPlatform(p)).toBe(p);
    expect(() => detectPlatform('freebsd')).toThrow(PlatformError);
  });
});

describe('IPC endpoint per OS (AER-REQ-227, AER-REQ-228)', () => {
  it('uses UDS on darwin/linux and a named pipe on win32', () => {
    expect(createLocalIpcEndpoint('darwin', mac, 'prj_a')).toMatchObject({ kind: 'uds' });
    expect(createLocalIpcEndpoint('linux', linux, 'prj_a').address).toMatch(/^\/tmp\/ases-[0-9a-f]{16}-[0-9a-f]{16}\/engine\.sock$/);
    expect(createLocalIpcEndpoint('win32', win, 'prj_a').address).toMatch(/^\\\\\.\\pipe\\ases-[0-9a-f]{16}-[0-9a-f]{16}$/);
  });

  it('is stable per project and differs between projects', () => {
    const a = createLocalIpcEndpoint('darwin', mac, 'prj_a').address;
    expect(createLocalIpcEndpoint('darwin', mac, 'prj_a').address).toBe(a);
    expect(createLocalIpcEndpoint('darwin', mac, 'prj_b').address).not.toBe(a);
  });

  it('prefers XDG_RUNTIME_DIR on linux', () => {
    expect(getRuntimeDir('linux', { ...linux, env: { XDG_RUNTIME_DIR: '/run/user/1000' } }, 'prj_a')).toMatch(/^\/run\/user\/1000\/ases-/);
  });

  it('refuses socket paths over the sun_path limit', () => {
    expect(() => createLocalIpcEndpoint('darwin', { ...mac, tmpdir: `/${'x'.repeat(90)}` }, 'prj_a')).toThrow(/exceeds/);
  });

  it('builds windows runtime dirs with windows separators', () => {
    expect(getRuntimeDir('win32', win, 'prj_a')).toMatch(/^C:\\Users\\u\\AppData\\Local\\ases\\runtime\\[0-9a-f]{16}$/);
  });
});

describe('terminal capabilities (AER-REQ-245, AER-REQ-089)', () => {
  const tty = { isTTY: true, columns: 80, rows: 24 };
  const utf8 = { LANG: 'pt_BR.UTF-8' };

  it('enables color+unicode on a UTF-8 TTY', () => {
    expect(getTerminalCapabilities('darwin', utf8, tty)).toEqual({ isTTY: true, color: true, unicode: true, columns: 80, rows: 24 });
  });

  it.each([
    ['NO_COLOR', { ...utf8, NO_COLOR: '1' }, tty],
    ['TERM=dumb', { ...utf8, TERM: 'dumb' }, tty],
    ['piped stdout', utf8, { isTTY: false }],
  ])('disables color for %s', (_n, env, stream) => {
    expect(getTerminalCapabilities('linux', env, stream).color).toBe(false);
  });

  it('treats empty NO_COLOR as unset (no-color.org)', () => {
    expect(getTerminalCapabilities('darwin', { ...utf8, NO_COLOR: '' }, tty).color).toBe(true);
  });

  it('falls back to ASCII without UTF-8 locale or outside Windows Terminal', () => {
    expect(getTerminalCapabilities('linux', {}, tty).unicode).toBe(false);
    expect(getTerminalCapabilities('win32', {}, tty).unicode).toBe(false);
    expect(getTerminalCapabilities('win32', { WT_SESSION: 'x' }, tty).unicode).toBe(true);
  });
});

describe('normalizeProjectPath (AER-REQ-230, host only)', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aer path ação '));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('resolves spaces, accents and symlinks to the canonical path', () => {
    const real = path.join(root, 'projeto com espaço');
    mkdirSync(real);
    const link = path.join(root, 'atalho');
    symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir'); // junction dispensa admin no Windows
    expect(normalizeProjectPath(link)).toBe(normalizeProjectPath(real));
    expect(normalizeProjectPath(path.join(link, '..', 'atalho'))).toBe(normalizeProjectPath(real));
  });
});

describe('base adapter', () => {
  const adapter = createBaseAdapter('darwin', 'test', mac);

  it('refuses to persist secrets when no native store exists (C-OS-04)', async () => {
    await expect(adapter.getSecretStore().probe()).resolves.toMatchObject({ available: false });
    await expect(adapter.getSecretStore().create('k', 'v')).rejects.toMatchObject({ code: 'SECRET_STORE_UNAVAILABLE' });
  });

  it('reports unimplemented capabilities honestly', () => {
    expect(() => adapter.terminateProcessTree(1)).toThrow(NotImplementedError);
  });
});

describe('private dirs and files (AER-REQ-014, AER-REQ-202)', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aer-priv-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const posix = process.platform !== 'win32';

  it.runIf(posix)('creates 0700 dirs, tightens loose ones and rejects symlinks', () => {
    const dir = path.join(root, 'a', 'b');
    ensurePrivateDir('darwin', dir);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    chmodSync(dir, 0o755);
    ensurePrivateDir('darwin', dir);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    const link = path.join(root, 'link');
    symlinkSync(dir, link);
    expect(() => ensurePrivateDir('darwin', link)).toThrow(/not a real directory/);
  });

  it.runIf(posix)('writes private files as 0600 atomically', () => {
    const f = path.join(root, 'session.json');
    writePrivateFile(f, '{"a":1}');
    writePrivateFile(f, '{"a":2}');
    expect(statSync(f).mode & 0o777).toBe(0o600);
    expect(readFileSync(f, 'utf8')).toBe('{"a":2}');
  });
});

describe('supported targets (CHANGE-0001)', () => {
  it('accepts Apple Silicon, Windows and Linux; rejects macOS Intel', () => {
    expect(assertSupportedTarget('darwin', 'arm64')).toBe('darwin');
    expect(assertSupportedTarget('win32', 'x64')).toBe('win32');
    expect(assertSupportedTarget('linux', 'x64')).toBe('linux');
    expect(targetStatus('linux', 'arm64')).toBe('CONDITIONAL');
    expect(() => assertSupportedTarget('darwin', 'x64')).toThrow(/macOS Intel está fora do escopo/);
    expect(() => assertSupportedTarget('linux', 'ia32')).toThrow(PlatformError);
  });
});
