import { currentBranch, restoreFromPoint } from '@aer/git-bridge';
import type { ConversationRow, PlanRow, PlannedTask } from '@aer/persistence';
import { chatConfig, saveChatConfig, type ChatConfig, type ChatMode } from '@aer/project-store';
import type { AgentStreamEvent, ProviderProbeResult } from '@aer/provider-sdk';
import { ChatQueue, executePlan, mergeTask, runChatTurn, summaryMessage, type ChatTurnResult, type PlanProgress, type PlanResult, type WorkerDeps } from '@aer/scheduler';
import type { Engine } from './engine.ts';

// PHASE-18: a sessão de chat do `ases`. Guarda o consentimento por IA desta sessão, a fila de turnos da principal
// e liga os planos aprovados à execução em paralelo (executePlan) e ao resumo final.

const ORDER = ['claude', 'codex', 'kimi', 'opencode', 'google', 'simulator'];

/** O plano espera o usuário (`ask`) ou roda direto (`run`). */
export function decidePlanMode(mode: ChatMode, plan: { tasks: Pick<PlannedTask, 'provider'>[] }, consented: ReadonlySet<string>): 'ask' | 'run' {
  if (mode === 'manual') return 'ask';
  if (mode === 'auto') return 'run';
  const ok = plan.tasks.every((t) => t.provider.startsWith('simulator') || consented.has(t.provider));
  return ok && plan.tasks.length <= 3 ? 'run' : 'ask';
}

export interface ChatEvents {
  onAgentEvent?: (e: AgentStreamEvent) => void;
  onProgress?: (p: PlanProgress) => void;
}

