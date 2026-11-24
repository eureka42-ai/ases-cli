import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NotImplementedError, PlatformError } from './errors.ts';
import type {
  LocalIpcEndpoint, ManagedProcess, PlatformAdapter, SpawnOptions, PlatformDeps, PlatformId, SecretStore, TerminalCapabilities, TerminalStream,
} from './types.ts';

// sun_path: 104 bytes no macOS, 108 no Linux (incluindo NUL). Usamos o menor para os dois.
const MAX_UDS_PATH_BYTES = 103;

export function detectPlatform(platform: string = process.platform): PlatformId {
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') return platform;
  throw new PlatformError('UNSUPPORTED_PLATFORM', `platform "${platform}" is not a supported target (darwin, win32, linux)`);
}

export const shortHash = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 16);

const pathFor = (id: PlatformId) => (id === 'win32' ? path.win32 : path.posix);

export function getRuntimeDir(id: PlatformId, deps: PlatformDeps, projectId: string): string {
  const p = pathFor(id);
  const project = shortHash(projectId);
  if (id === 'win32') return p.join(deps.env.LOCALAPPDATA ?? p.join(deps.homedir, 'AppData', 'Local'), 'ases', 'runtime', project);
  if (id === 'linux' && deps.env.XDG_RUNTIME_DIR) return p.join(deps.env.XDG_RUNTIME_DIR, `ases-${project}`);
  // macOS: TMPDIR já é por usuário; Linux sem XDG cai em /tmp compartilhado, então o nome inclui o usuário
  // e o dono/permissão 0700 precisam ser verificados ao criar (PHASE-03, AER-REQ-014/170).
  return p.join(deps.tmpdir, id === 'darwin' ? `ases-${project}` : `ases-${shortHash(deps.username)}-${project}`);
}

export function createLocalIpcEndpoint(id: PlatformId, deps: PlatformDeps, projectId: string): LocalIpcEndpoint {
  if (id === 'win32') return { kind: 'named-pipe', address: `\\\\.\\pipe\\ases-${shortHash(deps.username)}-${shortHash(projectId)}` };
  const address = path.posix.join(getRuntimeDir(id, deps, projectId), 'engine.sock');
  if (Buffer.byteLength(address) > MAX_UDS_PATH_BYTES) {
    throw new PlatformError('IPC_PATH_TOO_LONG', `socket path exceeds ${MAX_UDS_PATH_BYTES} bytes: ${address}`);
  }
  return { kind: 'uds', address };
}

/** §3.6 Terminal + BRANDING: NO_COLOR, TERM=dumb e saída sem TTY desligam cor. */
export function getTerminalCapabilities(id: PlatformId, env: PlatformDeps['env'], stream: TerminalStream): TerminalCapabilities {
  const isTTY = stream.isTTY === true;
  const dumb = env.TERM === 'dumb';
  const noColor = env.NO_COLOR !== undefined && env.NO_COLOR !== '';
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || '';
  // shortcut: heurística de Unicode por env; trocar por probe real de terminal na PHASE-04/16.
  const unicode = !dumb && (id === 'win32' ? Boolean(env.WT_SESSION) || env.TERM_PROGRAM === 'vscode' : /utf-?8/i.test(locale));
  const ci = env.CI !== '0' && env.CI !== 'false' && ('CI' in env || 'CONTINUOUS_INTEGRATION' in env || Object.keys(env).some((k) => k.startsWith('CI_')));
  return { isTTY, color: isTTY && !dumb && !noColor, unicode, columns: stream.columns, rows: stream.rows, ci };
}

export function normalizeProjectPath(projectPath: string): string {
  return realpathSync.native(path.resolve(projectPath));
}

/** Cofre indisponível: recusa persistir em vez de cair para plaintext (AER-REQ-229, C-OS-04). */
export function unavailableSecretStore(backend: string, reason: string): SecretStore {
  const refuse = async (): Promise<never> => {
    throw new PlatformError('SECRET_STORE_UNAVAILABLE', `${backend} unavailable: ${reason}`);
  };
  return { probe: async () => ({ available: false, backend, reason }), create: refuse, get: refuse, delete: refuse };
}

export function defaultDeps(): PlatformDeps {
  let username = process.env.USER ?? process.env.USERNAME ?? 'unknown';
  try {
    username = os.userInfo().username;
  } catch {
    // userInfo pode falhar em contêineres sem entrada no passwd; mantém o fallback por env
  }
  return { env: process.env, tmpdir: os.tmpdir(), homedir: os.homedir(), username };
}

