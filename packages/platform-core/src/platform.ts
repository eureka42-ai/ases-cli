import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NotImplementedError, PlatformError } from './errors.js';
import type {
  LocalIpcEndpoint, PlatformAdapter, PlatformDeps, PlatformId, SecretStore, TerminalCapabilities, TerminalStream,
} from './types.js';

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
  return { isTTY, color: isTTY && !dumb && !noColor, unicode, columns: stream.columns, rows: stream.rows };
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
    spawnManagedProcess: todo('spawnManagedProcess', 'PHASE-06'),
    getProcessTree: todo('getProcessTree', 'PHASE-06'),
    terminateProcessTree: todo('terminateProcessTree', 'PHASE-06/PHASE-15'),
    getUserNotifier: todo('getUserNotifier', 'PHASE-12'),
    getBackgroundSupervisor: todo('getBackgroundSupervisor', 'PHASE-12'),
  };
}
