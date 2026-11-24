import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createBaseAdapter, createLinuxSecretToolStore, createMacosKeychainStore, createWindowsCredentialStore, detectPlatform, type PlatformAdapter } from '../src/index.ts';

const base = createBaseAdapter(detectPlatform(), 'test');
const secret = 'sk-valor "com" aspas, espaço e ç';

/** Spawner que registra o argv de cada processo: o segredo não pode aparecer nele (visível no `ps`). */
function recording(): { p: Pick<PlatformAdapter, 'spawnManagedProcess' | 'terminateProcessTree'>; argv: string[][] } {
  const argv: string[][] = [];
  return {
    argv,
    p: {
      spawnManagedProcess: (cmd, args, o) => {
        argv.push([cmd, ...args]);
        return base.spawnManagedProcess(cmd, args, o);
      },
      terminateProcessTree: base.terminateProcessTree,
    },
  };
}

describe.runIf(process.platform === 'darwin')('macOS Keychain store (TAR-0049, real `security`, isolated keychain)', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aer-kc-'));
  const kc = path.join(dir, 'aer-test.keychain-db');
  // chaveiro temporário: não entra na lista de busca do usuário e é apagado no fim
  spawnSync('/usr/bin/security', ['create-keychain', '-p', 'aer-test', kc]);
  spawnSync('/usr/bin/security', ['unlock-keychain', '-p', 'aer-test', kc]);
  afterAll(() => {
    spawnSync('/usr/bin/security', ['delete-keychain', kc]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('create/get/overwrite/delete round-trip with non-ASCII and quotes; value never in argv', async () => {
    const { p, argv } = recording();
    const s = createMacosKeychainStore(p, { keychain: kc, service: 'eureka42.aer.test' });
    expect(await s.probe()).toEqual({ available: true, backend: 'macos-keychain' });
    expect(await s.get('k1')).toBeUndefined();
    await s.create('k1', secret);
    expect(await s.get('k1')).toBe(secret);
    await s.create('k1', 'segundo');
    expect(await s.get('k1')).toBe('segundo');
    await s.delete('k1');
    expect(await s.get('k1')).toBeUndefined();
    await s.delete('k1'); // apagar o que não existe não é erro
    for (const a of argv) {
      expect(a.join(' ')).not.toContain('com');
      expect(a.join(' ')).not.toContain('k1'); // nem o keyId vai no argv (vai pelo stdin)
    }
  });
});

describe.runIf(process.platform === 'win32')('Windows Credential Manager store (TAR-0065, real advapi32 via powershell.exe)', () => {
  const service = `eureka42.aer.test.${process.pid}`;
  afterAll(async () => {
    await createWindowsCredentialStore(base, { service }).delete('k1').catch(() => undefined);
  }, 60_000);

  it('create/get/overwrite/delete round-trip with non-ASCII and quotes; neither value nor key in argv', async () => {
    const { p, argv } = recording();
    const s = createWindowsCredentialStore(p, { service });
    expect(await s.probe()).toEqual({ available: true, backend: 'windows-credential-manager' });
    expect(await s.get('k1')).toBeUndefined();
    await s.create('k1', secret);
    expect(await s.get('k1')).toBe(secret);
    await s.create('k1', 'segundo');
    expect(await s.get('k1')).toBe('segundo');
    await s.delete('k1');
    expect(await s.get('k1')).toBeUndefined();
    await s.delete('k1');
    for (const a of argv) {
      expect(a.join(' ')).not.toContain('aspas');
      expect(a.join(' ')).not.toContain('k1');
      expect(a.join(' ')).not.toContain(service);
    }
  }, 120_000);
});

describe('SecretStore guards (TAR-0049)', () => {
  it('rejects unsafe key ids (they would reach the security -i line) and empty secrets', async () => {
    const s = createMacosKeychainStore(base, { securityPath: '/nonexistent' });
    await expect(s.create('a b', 'x')).rejects.toMatchObject({ code: 'INVALID_KEY_ID' });
    await expect(s.create('a"; rm -rf /', 'x')).rejects.toMatchObject({ code: 'INVALID_KEY_ID' });
    await expect(s.create('ok', '')).rejects.toMatchObject({ code: 'INVALID_SECRET' });
  });

  it('windows: missing powershell.exe makes the store unavailable, never plaintext', async () => {
    const s = createWindowsCredentialStore(base, { powershell: path.join(os.tmpdir(), 'nao-existe', 'powershell.exe') });
    expect(await s.probe()).toMatchObject({ available: false, backend: 'windows-credential-manager' });
    await expect(s.create('a b', 'x')).rejects.toMatchObject({ code: 'INVALID_KEY_ID' });
  });

  it('linux: without a D-Bus session the store is unavailable (never falls back to plaintext)', async () => {
    const s = createLinuxSecretToolStore(base, { env: {} });
    expect(await s.probe()).toEqual({ available: false, backend: 'linux-secret-service', reason: expect.stringContaining('D-Bus') });
  });

  it('linux: the secret goes to secret-tool through stdin, never argv', async () => {
    const { p, argv } = recording();
    // falso secret-tool: node ecoando o stdin no stderr; só o argv importa aqui
    const fake = createLinuxSecretToolStore(p, { secretTool: process.execPath, env: { DBUS_SESSION_BUS_ADDRESS: 'x' } });
    await fake.create('k2', secret).catch(() => undefined);
    expect(argv.length).toBeGreaterThan(0);
    for (const a of argv) expect(a.join(' ')).not.toContain('aspas');
  });
});