export class ChatSession {
  readonly consent = new Set<string>();
  private probes: Record<string, ProviderProbeResult> | undefined;
  private readonly queue: ChatQueue;
  private events: ChatEvents = {};
  private readonly engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
    for (const id of this.config().consent) this.consent.add(id);
    this.queue = new ChatQueue((m) => this.turn(m));
  }

  config(): ChatConfig & { sources: Record<keyof ChatConfig, string> } {
    return chatConfig(this.engine.projectRoot);
  }

  on(e: ChatEvents): void {
    this.events = e;
  }

  get pending(): number {
    return this.queue.pending;
  }

  /** Probe de todas as IAs (só --version e status de login, como o `ases doctor`; não é chamada cobrada). */
  async probeAll(refresh = false): Promise<Record<string, ProviderProbeResult>> {
    if (this.probes && !refresh) return this.probes;
    const entries = await Promise.all(Object.entries(this.engine.providers).map(async ([id, p]) => [id, await p.probe().catch((err: Error) => ({ providerId: id, availability: 'UNKNOWN', evidence: [err.message] }) as unknown as ProviderProbeResult)] as const));
    this.probes = Object.fromEntries(entries);
    return this.probes;
  }

  /** IAs que podem receber trabalho: prontas e (simuladas ou autorizadas nesta sessão). */
  async workers(): Promise<string[]> {
    const p = await this.probeAll();
    return Object.keys(p).filter((id) => p[id]!.availability === 'READY' && (id.startsWith('simulator') || this.consent.has(id)));
  }

  /** Conversa atual; a primeira usa a principal do CONFIG, senão a primeira IA pronta (sempre mostrada ao usuário). */
  async conversation(): Promise<ConversationRow> {
    const c = this.engine.store.currentConversation();
    if (c) return c;
    const cfg = this.config();
    let main = cfg.main;
    if (!main) {
      const p = await this.probeAll();
      main = ORDER.find((id) => p[id]?.availability === 'READY') ?? 'simulator';
    }
    this.engine.mutate((s) => s.startConversation(main!, cfg.mode));
    return this.engine.store.currentConversation()!;
  }

  newConversation(): string {
    const c = this.engine.store.currentConversation();
    const cfg = this.config();
    return this.engine.mutate((s) => s.startConversation(c?.main ?? cfg.main ?? 'simulator', c?.mode ?? cfg.mode));
  }

  deps(): WorkerDeps {
    return { ...this.engine.workerDeps(), consented: new Set(this.consent) };
  }

  grantConsent(id: string, save: boolean): void {
    this.consent.add(id);
    this.engine.mutate((s) => s.appendEvent({ eventType: 'ApprovalGranted', payload: { scope: 'provider-session', providerId: id, grantedBy: 'user (/config consentir)', note: 'usa a sessão do cliente oficial; pode consumir cota/cobrança da conta' } }));
    if (save) saveChatConfig('project', this.engine.projectRoot, { consent: [...new Set([...this.config().consent, id])] });
  }

  revokeConsent(id: string): void {
    this.consent.delete(id);
    const saved = this.config().consent;
    if (saved.includes(id)) saveChatConfig('project', this.engine.projectRoot, { consent: saved.filter((x) => x !== id) });
  }

  /** Mensagem de texto livre: entra na fila de turnos da principal. */
  send(message: string): Promise<ChatTurnResult> {
    return this.queue.enqueue(message);
  }

  private async turn(message: string): Promise<ChatTurnResult> {
    const c = await this.conversation();
    return runChatTurn(this.deps(), {
      conversationId: c.id, message, main: c.main, ready: await this.workers(), signal: new AbortController().signal, limits: this.config().limits,
      ...(this.events.onAgentEvent ? { onEvent: this.events.onAgentEvent } : {}),
    });
  }

  async pendingPlan(): Promise<PlanRow | undefined> {
    return this.engine.store.pendingPlan((await this.conversation()).id);
  }

  /** Roda um plano já aprovado e, no fim, pede o resumo à principal (pela mesma fila). */
  async runPlan(planId: string): Promise<{ result: PlanResult; summary: ChatTurnResult }> {
    const c = await this.conversation();
    const cfg = this.config();
    const ready = await this.workers();
    const result = await this.engine.exclusive((signal, controllers) => executePlan(this.deps(), {
      planId, ready,
      main: c.main, limits: cfg.limits, crossReview: cfg.crossReview, ...(cfg.testCommand ? { testCommand: cfg.testCommand } : {}), testsApproved: Boolean(cfg.testCommand),
      platform: this.engine.platform, signal, controllers, ...(this.events.onProgress ? { onProgress: this.events.onProgress } : {}),
    }));
    const summary = await this.send(summaryMessage(result));
    return { result, summary };
  }

  async undo(): Promise<string> {
    const c = await this.conversation();
    const rp = this.engine.store.lastRestorePoint(c.id);
    if (!rp) return 'nada para desfazer nesta conversa';
    const r = await restoreFromPoint(this.engine.projectRoot, rp.ref, rp.files);
    if ('refused' in r) return `não desfiz: você alterou ${r.refused.join(', ')} depois da principal; desfaça à mão ou salve antes`;
    this.engine.mutate((s) => s.markRestoreApplied(c.id, rp.n));
    return `desfeito: ${r.restored.join(', ')}`;
  }

  /** Tarefas da conversa (a fase `Conversa CNV-…`). */
  async tasks() {
    const c = await this.conversation();
    return c.phaseId ? this.engine.store.listTasks(c.phaseId) : [];
  }

  /** /aceitar: REVIEW → APPROVED → merge no branch atual. Checkout sujo ou conflito param com o motivo. */
  async accept(only?: string): Promise<string[]> {
    const list = (await this.tasks()).filter((t) => t.state === 'REVIEW' && (!only || t.id === only));
    if (!list.length) return [only ? `${only} não está pronta (precisa estar em REVIEW)` : 'nenhuma tarefa pronta para aceitar'];
    const out: string[] = [];
    const target = await currentBranch(this.engine.projectRoot);
    for (const t of list) {
      try {
        this.engine.mutate((s) => s.transitionTask(t.id, 'APPROVED', s.getTask(t.id)!.version, 'aceita pelo usuário (/aceitar)'));
        const r = await mergeTask(this.engine.store, this.engine.projectRoot, t.id, { ownerId: `ases:${process.pid}`, target });
        this.engine.mutate(() => undefined); // publica os eventos do merge
        out.push(r.status === 'CONFLICT' ? `${t.id}: conflito em ${r.files.join(', ')}; resolva e rode /aceitar ${Number(t.id.slice(4))} de novo`
          : r.status === 'COMPLETED' ? `${t.id}: integrada e concluída (${r.commit.slice(0, 12)})`
            : `${t.id}: integrada (${r.commit.slice(0, 12)}); falta evidência para concluir: rode os testes ou /evidence add`);
      } catch (err) {
        const e = err as Error & { code?: string };
        out.push(e.code === 'DIRTY_TREE' ? `${t.id}: há mudanças não salvas no projeto (inclusive edições da principal); faça commit ou /desfazer antes`
          : `${t.id}: ${e.code ? `${e.code} ` : ''}${e.message}`);
      }
    }
    return out;
  }
}
