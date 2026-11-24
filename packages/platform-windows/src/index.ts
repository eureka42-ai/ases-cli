import { createBaseAdapter, createWindowsCredentialStore, type PlatformAdapter, type PlatformDeps } from '@aer/platform-core';

/** Windows: Credential Manager (DPAPI por usuário) pelo PowerShell do sistema, com o segredo só no stdin (PHASE-15). */
export function createWindowsAdapter(deps?: PlatformDeps): PlatformAdapter {
  const base = createBaseAdapter('win32', 'windows-credential-manager', deps);
  return { ...base, getSecretStore: () => createWindowsCredentialStore(base) };
}
