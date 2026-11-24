import { StoreError, type PlannedTask, type TaskKind } from '@aer/persistence';

// PHASE-18: o plano que a principal devolve no fim da resposta, num bloco ```aer-plan (JSON).
export interface RawPlanTask { title: string; instructions: string; kind: TaskKind; dependsOn: number[]; prefer?: string }
export interface RawPlan { tasks: RawPlanTask[] }

const KINDS: readonly string[] = ['code', 'test', 'docs', 'review', 'other'];
const BLOCK_RE = /```aer-plan[ \t]*\r?\n([\s\S]*?)\r?\n?```/g;

function validate(j: unknown): RawPlan | string {
  const tasks = (j as { tasks?: unknown } | null)?.tasks;
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 12) return 'o plano precisa de 1 a 12 tarefas';
  const out: RawPlanTask[] = [];
  for (const [i, raw] of tasks.entries()) {
    const n = i + 1;
    const x = raw as Record<string, unknown>;
    if (typeof x?.title !== 'string' || !x.title.trim() || x.title.length > 120) return `tarefa ${n}: title precisa ter 1 a 120 caracteres`;
    if (typeof x.instructions !== 'string' || !x.instructions.trim() || x.instructions.length > 8000) return `tarefa ${n}: instructions precisa ter 1 a 8000 caracteres`;
    if (x.kind !== undefined && !KINDS.includes(x.kind as string)) return `tarefa ${n}: kind inválido (${String(x.kind)}); use ${KINDS.join('|')}`;
    const deps = x.dependsOn ?? [];
    if (!Array.isArray(deps) || deps.some((d) => !Number.isInteger(d))) return `tarefa ${n}: dependsOn precisa ser uma lista de números`;
    for (const d of deps as number[]) if (d < 1 || d > tasks.length) return `tarefa ${n}: dependsOn ${d} fora do intervalo 1..${tasks.length}`;
    if (x.prefer !== undefined && (typeof x.prefer !== 'string' || !/^[a-z][a-z0-9-]*$/.test(x.prefer))) return `tarefa ${n}: prefer inválido`;
    out.push({ title: x.title.trim(), instructions: x.instructions, kind: (x.kind as TaskKind | undefined) ?? 'other', dependsOn: deps as number[], ...(x.prefer ? { prefer: x.prefer as string } : {}) });
  }
  // ciclo (inclui auto-dependência): DFS com marcação
  const state = new Array<number>(out.length).fill(0);
  const visit = (i: number): boolean => {
    if (state[i] === 1) return true;
    if (state[i] === 2) return false;
    state[i] = 1;
    for (const d of out[i]!.dependsOn) if (visit(d - 1)) return true;
    state[i] = 2;
    return false;
  };
  for (let i = 0; i < out.length; i++) if (visit(i)) return `dependsOn forma um ciclo (tarefa ${i + 1})`;
  return { tasks: out };
}

/** Separa a resposta da principal do último bloco `aer-plan`. Plano inválido = `error`, e nada é executado. */
export function parseMainReply(text: string): { reply: string; plan?: RawPlan; error?: string } {
  const blocks = [...text.matchAll(BLOCK_RE)];
  if (!blocks.length) return { reply: text };
  const reply = text.replace(BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  let j: unknown;
  try {
    j = JSON.parse(blocks.at(-1)![1]!);
  } catch (err) {
    return { reply, error: `plano com JSON inválido: ${(err as Error).message}` };
  }
  const v = validate(j);
  return typeof v === 'string' ? { reply, error: v } : { reply, plan: v };
}

const ORDER = ['claude', 'codex', 'kimi', 'opencode', 'google', 'simulator'];
const rank = (id: string) => {
  const i = ORDER.indexOf(id);
  if (i >= 0) return i;
  const m = /^simulator-(\d+)$/.exec(id);
  return m ? ORDER.length + Number(m[1]) : 1000;
};

/**
 * Escolhe a IA de cada tarefa, de forma determinística e explicada. A principal fica de fora sempre que houver outra
 * IA pronta (limite de 1 sessão por IA); só sem outra opção ela executa as tarefas.
 */
export function assignProviders(plan: RawPlan, c: { ready: string[]; main: string; busy: Record<string, number>; limits: Record<string, number>; consented: Set<string> }): { tasks: PlannedTask[]; reasons: string[] } {
  if (!c.ready.length) throw new StoreError('NO_PROVIDER', 'nenhuma IA pronta; rode /ias');
  const others = c.ready.filter((p) => p !== c.main);
  const candidates = others.length ? others : [c.main];
  const onlyMain = !others.length;
  const busy = { ...c.busy };
  const load = (p: string) => (busy[p] ?? 0) / (c.limits[p] ?? 1);
  const tasks: PlannedTask[] = [];
  const reasons: string[] = [];
  for (const x of plan.tasks) {
    let pick: string;
    let why: string;
    if (onlyMain) {
      pick = c.main;
      why = `${pick}: única IA disponível (principal)`;
    } else if (x.prefer && candidates.includes(x.prefer) && (busy[x.prefer] ?? 0) < (c.limits[x.prefer] ?? 1)) {
      pick = x.prefer;
      why = `${pick}: preferida pela principal`;
    } else {
      pick = [...candidates].sort((a, b) => load(a) - load(b) || rank(a) - rank(b))[0]!;
      why = `${pick}: a menos ocupada`;
    }
    busy[pick] = (busy[pick] ?? 0) + 1;
    tasks.push({ title: x.title, instructions: x.instructions, provider: pick, kind: x.kind, dependsOn: x.dependsOn });
    reasons.push(why);
  }
  return { tasks, reasons };
}
