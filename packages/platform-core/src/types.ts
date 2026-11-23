export type PlatformId = 'darwin' | 'win32' | 'linux';

export interface TerminalCapabilities {
  isTTY: boolean;
  color: boolean;
  unicode: boolean;
  columns: number | undefined;
  rows: number | undefined;
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
  spawnManagedProcess(command: string, args: readonly string[], options: { cwd: string }): never;
  getProcessTree(pid: number): never;
  terminateProcessTree(pid: number): never;
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
