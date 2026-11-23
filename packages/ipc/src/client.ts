import net from 'node:net';
import { VERSIONS } from '@aer/contracts';
import type { LocalIpcEndpoint } from '@aer/platform-core';
import { DEFAULT_MAX_FRAME_BYTES, FrameDecoder, RPC, RpcError, encode, type Role } from './protocol.ts';

export interface ConnectOptions {
  endpoint: LocalIpcEndpoint;
  projectId: string;
  role: Role;
  token: string;
  timeoutMs?: number;
  protocolVersion?: number;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
type Notification = { method: string; params: Record<string, unknown> };

/** Cliente JSON-RPC com timeout por chamada e erro tipado (AER-REQ-080). */
export class IpcClient {
  private readonly socket: net.Socket;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(n: Notification) => void>();
  private readonly closeListeners = new Set<() => void>();
  private nextId = 1;
  private closed = false;
  private readonly timeoutMs: number;
  handshake: Record<string, unknown> = {};

  private constructor(socket: net.Socket, timeoutMs: number) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    const decoder = new FrameDecoder(DEFAULT_MAX_FRAME_BYTES);
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      let lines: string[];
      try {
        lines = decoder.push(chunk);
      } catch {
        socket.destroy();
        return;
      }
      for (const line of lines) this.onLine(line);
    });
    socket.on('close', () => {
      this.closed = true;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new RpcError(RPC.INTERNAL, 'connection closed'));
      }
      this.pending.clear();
      for (const fn of this.closeListeners) fn();
    });
    socket.on('error', () => socket.destroy());
  }

  static connect(o: ConnectOptions): Promise<IpcClient> {
    const timeoutMs = o.timeoutMs ?? 5000;
    return new Promise((resolve, reject) => {
      const socket = net.connect(o.endpoint.address);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new RpcError(RPC.TIMEOUT, 'connect timeout'));
      }, timeoutMs);
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.once('connect', () => {
        clearTimeout(timer);
        const client = new IpcClient(socket, timeoutMs);
        client
          .call('rpc.handshake', { protocolVersion: o.protocolVersion ?? VERSIONS.protocol, projectId: o.projectId, role: o.role, token: o.token })
          .then((h) => {
            client.handshake = h as Record<string, unknown>;
            resolve(client);
          })
          .catch((err: Error) => {
            client.close();
            reject(err);
          });
      });
    });
  }

  get isClosed(): boolean {
    return this.closed;
  }

  call<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = this.timeoutMs): Promise<T> {
    if (this.closed) return Promise.reject(new RpcError(RPC.INTERNAL, 'connection closed'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError(RPC.TIMEOUT, `${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.socket.write(encode({ jsonrpc: '2.0', id, method, params }));
    });
  }

  onNotification(fn: (n: Notification) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onClose(fn: () => void): void {
    this.closeListeners.add(fn);
  }

  close(): void {
    this.socket.destroy();
  }

  private onLine(line: string): void {
    let msg: { id?: unknown; result?: unknown; error?: { code: number; message: string; data?: unknown }; method?: string; params?: Record<string, unknown> };
    try {
      msg = JSON.parse(line) as typeof msg;
    } catch {
      return;
    }
    if (typeof msg.method === 'string' && msg.id === undefined) {
      for (const fn of this.listeners) fn({ method: msg.method, params: msg.params ?? {} });
      return;
    }
    const p = typeof msg.id === 'number' ? this.pending.get(msg.id) : undefined;
    if (!p) {
      if (msg.error) this.socket.destroy(); // erro sem id (p.ex. frame grande): servidor vai fechar
      return;
    }
    this.pending.delete(msg.id as number);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new RpcError(msg.error.code, msg.error.message, msg.error.data));
    else p.resolve(msg.result);
  }
}
