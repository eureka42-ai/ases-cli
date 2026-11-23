export type StoreErrorCode =
  | 'DB_SCHEMA_TOO_NEW' | 'BACKUP_FAILED' | 'NOT_FOUND' | 'VERSION_CONFLICT' | 'INVALID_TRANSITION'
  | 'PHASE_HAS_OPEN_TASKS' | 'EVENT_ID_CONFLICT' | 'INVALID_INPUT' | 'NESTED_TRANSACTION'
  | 'DEPENDENCY_CYCLE' | 'DEPENDENCIES_PENDING' | 'NOT_READY' | 'LEASED' | 'CAPACITY' | 'RESOURCE_BUSY' | 'STALE_LEASE'
  | 'LOCKED' | 'EVIDENCE_REQUIRED' | 'TESTS_FAILING';

export class StoreError extends Error {
  readonly code: StoreErrorCode;
  constructor(code: StoreErrorCode, message: string) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}
