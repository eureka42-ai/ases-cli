// JSON-RPC 2.0 sobre frames NDJSON (§10.1). Uma mensagem por linha, UTF-8, tamanho limitado.
export type Role = 'control' | 'monitor';

export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  UNAUTHENTICATED: -32001,
  FORBIDDEN: -32002,
  VERSION_MISMATCH: -32003,
  PROJECT_MISMATCH: -32004,
  FRAME_TOO_LARGE: -32005,
  TIMEOUT: -32006,
  APP_ERROR: -32010,
} as const;

/** Métodos de leitura (§10.2): os únicos aceitos com o token de monitor. */
export const READ_METHODS: ReadonlySet<string> = new Set([
  'project.getInfo', 'project.snapshot', 'project.eventsSince', 'project.subscribe',
  'phase.list', 'task.list', 'task.get', 'diagnostics.getHealth',
]);

/** Métodos mutantes: só com token de controle (AER-REQ-079, C20). */
export const MUTATING_METHODS: ReadonlySet<string> = new Set(['phase.create', 'task.create', 'task.transition']);

export const DEFAULT_MAX_FRAME_BYTES = 1024 * 1024;

export class RpcError extends Error {
  readonly code: number;
  readonly data: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

export interface HandshakeParams {
  protocolVersion: number;
  projectId: string;
  role: Role;
  token: string;
}

/** Acumula bytes e devolve linhas completas; recusa linha maior que o limite antes de terminar (AER-REQ-078). */
export class FrameDecoder {
  private buf = '';
  private readonly max: number;
  constructor(maxFrameBytes = DEFAULT_MAX_FRAME_BYTES) {
    this.max = maxFrameBytes;
  }

  push(chunk: string): string[] {
    this.buf += chunk;
    const lines = this.buf.split('\n');
    this.buf = lines.pop() ?? '';
    if (Buffer.byteLength(this.buf) > this.max || lines.some((l) => Buffer.byteLength(l) > this.max)) {
      throw new RpcError(RPC.FRAME_TOO_LARGE, `frame exceeds ${this.max} bytes`);
    }
    return lines.filter((l) => l.trim() !== '');
  }
}

export const encode = (msg: unknown): string => `${JSON.stringify(msg)}\n`;
