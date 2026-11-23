export class NotImplementedError extends Error {
  readonly code = 'NOT_IMPLEMENTED';
  constructor(readonly feature: string, readonly plannedPhase: string) {
    super(`${feature} is not implemented yet (planned: ${plannedPhase})`);
    this.name = 'NotImplementedError';
  }
}

export class PlatformError extends Error {
  constructor(readonly code: 'UNSUPPORTED_PLATFORM' | 'IPC_PATH_TOO_LONG' | 'SECRET_STORE_UNAVAILABLE', message: string) {
    super(message);
    this.name = 'PlatformError';
  }
}
