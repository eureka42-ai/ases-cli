import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRestorePoint, markTurnEnd, repoRoot, resolveInside } from '@aer/git-bridge';
import type { ChatMessageRow, PhaseRow, TaskRow } from '@aer/persistence';
import { redactText, type AgentStreamEvent } from '@aer/provider-sdk';
import { assignProviders, parseMainReply } from './chat-plan.ts';
import type { WorkerDeps } from './worker.ts';

// PHASE-18: um turno da IA principal. Ela lê e edita direto no projeto (com ponto de restauração antes) e, para
// trabalho grande, devolve um bloco aer-plan que o ASES distribui entre as outras IAs.

export type ChatTurnResult =
  | { ok: true; reply: string; planId?: string; planError?: string; restore?: { n: number; files: string[] } }
  | { ok: false; code: string; message: string };

const DENIED_PATHS = ['.git', '.ases', '.env', '.env.*', '*.pem', '*.key'];
const isDenied = (rel: string) => {
  const parts = rel.split(/[\\/]/).filter(Boolean);
  const base = parts.at(-1) ?? '';
  return parts[0] === '.git' || parts[0] === '.ases' || /^\.env(\..*)?$/.test(base) || /\.(pem|key)$/i.test(base);
};

/** Prompt do papel de principal: regras, IAs disponíveis, projeto, histórico (cortado do mais antigo) e a mensagem. */
export function buildMainPrompt(i: { project: string; phases: PhaseRow[]; openTasks: TaskRow[]; ready: string[]; main: string; history: ChatMessageRow[]; message: string; budgetChars?: number }): string {
  const budget = i.budgetChars ?? 24_000;
  const others = i.ready.filter((p) => p !== i.main);
  const head = `# Você é a IA principal do ASES (Eureka42 · eureka42.org)
Converse com o usuário em português do Brasil. Você pode ler e editar os arquivos deste projeto, exceto .git, .ases e segredos (.env, chaves).
Para um pedido grande, que vale dividir entre outras IAs trabalhando em paralelo, termine a resposta com um bloco:
\`\`\`aer-plan
{"tasks":[{"title":"curto","instructions":"o que fazer, com critérios de aceite","kind":"code|test|docs|review|other","dependsOn":[1],"prefer":"<ia opcional>"}]}
\`\`\`
O ASES escolhe quem executa cada tarefa entre: ${others.length ? others.join(', ') : `${i.main} (só você está disponível)`}. Não use o bloco para conversa simples.

## Projeto
${i.project} · fases: ${i.phases.map((p) => `${p.id} ${p.state} ${p.title}`).join('; ') || 'nenhuma'}
Tarefas abertas: ${i.openTasks.map((t) => `${t.id} ${t.state} ${t.title}`).slice(0, 30).join('; ') || 'nenhuma'}
`;
  const tail = `\n## Mensagem do usuário\n${i.message.slice(0, Math.max(1000, budget - head.length - 200))}\n`;
  const room = budget - head.length - tail.length - 80;
  const lines = i.history.map((m) => `${m.role === 'user' ? 'você' : m.role === 'main' ? (m.provider ?? 'principal') : 'sistema'}: ${m.text}`);
  const kept: string[] = [];
  let used = 0;
  for (let k = lines.length - 1; k >= 0; k--) {
    const l = lines[k]!;
    if (used + l.length + 1 > room) break;
    kept.unshift(l);
    used += l.length + 1;
  }
  const cut = lines.length - kept.length;
  const history = `\n## Histórico\n${cut ? `[histórico anterior resumido: ${cut} mensagens omitidas]\n` : ''}${kept.join('\n')}\n`;
  return `${head}${history}${tail}`.slice(0, budget);
}

