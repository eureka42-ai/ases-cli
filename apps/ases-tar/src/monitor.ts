import type { EventEnvelope } from '@aer/contracts';
import { IpcClient } from '@aer/ipc';
import type { Snapshot } from '@aer/persistence';
import type { PlatformAdapter } from '@aer/platform-core';
import { readSession } from '@aer/project-store';

export type LinkStatus = 'LIVE' | 'RECONNECTING' | 'OFFLINE';

export interface MonitorHandlers {
  onStatus(status: LinkStatus, detail: string): void;
  onSnapshot?(snap: Snapshot, recent: EventEnvelope[]): void;
  onEvent(e: EventEnvelope): void;
}

/**
 * Conexão somente leitura com o engine (token de monitor). Reconecta com backoff, relendo a sessão
 * (tokens novos após reinício), e retoma a partir do último seq confirmado: sem lacuna e sem duplicata.
 */
export class Monitor {
  lastSeq: number;
  private readonly adapter: PlatformAdapter;
  private readonly projectId: string;
  private readonly h: MonitorHandlers;
  private client: IpcClient | undefined;
  private stopped = false;
  private wake: (() => void) | undefined;

  constructor(adapter: PlatformAdapter, projectId: string, opts: { fromSeq?: number | undefined; snapshot: boolean }, h: MonitorHandlers) {
    this.adapter = adapter;
    this.projectId = projectId;
    this.h = h;
    this.lastSeq = opts.fromSeq ?? (opts.snapshot ? -1 : 0);
  }

  static async connect(adapter: PlatformAdapter, projectId: string): Promise<IpcClient> {
    const s = readSession(adapter, projectId);
    return IpcClient.connect({ endpoint: s.endpoint, projectId, role: 'monitor', token: s.monitorToken });
  }

  /** Chamada de leitura avulsa (p.ex. task.get no detalhe); falha se desconectado. */
  call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.client || this.client.isClosed) return Promise.reject(new Error('not connected'));
    return this.client.call<T>(method, params);
  }

  /** Tecla r: relê a partir do engine. Nunca reinicia nenhuma execução (§10.3). */
  reconnect(): void {
    this.client?.close();
    this.wake?.();
  }

  stop(): void {
    this.stopped = true;
    this.client?.close();
    this.wake?.();
  }

  async run(): Promise<void> {
    let delay = 250;
    while (!this.stopped) {
      try {
        await this.session();
        delay = 250;
        if (!this.stopped) this.h.onStatus('RECONNECTING', '');
      } catch (err) {
        const e = err as Error & { code?: unknown };
        const offline = e.code === 'ENGINE_NOT_RUNNING' || e.code === 'ENOENT' || e.code === 'ECONNREFUSED';
        this.h.onStatus(offline ? 'OFFLINE' : 'RECONNECTING', String(e.code ?? e.message));
      }
      if (this.stopped) break;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, delay);
        this.wake = () => {
          clearTimeout(t);
          resolve();
        };
      });
      delay = Math.min(delay * 2, 2000);
    }
  }

  private async session(): Promise<void> {
    const client = await Monitor.connect(this.adapter, this.projectId);
    this.client = client;
    const closed = new Promise<void>((resolve) => client.onClose(resolve));
    if (this.lastSeq < 0) {
      const snap = await client.call<Snapshot>('project.snapshot');
      const recent = await client.call<EventEnvelope[]>('project.eventsSince', { afterSeq: Math.max(0, snap.snapshotSeq - 200), limit: 200 });
      this.lastSeq = snap.snapshotSeq;
      this.h.onSnapshot?.(snap, recent);
    }
    const subscribe = () => client.call('project.subscribe', { fromSeq: this.lastSeq });
    client.onNotification((n) => {
      if (n.method === 'project.resyncRequired') {
        void subscribe().catch(() => client.close());
        return;
      }
      if (n.method !== 'project.event') return;
      const e = n.params.event as EventEnvelope;
      if (e.seq <= this.lastSeq) return; // dedupe por seq
      if (e.seq !== this.lastSeq + 1) {
        client.close(); // lacuna: reconecta e relê a partir do último seq confirmado
        return;
      }
      this.lastSeq = e.seq;
      this.h.onEvent(e);
    });
    await subscribe();
    this.h.onStatus('LIVE', `desde seq ${this.lastSeq}`);
    await closed;
  }
}
