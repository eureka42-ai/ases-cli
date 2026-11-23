import { createBaseAdapter, type PlatformAdapter, type PlatformDeps } from '@aer/platform-core';

// Especializações nativas (linux-secret-service, supervisor, árvore de processos) entram nas PHASE-06/10/12/15.
export function createLinuxAdapter(deps?: PlatformDeps): PlatformAdapter {
  return createBaseAdapter('linux', 'linux-secret-service', deps);
}
