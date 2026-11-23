import { PlatformError } from './errors.ts';
import type { PlatformAdapter, SecretStore } from './types.ts';

/** keyId só com caracteres seguros: entra na linha de comando do `security -i` (nunca o valor). */
const KEY_ID = /^[A-Za-z0-9._-]{1,128}$/;
const checkKey = (keyId: string) => {
  if (!KEY_ID.test(keyId)) throw new PlatformError('INVALID_KEY_ID', `invalid key id: ${keyId} (use A-Z a-z 0-9 . _ -)`);
};

type Spawner = Pick<PlatformAdapter, 'spawnManagedProcess' | 'terminateProcessTree'>;

/** Roda um utilitário do SO com entrada pelo stdin (o segredo nunca vai no argv, AER-REQ-166) e saída limitada. */
export async function runWithInput(p: Spawner, command: string, args: readonly string[], input: string, timeoutMs = 15_000): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const proc = p.spawnManagedProcess(command, args, { cwd: process.cwd(), stdin: 'pipe' });
  let stdout = '';
  let stderr = '';
  proc.child.stdout.on('data', (d: Buffer) => {
    if (stdout.length < 64 * 1024) stdout += d.toString('utf8');
  });
  proc.child.stderr.on('data', (d: Buffer) => {
    if (stderr.length < 64 * 1024) stderr += d.toString('utf8');
  });
  proc.child.stdin?.on('error', () => undefined);
  proc.child.stdin?.end(input);
  const timer = setTimeout(() => void p.terminateProcessTree(proc.pid, { graceMs: 100 }), timeoutMs);
  try {
    const r = await proc.exited;
    return { exitCode: r.exitCode, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex');

/**
 * macOS Keychain via `/usr/bin/security -i`: os comandos vão pelo stdin, então nem o keyId nem o valor aparecem no `ps`.
 * O valor é gravado já codificado em hex (só ASCII): o `-w` do security devolve hex quando o valor tem byte não ASCII
 * (verificado em 23/11/2026), então gravar hex torna a leitura inequívoca. `keychain` permite um chaveiro isolado (testes).
 */
export function createMacosKeychainStore(p: Spawner, o: { service?: string; keychain?: string; securityPath?: string } = {}): SecretStore {
  const service = o.service ?? 'eureka42.aer';
  const bin = o.securityPath ?? '/usr/bin/security';
  const kc = o.keychain ? ` "${o.keychain.replaceAll('"', '')}"` : '';
  const run = (line: string) => runWithInput(p, bin, ['-i'], `${line}\n`);
  return {
    async probe() {
      const r = await runWithInput(p, bin, ['-i'], `list-keychains\n`).catch(() => undefined);
      return r && r.exitCode === 0 ? { available: true, backend: 'macos-keychain' } : { available: false, backend: 'macos-keychain', reason: `${bin} not usable` };
    },
    async create(keyId, value) {
      checkKey(keyId);
      if (!value) throw new PlatformError('INVALID_SECRET', 'empty secret');
      const r = await run(`add-generic-password -U -a ${keyId} -s ${service} -w ${hex(value)}${kc}`);
      if (r.exitCode !== 0 || /error|fail/i.test(r.stderr)) throw new PlatformError('SECRET_STORE_FAILED', `keychain add failed (exit ${r.exitCode})`);
    },
    async get(keyId) {
      checkKey(keyId);
      const r = await runWithInput(p, bin, ['-i'], `find-generic-password -a ${keyId} -s ${service} -w${kc}\n`);
      // item ausente: "could not be found" no stderr → undefined (não é erro)
      if (/could not be found/i.test(r.stderr) || r.exitCode === 44) return undefined;
      if (r.exitCode !== 0) throw new PlatformError('SECRET_STORE_FAILED', `keychain read failed (exit ${r.exitCode})`);
      const out = r.stdout.trim();
      if (!/^(?:[0-9a-f]{2})+$/.test(out)) throw new PlatformError('SECRET_STORE_FAILED', 'keychain item was not written by the AER (unexpected format)');
      return Buffer.from(out, 'hex').toString('utf8');
    },
    async delete(keyId) {
      checkKey(keyId);
      const r = await run(`delete-generic-password -a ${keyId} -s ${service}${kc}`);
      if (r.exitCode !== 0 && !/could not be found/i.test(r.stderr)) throw new PlatformError('SECRET_STORE_FAILED', `keychain delete failed (exit ${r.exitCode})`);
    },
  };
}

/** Linux Secret Service via `secret-tool` (libsecret): o valor vai pelo stdin em `store`. Exige sessão D-Bus. */
export function createLinuxSecretToolStore(p: Spawner, o: { service?: string; secretTool?: string; env?: Readonly<Record<string, string | undefined>> } = {}): SecretStore {
  const service = o.service ?? 'eureka42.aer';
  const bin = o.secretTool ?? 'secret-tool';
  const env = o.env ?? process.env;
  return {
    async probe() {
      if (!env.DBUS_SESSION_BUS_ADDRESS) return { available: false, backend: 'linux-secret-service', reason: 'no D-Bus session (DBUS_SESSION_BUS_ADDRESS unset)' };
      const r = await runWithInput(p, bin, ['--version'], '').catch(() => undefined);
      return r && r.exitCode === 0 ? { available: true, backend: 'linux-secret-service' } : { available: false, backend: 'linux-secret-service', reason: 'secret-tool (libsecret-tools) not installed' };
    },
    async create(keyId, value) {
      checkKey(keyId);
      if (!value) throw new PlatformError('INVALID_SECRET', 'empty secret');
      const r = await runWithInput(p, bin, ['store', `--label=AER ${keyId}`, 'service', service, 'key', keyId], value);
      if (r.exitCode !== 0) throw new PlatformError('SECRET_STORE_FAILED', `secret-tool store failed (exit ${r.exitCode})`);
    },
    async get(keyId) {
      checkKey(keyId);
      const r = await runWithInput(p, bin, ['lookup', 'service', service, 'key', keyId], '');
      if (r.exitCode !== 0) return undefined; // secret-tool devolve 1 quando não acha
      return r.stdout === '' ? undefined : r.stdout;
    },
    async delete(keyId) {
      checkKey(keyId);
      await runWithInput(p, bin, ['clear', 'service', service, 'key', keyId], '');
    },
  };
}