export function createBaseAdapter(id: PlatformId, secretBackend: string, deps: PlatformDeps = defaultDeps()): PlatformAdapter {
  const todo = (feature: string, phase: string) => (): never => {
    throw new NotImplementedError(feature, phase);
  };
  return {
    id,
    getRuntimeDir: (projectId) => getRuntimeDir(id, deps, projectId),
    normalizeProjectPath,
    createLocalIpcEndpoint: (projectId) => createLocalIpcEndpoint(id, deps, projectId),
    getSecretStore: () => unavailableSecretStore(secretBackend, 'native SecretStore planned for PHASE-10/PHASE-15'),
    getTerminalCapabilities: (stream) => getTerminalCapabilities(id, deps.env, stream),
    ensurePrivateDir: (dir) => ensurePrivateDir(id, dir),
    spawnManagedProcess: (command, args, options) => spawnManagedProcess(id, command, args, options),
    getProcessTree: todo('getProcessTree', 'PHASE-12'),
    terminateProcessTree: (pid, options) => terminateProcessTree(id, pid, options),
    getUserNotifier: todo('getUserNotifier', 'PHASE-12'),
    getBackgroundSupervisor: todo('getBackgroundSupervisor', 'PHASE-12'),
  };
}

/**
 * Cria (se preciso) um diretório só do usuário atual (AER-REQ-014/202).
 * POSIX: 0700, dono = uid atual, nunca symlink. Windows: nunca junction/symlink, e a DACL só pode dar acesso ao usuário,
 * ao SYSTEM e aos Administradores (verificado por SID, independente do idioma); senão é restringida com icacls.
 */
export function ensurePrivateDir(id: PlatformId, dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = lstatSync(dir);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new PlatformError('INSECURE_PATH', `not a real directory: ${dir}`);
  if (id === 'win32') return ensureWindowsPrivateDir(dir);
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) throw new PlatformError('INSECURE_PATH', `directory not owned by current user: ${dir}`);
  if ((st.mode & 0o077) !== 0) chmodSync(dir, 0o700);
}

const WIN_TRUSTED = new Set(['S-1-5-18', 'S-1-5-32-544']); // SYSTEM, Administradores
const winChecked = new Set<string>();

