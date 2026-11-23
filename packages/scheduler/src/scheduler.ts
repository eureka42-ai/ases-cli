import { StoreError, type ProjectStore } from '@aer/persistence';
import { plan, type Candidate, type Waiting } from './plan.ts';

export interface TickOptions {
  ownerId: string;
  ttlMs: number;
  maxParallel: number;
  maxPerProvider?: Record<string, number>;
  phaseId?: string;
}

export interface TickResult {
  expired: { taskId: string; to: string }[];
  reserved: { taskId: string; fencingToken: number; explanation: string }[];
  skipped: { taskId: string; code: string }[];
  waiting: Waiting[];
}

const RACE_CODES = new Set(['LEASED', 'NOT_READY', 'CAPACITY', 'RESOURCE_BUSY', 'DEPENDENCIES_PENDING']);

/**
 * Uma rodada do scheduler: expira leases vencidos, planeja e reserva até a capacidade. Os limites são verificados de novo
 * dentro da transação de cada reserva, então rodadas concorrentes (outros processos) nunca ultrapassam o limite.
 */
export function tick(store: ProjectStore, o: TickOptions): TickResult {
  if (!Number.isInteger(o.maxParallel) || o.maxParallel < 1) throw new StoreError('INVALID_INPUT', 'maxParallel must be >= 1');
  const expired = store.expireLeases();
  const tasks = store.listTasks(o.phaseId);
  const { eligible } = plan(store.listTasks(), store.activeLeases());
  const inScope = new Set(tasks.map((t) => t.id));
  const reserved: TickResult['reserved'] = [];
  const skipped: TickResult['skipped'] = [];
  for (const c of eligible.filter((x: Candidate) => inScope.has(x.taskId))) {
    if (store.activeLeases().length >= o.maxParallel) break;
    try {
      const r = store.reserveTask(c.taskId, { ownerId: o.ownerId, ttlMs: o.ttlMs, explanation: c.explanation, maxActive: o.maxParallel, ...(o.maxPerProvider ? { maxPerProvider: o.maxPerProvider } : {}) });
      reserved.push({ taskId: c.taskId, fencingToken: r.fencingToken, explanation: c.explanation });
    } catch (err) {
      // perdeu a corrida para outro processo ou o limite foi atingido: segue para a próxima, sem retry cego
      if (err instanceof StoreError && RACE_CODES.has(err.code)) skipped.push({ taskId: c.taskId, code: err.code });
      else throw err;
    }
  }
  // motivos de espera recalculados depois das reservas, para refletir o estado que o usuário vai ver
  const { waiting } = plan(store.listTasks(), store.activeLeases());
  return { expired, reserved, skipped, waiting: waiting.filter((w) => inScope.has(w.taskId)) };
}
