import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

export type PlatformId = 'darwin' | 'win32' | 'linux';

export interface TerminalCapabilities {
  isTTY: boolean;
  color: boolean;
  unicode: boolean;
  columns: number | undefined;
  rows: number | undefined;
  /** ambiente de CI (mesma regra do is-in-ci usado pelo Ink, que em CI só desenha o último quadro) */
  ci: boolean;
}

export interface LocalIpcEndpoint {
  kind: 'uds' | 'named-pipe';
  address: string;
}

export interface SecretStoreProbe {
  available: boolean;
  backend: string;
  reason?: string;
}

/** §3.6: nunca cai para arquivo plaintext quando o cofre nativo não está disponível. */
export interface SecretStore {
  probe(): Promise<SecretStoreProbe>;
  create(keyId: string, value: string): Promise<void>;
  get(keyId: string): Promise<string | undefined>;
  delete(keyId: string): Promise<void>;
}

/** Contrato §3.6. Métodos ainda não implementados lançam NotImplementedError com a fase prevista. */
export interface PlatformAdapter {
  readonly id: PlatformId;
  getRuntimeDir(projectId: string): string;
  normalizeProjectPath(projectPath: string): string;
  createLocalIpcEndpoint(projectId: string): LocalIpcEndpoint;
  getSecretStore(): SecretStore;
  getTerminalCapabilities(stream: TerminalStream): TerminalCapabilities;
  ensurePrivateDir(dir: string): void;
  /** subprocesso sem shell (AER-REQ-109), em grupo próprio no POSIX para que a árvore inteira possa ser encerrada */
  spawnManagedProcess(command: string, args: readonly string[], options: SpawnOptions): ManagedProcess;
  getProcessTree(pid: number): never;
  /** encerra o processo e todos os descendentes; `terminated` só é true depois de confirmar que nada sobrou */
  terminateProcessTree(pid: number, options?: { graceMs?: number }): Promise<{ terminated: boolean; forced: boolean }>;
  getUserNotifier(): never;
  getBackgroundSupervisor(): never;
}

export interface TerminalStream {
  isTTY?: boolean | undefined;
  columns?: number | undefined;
  rows?: number | undefined;
}

/** Entradas do ambiente injetáveis para testar os três SO a partir de qualquer host. */
export interface PlatformDeps {
  env: Readonly<Record<string, string | undefined>>;
  tmpdir: string;
  homedir: string;
  username: string;
}

export interface SpawnOptions {
  cwd: string;
  env?: Readonly<Record<string, string | undefined>>;
}

export interface ManagedProcess {
  pid: number;
  child: ChildProcessByStdio<null, Readable, Readable>;
  exited: Promise<{ exitCode: number | null; signal: string | null }>;
}
