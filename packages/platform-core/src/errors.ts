export class NotImplementedError extends Error {
  readonly code = 'NOT_IMPLEMENTED';
  readonly feature: string;
  readonly plannedPhase: string;
  constructor(feature: string, plannedPhase: string) {
    super(`${feature} is not implemented yet (planned: ${plannedPhase})`);
    this.name = 'NotImplementedError';
    this.feature = feature;
    this.plannedPhase = plannedPhase;
  }
}

export type PlatformErrorCode = 'UNSUPPORTED_PLATFORM' | 'IPC_PATH_TOO_LONG' | 'SECRET_STORE_UNAVAILABLE' | 'INSECURE_PATH' | 'SPAWN_FAILED' | 'INVALID_PID'
  | 'INVALID_KEY_ID' | 'INVALID_SECRET' | 'SECRET_STORE_FAILED';

export class PlatformError extends Error {
  readonly code: PlatformErrorCode;
  constructor(code: PlatformErrorCode, message: string) {
    super(message);
    this.name = 'PlatformError';
    this.code = code;
  }
}
