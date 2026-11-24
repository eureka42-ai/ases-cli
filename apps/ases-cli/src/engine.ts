import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { VERSIONS, type PhaseState, type TaskState } from '@aer/contracts';
import { IpcServer, type Handler } from '@aer/ipc';
import { ProjectStore, exportHistory, type CreateTaskInput, type Risk } from '@aer/persistence';
import type { PlatformAdapter } from '@aer/platform-core';
import type { AgentProvider } from '@aer/provider-sdk';
import { ClaudeCodeProvider } from '@aer/provider-claude';
import { CodexProvider } from '@aer/provider-codex';
import { createAntigravityProvider, createKimiProvider, createOpenCodeProvider } from '@aer/provider-acp';
import { SimulatorProvider } from '@aer/provider-simulator';
import { runQueue, type AttemptOutcome, type WorkerDeps } from '@aer/scheduler';
import { ProjectError, historyState, isInterimProject, paths, readManifest, sessionFile, writeSession } from '@aer/project-store';
import { writeReports } from './reports.ts';

const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v) throw Object.assign(new Error(`${name} is required`), { code: 'INVALID_INPUT' });
  return v;
};
const int = (v: unknown, name: string): number => {
  if (!Number.isInteger(v)) throw Object.assign(new Error(`${name} must be an integer`), { code: 'INVALID_INPUT' });
  return v as number;
};

