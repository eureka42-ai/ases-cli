import { timingSafeEqual } from 'node:crypto';
import { chmodSync, unlinkSync } from 'node:fs';
import net from 'node:net';
import { VERSIONS, type EventEnvelope } from '@aer/contracts';
import type { LocalIpcEndpoint } from '@aer/platform-core';
import {
  DEFAULT_MAX_FRAME_BYTES, FrameDecoder, MUTATING_METHODS, READ_METHODS, RPC, RpcError, encode,
  type HandshakeParams, type Role,
} from './protocol.ts';

export type Handler = (params: Record<string, unknown>, ctx: { role: Role }) => unknown;

export interface ServerOptions {
  endpoint: LocalIpcEndpoint;
  projectId: string;
  tokens: { control: string; monitor: string };
  handlers: Record<string, Handler>;
  eventsSince: (afterSeq: number, limit: number) => EventEnvelope[];
  engineInfo?: Record<string, unknown>;
  maxFrameBytes?: number;
  handshakeTimeoutMs?: number;
  maxConnections?: number;
  /** Acima disso o assinante lento perde a assinatura e recebe resyncRequired (AER-REQ-077). */
  maxBufferedBytes?: number;
}

interface Conn {
  socket: net.Socket;
  role: Role | undefined;
  subLastSeq: number | undefined;
}

export class IpcError extends Error {
  readonly code: 'ENGINE_ALREADY_RUNNING';
  constructor(code: 'ENGINE_ALREADY_RUNNING', message: string) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
  }
}

const sameToken = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function probe(address: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(address);
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
  });
}

export class IpcServer {
  private readonly o: Required<Omit<ServerOptions, 'engineInfo'>> & { engineInfo: Record<string, unknown> };
  private readonly server: net.Server;
  private readonly conns = new Set<Conn>();

  constructor(options: ServerOptions) {
    this.o = {
      maxFrameBytes: DEFAULT_MAX_FRAME_BYTES, handshakeTimeoutMs: 5000, maxConnections: 32, maxBufferedBytes: 4 * 1024 * 1024,
      engineInfo: {}, ...options,
    };
    this.server = net.createServer((socket) => this.accept(socket));
    this.server.maxConnections = this.o.maxConnections;
  }

  get connectionCount(): number {
    return this.conns.size;
  }

  /** Escuta só no UDS/pipe (nunca TCP). Socket órfão de um engine morto é removido; engine vivo → ENGINE_ALREADY_RUNNING. */
  async listen(): Promise<void> {
    const { address, kind } = this.o.endpoint;
    const attempt = () => new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(address, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    try {
      await attempt();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
      if (kind === 'named-pipe' || (await probe(address))) {
        throw new IpcError('ENGINE_ALREADY_RUNNING', `another AER engine is already serving this project (${address})`);
      }
      unlinkSync(address);
      await attempt();
    }
    if (kind === 'uds') chmodSync(address, 0o600);
  }

  /** Publica um evento já confirmado no banco para os assinantes (chamado pelo engine após o COMMIT). */
  notify(event: EventEnvelope): void {
    for (const c of this.conns) {
      if (c.subLastSeq === undefined || event.seq <= c.subLastSeq) continue;
      this.sendEvent(c, event);
    }
  }

  close(): Promise<void> {
    for (const c of this.conns) c.socket.destroy();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  private sendEvent(c: Conn, event: EventEnvelope): void {
    if (c.socket.writableLength > this.o.maxBufferedBytes) {
      // não bloqueia o engine: derruba a assinatura e pede ao cliente que releia a partir do último seq que recebeu
      c.subLastSeq = undefined;
      c.socket.write(encode({ jsonrpc: '2.0', method: 'project.resyncRequired', params: {} }));
      return;
    }
    c.socket.write(encode({ jsonrpc: '2.0', method: 'project.event', params: { event } }));
    c.subLastSeq = event.seq;
  }

  private accept(socket: net.Socket): void {
    const c: Conn = { socket, role: undefined, subLastSeq: undefined };
    this.conns.add(c);
    const decoder = new FrameDecoder(this.o.maxFrameBytes);
    const timer = setTimeout(() => c.role === undefined && socket.destroy(), this.o.handshakeTimeoutMs);
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      let lines: string[];
      try {
        lines = decoder.push(chunk);
      } catch (err) {
        socket.end(encode({ jsonrpc: '2.0', id: null, error: { code: (err as RpcError).code, message: (err as Error).message } }));
        return;
      }
      for (const line of lines) this.handleLine(c, line);
    });
    socket.on('close', () => {
      clearTimeout(timer);
      this.conns.delete(c);
    });
    socket.on('error', () => socket.destroy());
  }

