import { boundaryViolations, changedFiles } from './boundaries.ts';
import type { TaskState } from '@aer/contracts';
import { StoreError } from '@aer/persistence';
import { redactText, type ProcessPlatform } from '@aer/provider-sdk';
import { handoffTask } from './handoff.ts';
import { runReview } from './review.ts';
import { runQueue } from './run.ts';
import { runTestInWorktree } from './test-run.ts';
import { DEFAULT_RATE_LIMIT_COOLDOWN_MS, parseProviderSpec, type WorkerDeps } from './worker.ts';

// PHASE-18: um plano aprovado vira tarefas que rodam em paralelo entre as IAs, com um laço de qualidade:
// testes obrigatórios (até 2 refações), troca automática de IA (até 2 trocas) e revisão cruzada por outra IA.

export interface PlanProgress { taskId: string; provider: string; state: TaskState; note?: string }
export interface PlanTaskResult {
  taskId: string;
  provider: string;
  state: TaskState;
  tests: 'PASS' | 'FAIL' | 'NONE';
  review?: 'APPROVED' | 'REJECTED' | 'UNCLEAR' | 'INVALID';
  swaps: number;
  reworks: number;
  reason: string;
}
export interface PlanResult { planId: string; tasks: PlanTaskResult[] }

const MAX_SWAPS = 2;
const MAX_REWORKS = 2;
/** Motivos que pedem outra IA (cota, login, travamento), nunca erro do próprio trabalho. */
const SWAP_CODES = ['RATE_LIMITED', 'PROVIDER_COOLDOWN', 'AUTH_EXPIRED', 'TIMEOUT', 'PROCESS_TREE_NOT_RECONCILED'];

const baseId = (spec: string) => parseProviderSpec(spec)?.providerId ?? spec;
/** Revisor simulado precisa do cenário de revisão; IA real usa o padrão dela. */
const reviewerSpec = (id: string) => (id.startsWith('simulator') ? `${id}:review` : id);

