// AER-REQ-010: app, protocolo, .ases/, SQLite, adapters e extensões versionam de forma independente.
export const VERSIONS = {
  app: '1.7.0',
  protocol: 1,
  projectSchema: 1,
  dbSchema: 5, // migração 5 = conversas do chat (PHASE-18)
  adapterProtocol: 1,
  extensionSchema: 1,
} as const;