/** Um turno por vez por conversa: mensagens novas esperam na fila, na ordem (nunca duas sessões da mesma IA). */
export class ChatQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  private readonly runner: (message: string) => Promise<ChatTurnResult>;

  constructor(runner: (message: string) => Promise<ChatTurnResult>) {
    this.runner = runner;
  }

  get pending(): number {
    return this.waiting;
  }

  enqueue(message: string): Promise<ChatTurnResult> {
    this.waiting++;
    const next = this.chain.then(() => this.runner(message)).finally(() => {
      this.waiting--;
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
}

/** Executa um turno da principal e grava tudo como eventos. Erro do provider nunca vira texto de resposta. */
export async function runChatTurn(d: WorkerDeps, o: { conversationId: string; message: string; main: string; ready: string[]; signal: AbortSignal; limits?: Record<string, number>; preference?: string; onEvent?: (e: AgentStreamEvent) => void }): Promise<ChatTurnResult> {
  const read = d.read ?? d.mutate;
  const cnv = o.conversationId;
  const fail = (code: string, message: string): ChatTurnResult => {
    d.mutate((s) => s.appendEvent({ eventType: 'ChatTurnFailed', payload: { conversationId: cnv, code, message: redactText(message, 1000).text } }));
    return { ok: false, code, message };
  };
  const history = read((s) => s.listChatMessages(cnv));
  const n = d.mutate((s) => s.addChatMessage(cnv, { role: 'user', provider: null, text: o.message }));
  const provider = d.providers[o.main];
  if (!provider) return fail('PROVIDER_UNKNOWN', `IA principal desconhecida: ${o.main}`);
  // sem aceite explícito nada roda, nem o probe: a conta (cota/cobrança) é do usuário (AER-REQ-123)
  if (provider.requiresConsent && !d.consented?.has(provider.id)) return fail('CONSENT_REQUIRED', `autorize o uso da sua conta ${provider.id}: /config consentir ${provider.id}`);

  const ref = `refs/ases/restore/${cnv}/${n}`;
  // sem Git não há ponto de restauração: o chat funciona, só o /desfazer fica indisponível
  const inRepo = await repoRoot(d.root).then(() => true, () => false);
  const point = inRepo ? await createRestorePoint(d.root, ref) : undefined;
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'aer-chat-'));
  const instructionsFile = path.join(tmp, `${cnv}-${n}.md`);
  writeFileSync(instructionsFile, buildMainPrompt({
    project: path.basename(d.root), phases: read((s) => s.listPhases()), openTasks: read((s) => s.listTasks().filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.state))),
    ready: o.ready, main: o.main, history, message: o.message,
  }));
  const texts: string[] = [];
  let error: string | undefined;
  let violation: string | undefined;
  let exit: Extract<AgentStreamEvent, { type: 'exit' }> | undefined;
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  o.signal.addEventListener('abort', onAbort, { once: true });
  try {
    const preference = o.preference ?? (provider.id.startsWith('simulator') ? 'chat' : undefined);
    for await (const e of provider.start({
      taskId: 'TAR-0000', attemptId: `CHT-${String(n).padStart(4, '0')}`, workingDirectory: d.root, instructionsFile, allowedPaths: ['.'], deniedPaths: DENIED_PATHS, mode: 'WORKTREE_WRITE',
      approvedToolPolicyId: 'chat-main', timeoutMs: d.timeoutMs, signal: ac.signal, ...(preference ? { modelPreference: preference } : {}),
    })) {
      o.onEvent?.(e);
      if (e.type === 'message' && e.visibleToUser) texts.push(e.text);
      else if (e.type === 'file_change') {
        let bad = isDenied(e.relativePath) ? `caminho protegido: ${e.relativePath}` : undefined;
        if (!bad) {
          try {
            resolveInside(d.root, e.relativePath);
          } catch (err) {
            bad = (err as Error).message;
          }
        }
        if (bad) {
          violation = bad;
          d.mutate((s) => s.appendEvent({ eventType: 'SecurityViolationBlocked', payload: { rule: 'CHAT_PATH_DENIED', path: redactText(e.relativePath, 300).text, detail: bad } }));
          ac.abort();
        }
      } else if (e.type === 'error') error = `${e.code}: ${e.userMessage}`;
      else if (e.type === 'exit') exit = e;
    }
  } finally {
    o.signal.removeEventListener('abort', onAbort);
    rmSync(tmp, { recursive: true, force: true });
  }
  const touched = point ? (await markTurnEnd(d.root, ref)).touched : [];
  const restore = point && touched.length ? { n: d.mutate((s) => s.addRestorePoint(cnv, { ref, commit: point.commit, files: touched })), files: touched } : undefined;
  if (violation) return fail('SECURITY_VIOLATION', `${violation}${restore ? ' (use /desfazer para voltar as edições)' : ''}`);
  if (error) return fail(error.split(':')[0]!, error);
  if (exit?.exitCode !== 0) return fail('NONZERO_EXIT', `a principal terminou com código ${exit?.exitCode ?? exit?.signal ?? '?'}`);
  const text = texts.join('\n').trim();
  if (!text) return fail('NO_REPLY', 'a principal não respondeu nada');

  const parsed = parseMainReply(text);
  d.mutate((s) => s.addChatMessage(cnv, { role: 'main', provider: provider.id, text: parsed.reply || text }));
  if (parsed.error) return { ok: true, reply: parsed.reply, planError: parsed.error, ...(restore ? { restore } : {}) };
  if (!parsed.plan) return { ok: true, reply: parsed.reply, ...(restore ? { restore } : {}) };
  const busy: Record<string, number> = {};
  for (const t of read((s) => s.listTasks())) if (t.provider && ['RESERVED', 'RUNNING'].includes(t.state)) busy[t.provider.split(':')[0]!] = (busy[t.provider.split(':')[0]!] ?? 0) + 1;
  const a = assignProviders(parsed.plan, { ready: o.ready, main: o.main, busy, limits: o.limits ?? {}, consented: d.consented ? new Set(d.consented) : new Set() });
  const planId = d.mutate((s) => s.proposePlan(cnv, a.tasks, a.reasons));
  return { ok: true, reply: parsed.reply, planId, ...(restore ? { restore } : {}) };
}
