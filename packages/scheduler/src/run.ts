import type { ProjectStore } from '@aer/persistence';
import { tick } from './scheduler.ts';
import { runAttempt, type AttemptOutcome, type WorkerDeps } from './worker.ts';

export interface RunOptions {
  ownerId: string;
  maxParallel: number;
  phaseId?: string;
  /** aborta tudo (p.ex. saída do `ases`): tentativas em curso são canceladas e reconciliadas */
  signal: AbortSignal;
  /** uma entrada por tarefa em execução; abortar uma cancela só aquela tarefa (/cancel) */
  controllers?: Map<string, AbortController>;
  onOutcome?: (o: AttemptOutcome) => void;
}

/**
 * Laço do scheduler: reserva até `maxParallel` tarefas elegíveis, roda cada uma num worker e volta a reservar quando
 * alguma termina (dependências recém-concluídas entram na rodada seguinte). Termina quando nada roda e nada é elegível.
 */
export async function runQueue(d: WorkerDeps, o: RunOptions): Promise<{ outcomes: AttemptOutcome[]; waiting: { taskId: string; reason: string }[] }> {
  const controllers = o.controllers ?? new Map<string, AbortController>();
  const running = new Map<string, Promise<void>>();
  const outcomes: AttemptOutcome[] = [];
  let waiting: { taskId: string; reason: string }[] = [];
  for (;;) {
    if (!o.signal.aborted) {
      const r = d.mutate((s: ProjectStore) => tick(s, { ownerId: o.ownerId, ttlMs: d.ttlMs, maxParallel: o.maxParallel, ...(o.phaseId ? { phaseId: o.phaseId } : {}) }));
      waiting = r.waiting;
      for (const x of r.reserved) {
        const ac = new AbortController();
        const linked = () => ac.abort();
        o.signal.addEventListener('abort', linked, { once: true });
        controllers.set(x.taskId, ac);
        running.set(x.taskId, runAttempt(d, x, ac.signal).then((res) => {
          outcomes.push(res);
          o.onOutcome?.(res);
        }).finally(() => {
          o.signal.removeEventListener('abort', linked);
          controllers.delete(x.taskId);
          running.delete(x.taskId);
        }));
      }
    }
    if (!running.size) return { outcomes, waiting };
    await Promise.race(running.values());
  }
}
