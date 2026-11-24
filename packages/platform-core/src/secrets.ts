import { PlatformError } from './errors.ts';
import type { PlatformAdapter, SecretStore } from './types.ts';

/** keyId só com caracteres seguros: entra na linha de comando do `security -i` (nunca o valor). */
const KEY_ID = /^[A-Za-z0-9._-]{1,128}$/;
const checkKey = (keyId: string) => {
  if (!KEY_ID.test(keyId)) throw new PlatformError('INVALID_KEY_ID', `invalid key id: ${keyId} (use A-Z a-z 0-9 . _ -)`);
};

type Spawner = Pick<PlatformAdapter, 'spawnManagedProcess' | 'terminateProcessTree'>;

/** Roda um utilitário do SO com entrada pelo stdin (o segredo nunca vai no argv, AER-REQ-166) e saída limitada. */
export async function runWithInput(p: Spawner, command: string, args: readonly string[], input: string, timeoutMs = 15_000, env?: Readonly<Record<string, string | undefined>>): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const proc = p.spawnManagedProcess(command, args, { cwd: process.cwd(), stdin: 'pipe', ...(env ? { env } : {}) });
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

// C# compilado pelo Add-Type do Windows PowerShell 5.1 (vem no SO): CredWrite/CredRead/CredDelete do advapi32 (DPAPI por
// usuário). CRED_TYPE_GENERIC = 1, CRED_PERSIST_LOCAL_MACHINE = 2, ERROR_NOT_FOUND = 1168.
const WINCRED_CS = `
using System; using System.Runtime.InteropServices; using System.Text;
public static class AerCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredWriteW(ref CREDENTIAL c, int flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredReadW(string target, int type, int flags, out IntPtr c);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredDeleteW(string target, int type, int flags);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr p);
  public static int Write(string t, string v) {
    byte[] b = Encoding.UTF8.GetBytes(v); var c = new CREDENTIAL(); c.Type = 1; c.TargetName = t; c.UserName = "aer"; c.Persist = 2;
    c.CredentialBlobSize = b.Length; c.CredentialBlob = Marshal.AllocHGlobal(b.Length); Marshal.Copy(b, 0, c.CredentialBlob, b.Length);
    try { return CredWriteW(ref c, 0) ? 0 : Marshal.GetLastWin32Error(); } finally { Marshal.FreeHGlobal(c.CredentialBlob); }
  }
  public static string Read(string t) {
    IntPtr p; if (!CredReadW(t, 1, 0, out p)) { int e = Marshal.GetLastWin32Error(); if (e == 1168) return null; throw new Exception("CredRead " + e); }
    try { var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL)); byte[] b = new byte[c.CredentialBlobSize]; Marshal.Copy(c.CredentialBlob, b, 0, b.Length); return Encoding.UTF8.GetString(b); }
    finally { CredFree(p); }
  }
  public static int Delete(string t) { if (CredDeleteW(t, 1, 0)) return 0; int e = Marshal.GetLastWin32Error(); return e == 1168 ? 0 : e; }
}`;
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const psString = (s: string) => `([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(s)}')))`;

/**
 * Windows Credential Manager pelo `powershell.exe` do sistema (caminho absoluto, sem PATH). O script inteiro, com alvo e
 * valor, vai pelo stdin em base64 numa única linha; o argv só tem flags fixas, então nada sensível aparece na lista de
 * processos (AER-REQ-166/229). A resposta volta como marcador ASCII + base64.
 */
export function createWindowsCredentialStore(p: Spawner, o: { service?: string; powershell?: string; env?: Readonly<Record<string, string | undefined>> } = {}): SecretStore {
  const service = o.service ?? 'eureka42.aer';
  const env = o.env ?? process.env;
  const bin = o.powershell ?? `${env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  const target = (keyId: string) => `${service}/${keyId}`;
  const ps = async (body: string) => {
    const script = `$ErrorActionPreference='Stop'; try { Add-Type -TypeDefinition ${psString(WINCRED_CS)}; ${body} } catch { Write-Output ('AER-ERR:hresult' + $_.Exception.HResult) }`;
    const r = await runWithInput(p, bin, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'], `iex ${psString(script)}\n`, 60_000);
    const m = /AER-(OK|NONE|ERR)(?::([A-Za-z0-9+/=-]*))?/.exec(r.stdout);
    if (!m) throw new PlatformError('SECRET_STORE_FAILED', `credential manager: no answer (exit ${r.exitCode})`);
    if (m[1] === 'ERR') throw new PlatformError('SECRET_STORE_FAILED', `credential manager call failed (${m[2] ?? '?'})`);
    return m[1] === 'NONE' ? undefined : Buffer.from(m[2] ?? '', 'base64').toString('utf8');
  };
  return {
    async probe() {
      try {
        await ps(`Write-Output 'AER-OK:'`);
        return { available: true, backend: 'windows-credential-manager' };
      } catch (err) {
        return { available: false, backend: 'windows-credential-manager', reason: (err as Error).message };
      }
    },
    async create(keyId, value) {
      checkKey(keyId);
      if (!value) throw new PlatformError('INVALID_SECRET', 'empty secret');
      await ps(`$e = [AerCred]::Write(${psString(target(keyId))}, ${psString(value)}); if ($e -ne 0) { Write-Output "AER-ERR:$e" } else { Write-Output 'AER-OK:' }`);
    },
    async get(keyId) {
      checkKey(keyId);
      return ps(`$v = [AerCred]::Read(${psString(target(keyId))}); if ($null -eq $v) { Write-Output 'AER-NONE' } else { Write-Output ('AER-OK:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($v))) }`);
    },
    async delete(keyId) {
      checkKey(keyId);
      await ps(`$e = [AerCred]::Delete(${psString(target(keyId))}); if ($e -ne 0) { Write-Output "AER-ERR:$e" } else { Write-Output 'AER-OK:' }`);
    },
  };
}
