import { createBaseAdapter, type PlatformAdapter, type PlatformDeps } from '@aer/platform-core';

// Especializações nativas (macos-keychain, supervisor, árvore de processos) entram nas PHASE-06/10/12/15.
export function createMacosAdapter(deps?: PlatformDeps): PlatformAdapter {
  return createBaseAdapter('darwin', 'macos-keychain', deps);
}