/** SIDs com acesso (Allow) ao diretório e o SID do usuário atual, lidos pelo PowerShell do sistema. */
export function windowsDirAcl(dir: string): { me: string; allowed: string[] } {
  const ps = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  const p64 = Buffer.from(dir, 'utf8').toString('base64');
  const script = `$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${p64}')); 'ME ' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value; foreach ($r in (Get-Acl -LiteralPath $p).Access) { if ($r.AccessControlType -eq 'Allow') { try { 'ACE ' + $r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { 'ACE ' + $r.IdentityReference.Value } } }`;
  const r = spawnSync(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'], { input: `${script}\n`, encoding: 'utf8', timeout: 30_000, windowsHide: true });
  const me = /^ME (S-[\d-]+)\s*$/m.exec(r.stdout ?? '')?.[1];
  if (r.status !== 0 || !me) throw new PlatformError('INSECURE_PATH', `cannot read the ACL of ${dir} (exit ${r.status})`);
  return { me, allowed: [...(r.stdout ?? '').matchAll(/^ACE (\S+)\s*$/gm)].map((m) => m[1]!) };
}

function ensureWindowsPrivateDir(dir: string): void {
  if (winChecked.has(dir)) return;
  const foreign = () => {
    const a = windowsDirAcl(dir);
    return { me: a.me, others: [...new Set(a.allowed.filter((s) => s !== a.me && !WIN_TRUSTED.has(s)))] };
  };
  let f = foreign();
  if (f.others.length) {
    const icacls = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\icacls.exe`;
    const grants = [f.me, ...WIN_TRUSTED].flatMap((sid) => ['/grant:r', `*${sid}:(OI)(CI)F`]);
    spawnSync(icacls, [dir, '/inheritance:r', ...grants, '/q'], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
    for (const sid of f.others) spawnSync(icacls, [dir, '/remove:g', `*${sid}`, '/q'], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
    f = foreign();
    if (f.others.length) throw new PlatformError('INSECURE_PATH', `directory still grants access to ${f.others.join(', ')}: ${dir}`);
  }
  winChecked.add(dir);
}

/** Escrita atômica de arquivo privado (0600 em POSIX), p.ex. o token de sessão do engine. */
export function writePrivateFile(file: string, content: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, content, { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, file);
}

/** CHANGE-0001: macOS só em Apple Silicon. arm64 de Windows/Linux é condicional a testes reais (§3.7). */
export const SUPPORTED_TARGETS = {
  'darwin-arm64': 'TARGET',
  'win32-x64': 'TARGET',
  'linux-x64': 'TARGET',
  'win32-arm64': 'CONDITIONAL',
  'linux-arm64': 'CONDITIONAL',
} as const;
export type TargetStatus = (typeof SUPPORTED_TARGETS)[keyof typeof SUPPORTED_TARGETS] | 'UNSUPPORTED';

export function targetStatus(platform: string, arch: string): TargetStatus {
  return (SUPPORTED_TARGETS as Record<string, TargetStatus>)[`${platform}-${arch}`] ?? 'UNSUPPORTED';
}

export function assertSupportedTarget(platform: string = process.platform, arch: string = process.arch): PlatformId {
  const id = detectPlatform(platform);
  if (targetStatus(platform, arch) === 'UNSUPPORTED') {
    const hint = platform === 'darwin' ? ' macOS Intel está fora do escopo (CHANGE-0001); em Apple Silicon use um Node arm64 nativo (não sob Rosetta).' : '';
    throw new PlatformError('UNSUPPORTED_PLATFORM', `target ${platform}-${arch} is not supported.${hint}`);
  }
  return id;
}

/**
 * Pasta sincronizada (iCloud Drive, OneDrive, Dropbox, Google Drive): o cliente de sync pode copiar o SQLite e o WAL
 * no meio de uma escrita (cópias "arquivo 2", banco corrompido). Visto de verdade em 22/11/2026 com ~/Desktop no iCloud.
 */
export function syncedFolderHint(id: PlatformId, deps: PlatformDeps, dir: string): string | undefined {
  const p = pathFor(id);
  const parts = p.resolve(dir).split(/[\\/]+/);
  if (parts.some((s, i) => s === 'Mobile Documents' && parts[i - 1] === 'Library')) return 'iCloud Drive';
  if (id === 'darwin') {
    for (const folder of ['Desktop', 'Documents']) {
      const inside = p.resolve(dir).startsWith(p.join(deps.homedir, folder) + p.sep) || p.resolve(dir) === p.join(deps.homedir, folder);
      if (inside && existsSync(p.join(deps.homedir, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', folder))) return `iCloud Drive (${folder} sincronizado)`;
    }
  }
  if (parts.some((s) => /^OneDrive( - .+)?$/.test(s))) return 'OneDrive';
  if (parts.some((s) => s === 'Dropbox')) return 'Dropbox';
  if (parts.some((s) => s === 'Google Drive' || s === 'My Drive' || s.startsWith('GoogleDrive-'))) return 'Google Drive';
  return undefined;
}

/**
 * Subprocesso com argumentos em vetor e shell:false (AER-REQ-109). POSIX: `detached` cria um grupo de processos com
 * pgid = pid, o que permite encerrar netos que o agente tenha criado. Windows: sem detached (abriria console novo);
 * a árvore é encerrada por `taskkill /T`.
 */
export function spawnManagedProcess(id: PlatformId, command: string, args: readonly string[], options: SpawnOptions): ManagedProcess {
  const child = spawn(command, [...args], {
    cwd: options.cwd, env: { ...(options.env ?? process.env) }, shell: false, detached: id !== 'win32', windowsHide: true, stdio: [options.stdin ?? 'ignore', 'pipe', 'pipe'],
  }) as ManagedProcess['child'];
  const exited = new Promise<{ exitCode: number | null; signal: string | null }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  if (child.pid === undefined) {
    exited.catch(() => undefined);
    throw new PlatformError('SPAWN_FAILED', `could not start ${command}`);
  }
  return { pid: child.pid, child, exited };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** true enquanto existir algum processo no grupo (POSIX) ou o próprio pid (Windows). EPERM = existe, de outro dono. */
function treeAlive(id: PlatformId, pid: number): boolean {
  try {
    process.kill(id === 'win32' ? pid : -pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function waitGone(id: PlatformId, pid: number, ms: number): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(25)) if (!treeAlive(id, pid)) return true;
  return !treeAlive(id, pid);
}

/**
 * SIGTERM no grupo, espera `graceMs`, depois SIGKILL; confirma que o grupo sumiu (AER-REQ-106).
 * shortcut: no Windows só o pid raiz é confirmado após `taskkill /T /F`; verificar descendentes com a API de Job Objects na PHASE-15.
 */
export async function terminateProcessTree(id: PlatformId, pid: number, options: { graceMs?: number } = {}): Promise<{ terminated: boolean; forced: boolean }> {
  if (!Number.isInteger(pid) || pid <= 1) throw new PlatformError('INVALID_PID', `refusing to terminate pid ${pid}`);
  if (!treeAlive(id, pid)) return { terminated: true, forced: false };
  if (id === 'win32') {
    await new Promise<void>((resolve) => {
      const k = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
      k.once('error', () => resolve());
      k.once('close', () => resolve());
    });
    return { terminated: await waitGone(id, pid, 5000), forced: true };
  }
  const signal = (s: NodeJS.Signals) => {
    try {
      process.kill(-pid, s);
    } catch {
      // grupo já terminou entre a verificação e o sinal
    }
  };
  signal('SIGTERM');
  if (await waitGone(id, pid, options.graceMs ?? 2000)) return { terminated: true, forced: false };
  signal('SIGKILL');
  return { terminated: await waitGone(id, pid, 5000), forced: true };
}