/** `AER_SIMULATORS=N` (1..4, só para testes): registra `simulator-2..N` além do `simulator`. Fora do intervalo = 1. */
export function simulatorCount(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const n = Number(env.AER_SIMULATORS ?? 1);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 1;
}

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
  readonly providers: Record<string, AgentProvider>;
  /** tarefas em execução neste processo → cancelamento individual (/cancel) */
  private readonly controllers = new Map<string, AbortController>();
  private runAbort: AbortController | undefined;
  private current: Promise<unknown> | undefined;

  private constructor(root: string, adapter: PlatformAdapter, store: ProjectStore, server: IpcServer, name: string, simulators = 1) {
    this.root = root;
    this.adapter = adapter;
    this.store = store;
    this.server = server;
    this.projectName = name;
    this.lastPublished = store.lastSeq();
    this.providers = {
      simulator: new SimulatorProvider(adapter), claude: new ClaudeCodeProvider(adapter), codex: new CodexProvider(adapter),
      kimi: createKimiProvider(adapter), opencode: createOpenCodeProvider(adapter), google: createAntigravityProvider(adapter),
    };
    // simuladores extras (só testes): exercitam a distribuição entre IAs sem conta nenhuma
    for (let i = 2; i <= simulators; i++) this.providers[`simulator-${i}`] = new SimulatorProvider(adapter, { id: `simulator-${i}` });
  }

  static async start(root: string, adapter: PlatformAdapter, o: { simulators?: number } = {}): Promise<Engine> {
    if (historyState(root) === 'DB_MISSING') {
      throw new ProjectError('DB_MISSING', '.ases/HISTORY.jsonl has engine history but .ases/db/ases.sqlite is missing (fresh clone or another worktree). Refusing to start: a new database would overwrite the versioned history. Copy the database from the machine that owns it; restore from the mirror arrives with Project Passport (PHASE-11).');
    }
    if (isInterimProject(root)) {
      throw new ProjectError('INTERIM_PROJECT', '.ases/ is still managed by scripts/ases-dev.mjs (interim bootstrap); run `ases migrate-interim` once to hand it over to the engine');
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
      const engine = new Engine(root, adapter, store, server, manifest.name, o.simulators ?? simulatorCount());
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

  /** Raiz do projeto (para comandos que validam caminhos de evidência). */
  /** Dependências do worker para operações fora do /run (p.ex. /review); o aceite de providers reais fica registrado. */
  workerDeps(consent: string[] = [], timeoutMs = 600_000): WorkerDeps {
    for (const providerId of consent) this.mutate((s) => s.appendEvent({ eventType: 'ApprovalGranted', payload: { scope: 'provider-run', providerId, grantedBy: 'user (--consent)', note: 'usa a sessão do cliente oficial; pode consumir cota/cobrança da conta' } }));
    return { root: this.root, mutate: (fn) => this.mutate(fn), read: (fn) => fn(this.store), providers: this.providers, ttlMs: 30_000, timeoutMs, consented: new Set(consent) };
  }

  /** Definido só no motor residente (`ases daemon run`): executa uma linha vinda de um cliente `control`. */
  commandHandler?: (line: string) => Promise<string>;

  get platform(): PlatformAdapter {
    return this.adapter;
  }

  get projectRoot(): string {
    return this.root;
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
      writeReports(this.root, this.store);
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
      // motor residente (PHASE-12): o cliente `ases` ligado envia linhas de comando; quem executa é o motor
      'session.command': (p) => {
        if (!this.commandHandler) throw Object.assign(new Error('this engine does not accept remote commands'), { code: 'NOT_RESIDENT' });
        return this.commandHandler(str(p.line, 'line'));
      },
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

  /** Tarefas com worker ativo neste engine. */
  get runningTasks(): string[] {
    return [...this.controllers.keys()];
  }

  get isRunning(): boolean {
    return this.current !== undefined;
  }

  /**
   * /run: scheduler + workers até não haver nada elegível (§5.3). Um run por vez; as tarefas reservadas por este engine
   * usam leases com o pid no dono, então outro processo nunca as executa em duplicidade.
   */
  async run(o: { phaseId?: string; maxParallel: number; timeoutMs: number; consent?: string[]; onOutcome?: (x: AttemptOutcome) => void }): Promise<{ outcomes: AttemptOutcome[]; waiting: { taskId: string; reason: string }[] }> {
    if (this.current) throw Object.assign(new Error('a /run is already in progress (use /cancel TAR-XXXX or wait)'), { code: 'RUN_IN_PROGRESS' });
    const consent = [...new Set(o.consent ?? [])];
    const unknown = consent.filter((id) => !(id in this.providers) || id === 'simulator');
    if (unknown.length) throw Object.assign(new Error(`--consent: unknown real provider(s) ${unknown.join(', ')}`), { code: 'INVALID_INPUT' });
    // AER-REQ-123: o aceite fica no histórico, com escopo deste run
    for (const providerId of consent) this.mutate((s) => s.appendEvent({ eventType: 'ApprovalGranted', payload: { scope: 'provider-run', providerId, grantedBy: 'user (/run --consent)', note: 'usa a sessão do cliente oficial; pode consumir cota/cobrança da conta' } }));
    this.runAbort = new AbortController();
    const p = runQueue(
      { root: this.root, mutate: (fn) => this.mutate(fn), read: (fn) => fn(this.store), providers: this.providers, ttlMs: 30_000, timeoutMs: o.timeoutMs, consented: new Set(consent) },
      // paralelismo 1 por provider real: termos de uso individual (docs/PROVIDERS_PESQUISA.md)
      { ownerId: `ases:${process.pid}`, maxParallel: o.maxParallel, maxPerProvider: { claude: 1, codex: 1, kimi: 1, opencode: 1, google: 1 }, signal: this.runAbort.signal, controllers: this.controllers, ...(o.phaseId ? { phaseId: o.phaseId } : {}), ...(o.onOutcome ? { onOutcome: o.onOutcome } : {}) },
    );
    this.current = p;
    try {
      return await p;
    } finally {
      this.current = undefined;
      this.runAbort = undefined;
    }
  }

  /**
   * Execução exclusiva fora do /run (PHASE-18: plano do chat). Mesmo guarda do /run (um por vez), o mesmo sinal de
   * encerramento e o mesmo mapa de controllers, então /cancel e /parar alcançam as tarefas do plano.
   */
  async exclusive<T>(fn: (signal: AbortSignal, controllers: Map<string, AbortController>) => Promise<T>): Promise<T> {
    if (this.current) throw Object.assign(new Error('outra execução está em andamento (/parar ou espere)'), { code: 'RUN_IN_PROGRESS' });
    this.runAbort = new AbortController();
    const p = fn(this.runAbort.signal, this.controllers);
    this.current = p;
    try {
      return await p;
    } finally {
      this.current = undefined;
      this.runAbort = undefined;
    }
  }

  /** Aborta a execução exclusiva em curso (/parar): as tentativas são canceladas e reconciliadas. */
  abortExclusive(): boolean {
    this.runAbort?.abort();
    return this.runAbort !== undefined;
  }

  /** Cancela uma tarefa em execução; o worker reconcilia a árvore de processos antes de marcar CANCELLED. */
  cancelTask(taskId: string): boolean {
    const c = this.controllers.get(taskId);
    c?.abort();
    return c !== undefined;
  }

  /** Encerra: cancela e reconcilia o que estiver rodando, depois fecha IPC e banco. */
  async stop(): Promise<{ cancelled: number; lastSeq: number }> {
    const cancelled = this.controllers.size;
    this.runAbort?.abort();
    await this.current?.catch(() => undefined);
    const lastSeq = this.store.lastSeq();
    await this.server.close();
    rmSync(sessionFile(this.adapter, this.store.projectId), { force: true });
    this.store.close();
    return { cancelled, lastSeq };
  }
}
