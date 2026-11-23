import { createBaseAdapter, unavailableSecretStore, type PlatformAdapter, type PlatformDeps } from '@aer/platform-core';

// Especializações nativas (windows-credential-manager, supervisor, árvore de processos) entram nas PHASE-06/10/12/15.
export function createWindowsAdapter(deps?: PlatformDeps): PlatformAdapter {
  const base = createBaseAdapter('win32', 'windows-credential-manager', deps);
  // shortcut: o Windows não tem CLI do Credential Manager que receba o segredo sem argv (cmdkey expõe no argv);
  // cofre indisponível até um binding nativo revisado (PHASE-15). Nunca cai para arquivo plaintext.
  return { ...base, getSecretStore: () => unavailableSecretStore('windows-credential-manager', 'no argv-free Credential Manager CLI; native binding planned (PHASE-15)') };
}
