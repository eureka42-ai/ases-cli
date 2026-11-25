import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRestorePoint, markTurnEnd, repoRoot, resolveInside, turnDiff } from '@aer/git-bridge';
import type { ChatMessageRow, PhaseRow, TaskRow } from '@aer/persistence';
import { redactText, type AgentStreamEvent } from '@aer/provider-sdk';
import { assignProviders, parseMainReply } from './chat-plan.ts';
import { parseProviderSpec, type WorkerDeps } from './worker.ts';

// PHASE-18: um turno da IA principal. Ela lê e edita direto no projeto (com ponto de restauração antes) e, para
// trabalho grande, devolve um bloco aer-plan que o ASES distribui entre as outras IAs.

export type ChatTurnResult =
  | { ok: true; reply: string; planId?: string; planError?: string; restore?: { n: number; files: string[]; changes?: { file: string; added: number; removed: number; patch: string }[] } }
  | { ok: false; code: string; message: string };

const DENIED_PATHS = ['.git', '.ases', '.env', '.env.*', '*.pem', '*.key'];
/**
 * Caminho protegido, depois de normalizar (`./.git`, `a/../.git`, `.GIT` em macOS/Windows). Atenção: o CLI avisa o
 * `file_change` DEPOIS de escrever; isto detecta e interrompe o turno, não impede a primeira escrita.
 */
export function isDeniedPath(root: string, rel: string, platform: string = process.platform): boolean {
  const abs = resolveInside(root, rel);
  let norm = path.relative(realpathSync.native(root), abs).split(path.sep).join('/');
  if (platform === 'darwin' || platform === 'win32') norm = norm.toLowerCase();
  const parts = norm.split('/').filter(Boolean);
  const base = parts.at(-1) ?? '';
  return parts[0] === '.git' || parts[0] === '.ases' || /^\.env(\..*)?$/i.test(base) || /\.(pem|key)$/i.test(base);
}

/** Prompt do papel de principal: regras, IAs disponíveis, projeto, histórico (cortado do mais antigo) e a mensagem. */
export function buildMainPrompt(i: { project: string; phases: PhaseRow[]; openTasks: TaskRow[]; ready: string[]; main: string; history: ChatMessageRow[]; message: string; budgetChars?: number }): string {
  const budget = i.budgetChars ?? 24_000;
  const others = i.ready.filter((p) => p !== i.main);
  const phases = i.phases.slice(-10);
  const head0 = `# Você é a IA principal do ASES (Eureka42 · eureka42.org)
Converse com o usuário em português do Brasil. Você pode ler e editar os arquivos deste projeto, exceto .git, .ases e segredos (.env, chaves).
Para um pedido grande, que vale dividir entre outras IAs trabalhando em paralelo, termine a resposta com um bloco:
\`\`\`aer-plan
{"tasks":[{"title":"curto","instructions":"o que fazer, com critérios de aceite","kind":"code|test|docs|review|other","dependsOn":[1],"prefer":"<ia opcional>"}]}
\`\`\`
O ASES escolhe quem executa cada tarefa entre: ${others.length ? others.join(', ') : `${i.main} (só você está disponível)`}. Não use o bloco para conversa simples.

## Projeto
${i.project} · fases${i.phases.length > phases.length ? ` (últimas ${phases.length} de ${i.phases.length})` : ''}: ${phases.map((p) => `${p.id} ${p.state} ${p.title}`).join('; ') || 'nenhuma'}
Tarefas abertas: ${i.openTasks.map((t) => `${t.id} ${t.state} ${t.title}`).slice(0, 30).join('; ') || 'nenhuma'}
`;
  // o cabeçalho tem teto; a mensagem é reservada primeiro e, se for cortada, o corte é dito
  const head = head0.length > Math.floor(budget / 3) ? `${head0.slice(0, Math.floor(budget / 3) - 40)}\n[contexto do projeto cortado]\n` : head0;
  const roomForMessage = budget - head.length - 120;
  const cut = i.message.length > roomForMessage ? i.message.length - roomForMessage + 60 : 0;
  const message = cut ? `${i.message.slice(0, i.message.length - cut)}\n[mensagem cortada: ${cut} caracteres]` : i.message;
  const tail = `\n## Mensagem do usuário\n${message}\n`;
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
  const omitted = lines.length - kept.length;
  const history = `\n## Histórico\n${omitted ? `[histórico anterior resumido: ${omitted} mensagens omitidas]\n` : ''}${kept.join('\n')}\n`;
  return `${head}${history}${tail}`;
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
  // a principal pode vir como `ia:preferência` (modelo, ou cenário do simulador)
  const spec = parseProviderSpec(o.main);
  const provider = spec ? d.providers[spec.providerId] : undefined;
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
  if (o.signal.aborted) ac.abort(); // /parar antes de o provider começar (o evento já passou)
  try {
    const preference = o.preference ?? spec?.preference ?? (provider.id.startsWith('simulator') ? 'chat' : undefined);
    for await (const e of provider.start({
      taskId: 'TAR-0000', attemptId: `CHT-${String(n).padStart(4, '0')}`, workingDirectory: d.root, instructionsFile, allowedPaths: ['.'], deniedPaths: DENIED_PATHS, mode: 'WORKTREE_WRITE',
      approvedToolPolicyId: 'chat-main', timeoutMs: d.timeoutMs, signal: ac.signal, ...(preference ? { modelPreference: preference } : {}),
    })) {
      o.onEvent?.(e);
      // a ação da principal fica no histórico: o ases-tar mostra quem está fazendo o quê (PHASE-19)
      if (e.type === 'tool_call') d.mutate((s) => s.appendEvent({ eventType: 'ProviderToolCallObserved', payload: { providerId: provider.id, conversationId: cnv, name: e.name, arguments: redactText(JSON.stringify(e.safeArguments ?? null), 1000).text } }));
      if (e.type === 'file_change') d.mutate((s) => s.appendEvent({ eventType: 'ProviderToolResultObserved', payload: { providerId: provider.id, conversationId: cnv, name: 'file_change', success: true, summary: `${e.kind} ${redactText(e.relativePath, 300).text}` } }));
      if (e.type === 'message' && e.visibleToUser) texts.push(e.text);
      else if (e.type === 'file_change') {
        let bad: string | undefined;
        try {
          if (isDeniedPath(d.root, e.relativePath)) bad = `caminho protegido: ${e.relativePath}`;
        } catch (err) {
          bad = (err as Error).message;
        }
        if (bad) {
          violation = bad;
          d.mutate((s) => s.appendEvent({ eventType: 'SecurityViolationBlocked', payload: { rule: 'CHAT_PATH_DENIED', path: redactText(e.relativePath, 300).text, detail: bad } }));
          ac.abort();
        }
      } else if (e.type === 'error') error = `${e.code}: ${e.userMessage}`;
      else if (e.type === 'exit') exit = e;
    }
  } catch (err) {
    // adapter/processo quebrou no meio: ainda assim o que já foi editado ganha ponto de restauração (abaixo)
    error = `PROVIDER_ERROR: ${(err as Error).message}`;
  } finally {
    o.signal.removeEventListener('abort', onAbort);
    rmSync(tmp, { recursive: true, force: true });
  }
  const touched = point ? (await markTurnEnd(d.root, ref)).touched : [];
  const restore = point && touched.length
    ? { n: d.mutate((s) => s.addRestorePoint(cnv, { ref, commit: point.commit, files: touched })), files: touched, changes: await turnDiff(d.root, ref).catch(() => []) }
    : undefined;
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