export async function executePlan(d: WorkerDeps, o: {
  planId: string; ready: string[]; main: string; limits: Record<string, number>; crossReview: boolean; testCommand?: string[]; testsApproved: boolean;
  platform: ProcessPlatform; signal: AbortSignal; onProgress?: (p: PlanProgress) => void; controllers?: Map<string, AbortController>;
  /** IA → IA:modelo escolhido em /modelo (PHASE-20) */
  modelFor?: (provider: string) => string;
}): Promise<PlanResult> {
  const read = d.read ?? d.mutate;
  const plan = read((s) => s.getPlan(o.planId));
  if (!plan) throw new StoreError('NOT_FOUND', `plan ${o.planId} not found`);
  if (plan.state !== 'APPROVED') throw new StoreError('INVALID_TRANSITION', `plan ${o.planId} is ${plan.state}; approve it first`);
  const cnv = read((s) => s.currentConversation());
  // fase da conversa: criada uma vez e reaproveitada pelos próximos planos
  let phaseId = cnv?.id === plan.conversationId ? cnv.phaseId : null;
  if (!phaseId) {
    phaseId = d.mutate((s) => s.createPhase(`Conversa ${plan.conversationId}`));
    d.mutate((s) => s.setConversationPhase(plan.conversationId, phaseId!));
    for (const to of ['READY', 'RUNNING'] as const) d.mutate((s) => s.transitionPhase(phaseId!, to, s.listPhases().find((p) => p.id === phaseId)!.version, `plano ${o.planId}`));
  }
  const ids = plan.tasks.map((t) => d.mutate((s) => s.createTask({ phaseId: phaseId!, title: t.title, description: t.instructions, provider: o.modelFor ? o.modelFor(t.provider) : t.provider })));
  const state = ids.map((taskId, i) => ({ taskId, i, swaps: 0, reworks: 0, tests: 'NONE' as PlanTaskResult['tests'], review: undefined as PlanTaskResult['review'], done: false, reason: '', released: false }));
  const task = (id: string) => read((s) => s.getTask(id))!;
  const progress = (id: string, note?: string) => {
    const t = task(id);
    o.onProgress?.({ taskId: id, provider: baseId(t.provider ?? ''), state: t.state, ...(note ? { note } : {}) });
  };
  // dependências: a tarefa só é liberada quando as de que depende chegaram a REVIEW (o merge é do usuário, /aceitar)
  // shortcut: a tarefa dependente parte do HEAD, sem as mudanças da anterior; usar a ponta da branch dela quando houver mais de uma dependência por plano
  const release = () => {
    let any = false;
    for (const x of state) {
      if (x.released) continue;
      const deps = plan.tasks[x.i]!.dependsOn.map((n) => state[n - 1]!);
      if (deps.every((dep) => dep.done && task(dep.taskId).state === 'REVIEW')) {
        d.mutate((s) => s.transitionTask(x.taskId, 'READY', s.getTask(x.taskId)!.version, `plano ${o.planId}`));
        x.released = true;
        any = true;
        progress(x.taskId);
      } else if (deps.some((dep) => dep.done && task(dep.taskId).state !== 'REVIEW')) {
        x.released = true;
        x.done = true;
        x.reason = `dependência ${deps.find((dep) => task(dep.taskId).state !== 'REVIEW')!.taskId} não ficou pronta`;
      }
    }
    return any;
  };
  d.mutate((s) => s.setPlanState(o.planId, 'RUNNING'));
  const limits = Object.fromEntries(o.ready.map((p) => [p, o.limits[p] ?? 1]));
  const maxParallel = Math.max(1, Object.values(limits).reduce((a, b) => a + b, 0));
  const cooling = (p: string) => Boolean(read((s) => s.providerCooldownUntil(p, d.rateLimitCooldownMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS)));
  const busyCount = () => {
    const b: Record<string, number> = {};
    for (const x of state) {
      const t = task(x.taskId);
      if (['READY', 'RESERVED', 'RUNNING'].includes(t.state) && t.provider) b[baseId(t.provider)] = (b[baseId(t.provider)] ?? 0) + 1;
    }
    return b;
  };

  // PHASE-26 (lições do ESAA): um bloqueio vira sugestão de lição (PROPOSED); só vale depois que uma pessoa aprova
  const suggest = (text: string, source: string) => d.mutate((s) => (s.listLessons().some((l) => l.text === text) ? undefined : s.addLesson({ text, source })));
  release();
  while (!o.signal.aborted) {
    await runQueue(d, { ownerId: `plan:${o.planId}`, maxParallel, maxPerProvider: limits, phaseId, signal: o.signal, ...(o.controllers ? { controllers: o.controllers } : {}), onOutcome: (x) => progress(x.taskId) });
    let changed = false;
    for (const x of state) {
      if (x.done || !x.released) continue;
      const t = task(x.taskId);
      if (t.state === 'REVIEW') {
        // 0) limites de escrita do tipo da tarefa (boundaries do ESAA): fora do limite, a entrega não segue
        const kind = plan.tasks[x.i]!.kind;
        if (kind === 'docs' || kind === 'test' || kind === 'review') {
          const atts = read((s) => s.listAttempts(x.taskId));
          const base = atts.find((a) => a.baseCommit)?.baseCommit;
          const tip = atts.findLast((a) => a.branch)?.branch;
          const bad = base && tip ? boundaryViolations(kind, await changedFiles(d.root, base, tip).catch(() => [])) : [];
          if (bad.length) {
            const label = { docs: 'documentação', test: 'teste', review: 'revisão' }[kind];
            x.reason = `BOUNDARY_VIOLATION: tarefa de ${label} alterou ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ` e mais ${bad.length - 5}` : ''}`;
            d.mutate((s) => s.transitionTask(x.taskId, 'BLOCKED', s.getTask(x.taskId)!.version, x.reason));
            suggest(`Tarefas de ${label} ${{ docs: 'só alteram documentação', test: 'só alteram arquivos de teste', review: 'não alteram arquivos' }[kind]}; outras mudanças vão numa tarefa "code".`, x.taskId);
            x.done = true;
            progress(x.taskId, 'fora do limite do tipo de tarefa');
            continue;
          }
        }
        // 1) testes obrigatórios, quando o projeto tem comando autorizado
        if (o.testCommand && o.testsApproved) {
          const r = await runTestInWorktree(d, o.platform, x.taskId, o.testCommand);
          if (r.exitCode !== 0) {
            x.tests = 'FAIL';
            if (x.reworks < MAX_REWORKS) {
              x.reworks++;
              d.mutate((s) => s.appendEvent({ eventType: 'TaskReworkRequested', phaseId, taskId: x.taskId, payload: { reason: 'TESTS_FAILING', log: r.log, rework: x.reworks } }));
              await handoffTask(d, x.taskId, t.provider ?? '', `TESTS_FAILING (refação ${x.reworks}/${MAX_REWORKS}): \`${o.testCommand.join(' ')}\` saiu com ${r.exitCode}. Log: ${r.log}\n${redactText(r.output.slice(-4000), 4000).text}`);
              progress(x.taskId, `testes falharam; refação ${x.reworks}`);
              changed = true;
              continue;
            }
            d.mutate((s) => s.transitionTask(x.taskId, 'BLOCKED', s.getTask(x.taskId)!.version, `TESTS_FAILING_AFTER_2_REWORKS: ${r.log}`));
            suggest(`Antes de entregar, rode \`${o.testCommand.join(' ')}\` e só entregue com os testes passando.`, x.taskId);
            x.done = true;
            x.reason = `TESTS_FAILING_AFTER_2_REWORKS: ${r.log}`;
            continue;
          }
          x.tests = 'PASS';
        } else x.reason = o.testCommand && !o.testsApproved ? `comando de teste do projeto não autorizado (confirme com /config teste ${o.testCommand.join(' ')})` : 'sem teste configurado';
        // 2) revisão cruzada por uma IA que não escreveu a tarefa
        if (o.crossReview) {
          const authors = new Set(read((s) => s.listAttempts(x.taskId)).map((a) => a.providerId));
          const busy = busyCount();
          // a principal fica por último: ela atende o chat, e uma IA não abre duas sessões ao mesmo tempo
          const pool = [...o.ready.filter((p) => p !== o.main).sort((a, b) => (busy[a] ?? 0) - (busy[b] ?? 0)), o.main].filter((p) => !authors.has(p) && (!d.providers[p]?.requiresConsent || d.consented?.has(p)));
          if (pool[0]) {
            const rv = await runReview(d, x.taskId, reviewerSpec(pool[0]), o.signal).catch((err: Error) => ({ verdict: 'INVALID' as const, reason: err.message }));
            x.review = rv.verdict;
          }
        }
        x.done = true;
        x.reason = x.reason || 'pronta para /aceitar';
        progress(x.taskId, 'pronta');
        changed = true;
      } else if (['BLOCKED', 'FAILED'].includes(t.state)) {
        const reasonNow = read((s) => s.eventsSince(0, 100_000).filter((e) => e.taskId === x.taskId && e.eventType === 'TaskUpdated').at(-1)?.payload.reason);
        const code = SWAP_CODES.find((c) => String(reasonNow ?? '').startsWith(c));
        const current = baseId(t.provider ?? '');
        const busy = busyCount();
        const target = o.ready.filter((p) => p !== current && p !== o.main && !cooling(p)).sort((a, b) => (busy[a] ?? 0) - (busy[b] ?? 0))[0];
        if (code && x.swaps < MAX_SWAPS && target) {
          x.swaps++;
          await handoffTask(d, x.taskId, o.modelFor ? o.modelFor(target) : target, `${code}: troca automática ${current} → ${target} (${x.swaps}/${MAX_SWAPS})`);
          progress(x.taskId, `${code}: passou de ${current} para ${target}`);
          changed = true;
        } else {
          x.done = true;
          x.reason = String(reasonNow ?? t.state);
        }
      }
    }
    if (release()) changed = true;
    if (!changed) break;
  }
  d.mutate((s) => s.setPlanState(o.planId, 'DONE'));
  return {
    planId: o.planId,
    tasks: state.map((x) => {
      const t = task(x.taskId);
      return { taskId: x.taskId, provider: baseId(t.provider ?? ''), state: t.state, tests: x.tests, ...(x.review ? { review: x.review } : {}), swaps: x.swaps, reworks: x.reworks, reason: x.reason || t.state };
    }),
  };
}

/** Mensagem do turno de resumo da principal. */
export function summaryMessage(r: PlanResult): string {
  return [`RESUMO DO PLANO ${r.planId}`, ...r.tasks.map((t) => `- ${t.taskId} ${t.provider} ${t.state} testes:${t.tests} revisão:${t.review ?? '—'} trocas:${t.swaps} refações:${t.reworks} — ${t.reason}`)].join('\n');
}
