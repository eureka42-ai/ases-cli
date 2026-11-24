// AER-REQ-010: app, protocolo, .ases/, SQLite, adapters e extensões versionam de forma independente.
export const VERSIONS = {
  app: '1.0.0',
  protocol: 1,
  projectSchema: 1,
  dbSchema: 0, // 0 = ainda sem banco (PHASE-02 cria a migração 1)
  adapterProtocol: 1,
  extensionSchema: 1,
} as const;
