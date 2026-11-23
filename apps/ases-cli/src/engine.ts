import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { VERSIONS, type PhaseState, type TaskState } from '@aer/contracts';
import { IpcServer, type Handler } from '@aer/ipc';
import { ProjectStore, exportHistory, type CreateTaskInput, type Risk } from '@aer/persistence';
import type { PlatformAdapter } from '@aer/platform-core';
import { ProjectError, isInterimProject, paths, readManifest, sessionFile, writeSession } from '@aer/project-store';

const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v) throw Object.assign(new Error(`${name} is required`), { code: 'INVALID_INPUT' });
  return v;
};
const int = (v: unknown, name: string): number => {
  if (!Number.isInteger(v)) throw Object.assign(new Error(`${name} must be an integer`), { code: 'INVALID_INPUT' });
  return v as number;
};

/**
 * AER Local Engine da primeira fatia vertical (§3.4): roda dentro do processo `ases`, é o único escritor do
 * projeto (o endpoint IPC funciona como lock) e publica cada evento confirmado para os monitores.
 */
export class Engine {
  readonly store: ProjectStore;
  readonly projectName: string;
  private readonly server: IpcServer;
  private readonly root: string;
  private readonly adapter: PlatformAdapter;
  private lastPublished: number;
  mirrorError: string | undefined;
  private readonly listeners = new Set<() => void>();

  private constructor(root: string, adapter: PlatformAdapter, store: ProjectStore, server: IpcServer, name: string) {
    this.root = root;
    this.adapter = adapter;
    this.store = store;
    this.server = server;
    this.projectName = name;
    this.lastPublished = store.lastSeq();
  }

  static async start(root: string, adapter: PlatformAdapter): Promise<Engine> {
    if (isInterimProject(root)) {
      throw new ProjectError('INTERIM_PROJECT', '.ases/ is still managed by scripts/ases-dev.mjs (interim bootstrap); the engine refuses to become a second writer');
    }
    const manifest = readManifest(root);
    const endpoint = adapter.createLocalIpcEndpoint(manifest.projectId);
    adapter.ensurePrivateDir(adapter.getRuntimeDir(manifest.projectId));
    adapter.ensurePrivateDir(paths(root).dbDir);
    const tokens = { control: randomBytes(32).toString('hex'), monitor: randomBytes(32).toString('hex') };
    // o servidor escuta antes de o banco abrir (o endpoint é o lock de escritor único); handlers entram depois
    const handlers: Record<string, Handler> = {};
    let engineRef: Engine | undefined;
    let store: ProjectStore | undefined;
    const server = new IpcServer({
      endpoint, projectId: manifest.projectId, tokens, handlers,
      eventsSince: (after, limit) => store?.eventsSince(after, limit) ?? [],
      engineInfo: { pid: process.pid, appVersion: VERSIONS.app },
      onConnectionsChange: () => engineRef?.emitChange(),
    });
    await server.listen(); // falha com ENGINE_ALREADY_RUNNING antes de abrir o banco como escritor
    try {
      store = ProjectStore.open(paths(root).db, { id: manifest.projectId, name: manifest.name }, { actor: 'ases' });
      const engine = new Engine(root, adapter, store, server, manifest.name);
      Object.assign(handlers, engine.handlers());
      engineRef = engine;
      writeSession(adapter, manifest.projectId, {
        pid: process.pid, protocolVersion: VERSIONS.protocol, endpoint, controlToken: tokens.control, monitorToken: tokens.monitor, startedAt: new Date().toISOString(),
      });
      engine.publish();
      return engine;
    } catch (err) {
      store?.close();
      await server.close();
      throw err;
    }
  }

  get info() {
    return { projectId: this.store.projectId, name: this.projectName, journalMode: this.store.info.journalMode, lastSeq: this.store.lastSeq(), monitors: this.server.connectionCount };
  }

  /** Toda mutação passa aqui: confirma no banco, publica os novos eventos e atualiza o espelho JSONL. */
  mutate<T>(fn: (s: ProjectStore) => T): T {
    const result = fn(this.store);
    this.publish();
    return result;
  }

  /** Assinatura de mudanças (novos eventos ou monitores) para a TUI; devolve a função de cancelamento. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emitChange(): void {
    for (const fn of this.listeners) fn();
  }

  private publish(): void {
    for (let page; (page = this.store.eventsSince(this.lastPublished, 500)).length;) {
      for (const e of page) this.server.notify(e);
      this.lastPublished = page.at(-1)!.seq;
    }
    try {
      // shortcut: reescreve o espelho inteiro a cada mutação; trocar por append incremental quando o histórico crescer
      exportHistory(this.store, paths(this.root).history);
      this.mirrorError = undefined;
    } catch (err) {
      this.mirrorError = (err as Error).message; // transação já confirmada; espelho fica pendente (§6.4)
    }
    this.emitChange();
  }

  private handlers(): Record<string, Handler> {
    const s = this.store;
    return {
      'project.getInfo': () => this.info,
      'project.snapshot': () => s.snapshot(),
      'project.eventsSince': (p) => s.eventsSince(int(p.afterSeq ?? 0, 'afterSeq'), int(p.limit ?? 500, 'limit')),
      'phase.list': () => s.listPhases(),
      'task.list': (p) => s.listTasks(typeof p.phaseId === 'string' ? p.phaseId : undefined),
      'task.get': (p) => s.getTask(str(p.taskId, 'taskId')) ?? null,
      'diagnostics.getHealth': () => ({ status: this.mirrorError ? 'DEGRADED' : 'OK', mirrorError: this.mirrorError ?? null, ...this.info }),
      'phase.create': (p) => this.mutate((st) => st.createPhase(str(p.title, 'title'))),
      'task.create': (p) => this.mutate((st) => {
        const input: CreateTaskInput = { phaseId: str(p.phaseId, 'phaseId'), title: str(p.title, 'title') };
        if (typeof p.priority === 'number') input.priority = p.priority;
        if (typeof p.risk === 'string') input.risk = p.risk as Risk;
        if (Array.isArray(p.reqs)) input.reqs = p.reqs.map(String);
        if (Array.isArray(p.dependsOn)) input.dependsOn = p.dependsOn.map(String);
        return st.createTask(input);
      }),
      'task.transition': (p) => this.mutate((st) => st.transitionTask(str(p.taskId, 'taskId'), str(p.to, 'to') as TaskState, int(p.expectedVersion, 'expectedVersion'), typeof p.reason === 'string' ? p.reason : null)),
    };
  }

  transitionPhase(phaseId: string, to: PhaseState, reason: string | null): number {
    return this.mutate((st) => {
      const phase = st.listPhases().find((p) => p.id === phaseId);
      if (!phase) throw Object.assign(new Error(`phase ${phaseId} not found`), { code: 'NOT_FOUND' });
      return st.transitionPhase(phaseId, to, phase.version, reason);
    });
  }

  async stop(): Promise<void> {
    await this.server.close();
    rmSync(sessionFile(this.adapter, this.store.projectId), { force: true });
    this.store.close();
  }
}
