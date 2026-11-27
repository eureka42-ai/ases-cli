import type { EventEnvelope } from '@aer/contracts';

// PHASE-26 (runner metrics do ESAA): quem rende mais em cada projeto, só a partir do histórico de eventos.

export interface ProviderMetrics { provider: string; attempts: number; ok: number; failed: number; reworks: number; avgSeconds: number; tokens: number }

export function providerMetrics(events: EventEnvelope[]): ProviderMetrics[] {
  const byAttempt = new Map<string, { provider: string; start: number }>();
  const lastProviderOfTask = new Map<string, string>();
  const m = new Map<string, ProviderMetrics & { totalMs: number; ended: number }>();
  const get = (provider: string) => {
    let x = m.get(provider);
    if (!x) m.set(provider, (x = { provider, attempts: 0, ok: 0, failed: 0, reworks: 0, avgSeconds: 0, tokens: 0, totalMs: 0, ended: 0 }));
    return x;
  };
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    if (e.eventType === 'AttemptStarted' && e.attemptId) {
      const provider = String(p.providerId);
      byAttempt.set(e.attemptId, { provider, start: Date.parse(e.occurredAt) });
      if (e.taskId) lastProviderOfTask.set(e.taskId, provider);
      get(provider).attempts++;
    } else if (e.eventType === 'AttemptExited' && e.attemptId && byAttempt.has(e.attemptId)) {
      const a = byAttempt.get(e.attemptId)!;
      const x = get(a.provider);
      if (p.state === 'EXITED' && p.exitCode === 0) x.ok++;
      else if (p.state !== 'CANCELLED') x.failed++;
      x.totalMs += Date.parse(e.occurredAt) - a.start;
      x.ended++;
    } else if (e.eventType === 'ProviderUsageObserved' && e.attemptId && byAttempt.has(e.attemptId) && /token/i.test(String(p.metric))) {
      get(byAttempt.get(e.attemptId)!.provider).tokens += Number(p.value) || 0;
    } else if (e.eventType === 'TaskReworkRequested' && e.taskId && lastProviderOfTask.has(e.taskId)) {
      get(lastProviderOfTask.get(e.taskId)!).reworks++;
    }
  }
  return [...m.values()].sort((a, b) => a.provider.localeCompare(b.provider))
    .map(({ totalMs, ended, ...x }) => ({ ...x, avgSeconds: ended ? Math.round(totalMs / ended / 1000) : 0 }));
}

export function metricsText(events: EventEnvelope[]): string {
  const rows = providerMetrics(events);
  if (!rows.length) return 'nenhuma tarefa executada por IA neste projeto ainda; as métricas aparecem depois do primeiro plano.';
  const n = (v: number) => v.toLocaleString('pt-BR');
  return ['Métricas por IA neste projeto (do histórico):', ...rows.map((r) => {
    const done = r.ok + r.failed;
    return `  ${r.provider} · ${r.attempts} tentativa(s) · ${done ? Math.round((r.ok / done) * 100) : 0}% ok · ${r.reworks} refação(ões) · média ${r.avgSeconds} s · ${n(r.tokens)} tokens`;
  })].join('\n');
}
