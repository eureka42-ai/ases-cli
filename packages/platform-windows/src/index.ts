import { createBaseAdapter, type PlatformAdapter, type PlatformDeps } from '@aer/platform-core';

// Especializações nativas (windows-credential-manager, supervisor, árvore de processos) entram nas PHASE-06/10/12/15.
export function createWindowsAdapter(deps?: PlatformDeps): PlatformAdapter {
  return createBaseAdapter('win32', 'windows-credential-manager', deps);
}