  private handleLine(c: Conn, line: string): void {
    let msg: { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
    try {
      msg = JSON.parse(line) as typeof msg;
    } catch {
      c.socket.write(encode({ jsonrpc: '2.0', id: null, error: { code: RPC.PARSE_ERROR, message: 'invalid JSON' } }));
      return;
    }
    const id = typeof msg.id === 'number' || typeof msg.id === 'string' ? msg.id : null;
    const reply = (result: unknown) => c.socket.write(encode({ jsonrpc: "2.0", id, result: result ?? null }));
    const fail = (e: RpcError) => c.socket.write(encode({ jsonrpc: '2.0', id, error: { code: e.code, message: e.message, data: e.data } }));
    try {
      if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string' || id === null) throw new RpcError(RPC.INVALID_REQUEST, 'invalid JSON-RPC 2.0 request');
      const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Record<string, unknown>;
      if (msg.method === 'rpc.handshake') {
        reply(this.handshake(c, params as unknown as HandshakeParams));
        return;
      }
      if (!c.role) throw new RpcError(RPC.UNAUTHENTICATED, 'handshake required');
      if (MUTATING_METHODS.has(msg.method) && c.role !== 'control') throw new RpcError(RPC.FORBIDDEN, `${msg.method} is not allowed for role ${c.role}`);
      if (msg.method === 'project.subscribe') {
        this.subscribe(c, Number(params.fromSeq ?? 0), reply);
        return;
      }
      const handler = this.o.handlers[msg.method];
      if (!handler || (!READ_METHODS.has(msg.method) && !MUTATING_METHODS.has(msg.method))) throw new RpcError(RPC.METHOD_NOT_FOUND, `unknown method ${msg.method}`);
      reply(handler(params, { role: c.role }));
    } catch (err) {
      if (err instanceof RpcError) fail(err);
      else {
        const e = err as Error & { code?: unknown };
        fail(new RpcError(RPC.APP_ERROR, e.message, { code: typeof e.code === 'string' ? e.code : 'INTERNAL' }));
      }
    }
  }

  private handshake(c: Conn, p: HandshakeParams): unknown {
    if (c.role) throw new RpcError(RPC.INVALID_REQUEST, 'handshake already done');
    if (p.protocolVersion !== VERSIONS.protocol) {
      throw new RpcError(RPC.VERSION_MISMATCH, `protocol ${String(p.protocolVersion)} not supported; engine speaks ${VERSIONS.protocol}`, { engine: VERSIONS.protocol });
    }
    if (p.projectId !== this.o.projectId) throw new RpcError(RPC.PROJECT_MISMATCH, 'project mismatch');
    const expected = p.role === 'control' ? this.o.tokens.control : p.role === 'monitor' ? this.o.tokens.monitor : undefined;
    if (!expected || typeof p.token !== 'string' || !sameToken(p.token, expected)) throw new RpcError(RPC.UNAUTHENTICATED, 'invalid role or token');
    c.role = p.role;
    return { protocolVersion: VERSIONS.protocol, projectId: this.o.projectId, role: c.role, engine: this.o.engineInfo };
  }

  /** Backlog e passagem para "ao vivo" no mesmo tique síncrono: nenhum evento escapa entre os dois (§10.3). */
  private subscribe(c: Conn, fromSeq: number, reply: (r: unknown) => void): void {
    if (!Number.isInteger(fromSeq) || fromSeq < 0) throw new RpcError(RPC.INVALID_PARAMS, 'fromSeq must be an integer >= 0');
    c.subLastSeq = fromSeq;
    let backlog = 0;
    for (let page; (page = this.o.eventsSince(c.subLastSeq, 500)).length && c.subLastSeq !== undefined;) {
      for (const e of page) this.sendEvent(c, e);
      backlog += page.length;
    }
    reply({ subscribed: c.subLastSeq !== undefined, fromSeq, backlog });
  }
}
