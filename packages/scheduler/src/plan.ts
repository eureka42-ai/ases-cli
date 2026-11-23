import type { Lease, TaskRow } from '@aer/persistence';

export interface Candidate {
  taskId: string;
  priority: number;
  unblocks: number;
  explanation: string;
}
export interface Waiting {
  taskId: string;
  reason: string;
}

/** Quantas tarefas (transitivamente) esperam por cada tarefa: desbloquear mais vem antes (caminho crítico explicativo, §5.3-10). */
function dependentsCount(tasks: TaskRow[]): Map<string, number> {
  const rev = new Map<string, string[]>();
  for (const t of tasks) for (const d of t.dependsOn) rev.set(d, [...(rev.get(d) ?? []), t.id]);
  const memo = new Map<string, Set<string>>();
  const walk = (id: string, seen = new Set<string>()): Set<string> => {
    if (memo.has(id)) return memo.get(id)!;
    const out = new Set<string>();
    for (const c of rev.get(id) ?? []) {
      if (seen.has(c)) continue; // defensivo: o store já rejeita ciclos
      out.add(c);
      for (const x of walk(c, new Set([...seen, c]))) out.add(x);
    }
    memo.set(id, out);
    return out;
  };
  return new Map(tasks.map((t) => [t.id, walk(t.id).size]));
}

/**
 * Elegíveis = READY, dependências COMPLETED, sem lease vivo, recursos livres. Ordem: prioridade ↓, desbloqueios ↓, id ↑.
 * Tarefas READY que não podem rodar aparecem em `waiting` com o motivo (AER-REQ-025/037). Função pura.
 */
export function plan(tasks: TaskRow[], leases: Lease[]): { eligible: Candidate[]; waiting: Waiting[] } {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const leased = new Set(leases.map((l) => l.taskId));
  const held = new Map<string, string>();
  for (const l of leases) for (const r of byId.get(l.taskId)?.resources ?? []) held.set(r, l.taskId);
  const unblocks = dependentsCount(tasks);
  const eligible: Candidate[] = [];
  const waiting: Waiting[] = [];
  for (const t of tasks) {
    if (t.state !== 'READY' || leased.has(t.id)) continue;
    const pending = t.dependsOn.filter((d) => byId.get(d)?.state !== 'COMPLETED');
    if (pending.length) {
      waiting.push({ taskId: t.id, reason: `aguarda ${pending.map((d) => `${d}(${byId.get(d)?.state ?? '?'})`).join(', ')}` });
      continue;
    }
    const busy = t.resources.find((r) => held.has(r));
    if (busy) {
      waiting.push({ taskId: t.id, reason: `recurso ${busy} em uso por ${held.get(busy)}` });
      continue;
    }
    eligible.push({ taskId: t.id, priority: t.priority, unblocks: unblocks.get(t.id) ?? 0, explanation: '' });
  }
  eligible.sort((a, b) => b.priority - a.priority || b.unblocks - a.unblocks || a.taskId.localeCompare(b.taskId));
  eligible.forEach((c, i) => {
    const t = byId.get(c.taskId)!;
    const alternatives = eligible.filter((x) => x !== c).slice(0, 3).map((x) => `${x.taskId}(p${x.priority})`);
    c.explanation = [
      `${c.taskId}: posição ${i + 1} de ${eligible.length} elegível(is)`,
      `prioridade ${c.priority}`,
      `desbloqueia ${c.unblocks} tarefa(s)`,
      t.dependsOn.length ? `dependências concluídas: ${t.dependsOn.join(', ')}` : 'sem dependências',
      t.resources.length ? `recursos livres: ${t.resources.join(', ')}` : 'sem recursos compartilhados',
      t.provider ? `provider ${t.provider}` : 'provider não definido',
      alternatives.length ? `alternativas: ${alternatives.join(', ')}` : 'sem alternativas',
    ].join('; ');
  });
  return { eligible, waiting };
}
