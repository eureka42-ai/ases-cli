import { canUse, type Compatibility } from '@aer/security';
import { buildPromptPack, latestHandoff, nextAttemptBase } from './continuity.ts';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { formatAttemptId, type TaskState } from '@aer/contracts';
import { GitError, commitAll, createWorktree, resolveInside } from '@aer/git-bridge';
import { StoreError, type ProjectStore } from '@aer/persistence';
import { BLOCKING_ERROR_CODES, redactText, type AgentProvider, type AgentStreamEvent } from '@aer/provider-sdk';

export interface WorkerDeps {
  root: string;
  /** toda escrita passa por aqui (no `ases`, Engine.mutate: confirma e publica para os monitores) */
  mutate: <T>(fn: (s: ProjectStore) => T) => T;
  /** leitura sem publicar (padrão: mutate) */
  read?: <T>(fn: (s: ProjectStore) => T) => T;
  providers: Readonly<Record<string, AgentProvider>>;
  ttlMs: number;
  timeoutMs: number;
  /** providers reais que o usuário autorizou NESTE run (AER-REQ-123); o simulador não precisa */
  consented?: ReadonlySet<string>;
  /** pausa do provider após RATE_LIMITED (padrão 15 min) */
  rateLimitCooldownMs?: number;
}

// shortcut: cooldown fixo; usar o resetsAt do provider quando algum adapter o reportar de forma verificada
export const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 15 * 60_000;

export interface AttemptOutcome {
  taskId: string;
  attemptId: string | null;
  providerId: string | null;
  simulated: boolean;
  /** estado da tarefa ao fim do worker */
  state: TaskState;
  reason: string;
}

/** `simulator:hang` → provider `simulator`, preferência `hang` (no simulador, o cenário). */
export function parseProviderSpec(spec: string | null): { providerId: string; preference?: string } | undefined {
  const m = spec ? /^([a-z][a-z0-9-]*)(?::([a-z0-9][a-z0-9.-]*))?$/.exec(spec) : null;
  if (!m) return undefined;
  return m[2] ? { providerId: m[1]!, preference: m[2] } : { providerId: m[1]! };
}

export const agentAuthor = (providerId: string) => ({ name: `AER agent (${providerId})`, email: `${providerId}@aer.invalid` });
const isBlocking = (code: string) => (BLOCKING_ERROR_CODES as readonly string[]).includes(code);

/**
 * Executa UMA tentativa de uma tarefa já reservada (lease + fencing token): worktree própria, provider, eventos
 * normalizados, heartbeat, timeout/cancelamento com reconciliação da árvore de processos e destino honesto da tarefa:
 * só saída 0, stream válido, árvore encerrada e nenhuma violação levam a REVIEW (AER-REQ-105/106; §21.2).
 */
export async function runAttempt(d: WorkerDeps, r: { taskId: string; fencingToken: number }, signal: AbortSignal): Promise<AttemptOutcome> {
  const { taskId, fencingToken } = r;
  const read = d.read ?? d.mutate;
  const task = read((s) => s.getTask(taskId));
  if (!task) throw new StoreError('NOT_FOUND', `task ${taskId} not found`);
  const phaseId = task.phaseId;
  const out = (state: TaskState, reason: string, x: Partial<AttemptOutcome> = {}): AttemptOutcome => ({ taskId, attemptId: null, providerId: null, simulated: false, state, reason, ...x });
  const move = (to: TaskState, reason: string) => d.mutate((s) => s.transitionTaskFenced(taskId, to, fencingToken, reason));

  if (signal.aborted) {
    move('READY', 'cancelado antes de iniciar; reserva liberada');
    return out('READY', 'cancelled before start');
  }
  const spec = parseProviderSpec(task.provider);
  const provider = spec ? d.providers[spec.providerId] : undefined;
  if (!spec || !provider) {
    const why = task.provider ? `PROVIDER_UNKNOWN: ${task.provider}` : 'PROVIDER_NOT_SET: defina --provider na tarefa';
    move('BLOCKED', why);
    return out('BLOCKED', why);
  }
  // extensões da tarefa: só VERIFIED e compatíveis com este provider; CLAUDE_ONLY nunca roda em outro (AER-REQ-140, §9.1)
  for (const extId of task.extensions) {
    const ext = read((s) => s.getExtension(extId));
    const why = !ext ? `EXTENSION_NOT_FOUND: ${extId}`
      : ext.state !== 'VERIFIED' ? `EXTENSION_NOT_VERIFIED: ${extId} (${ext.name}) está ${ext.state}`
        : (() => {
          const c = canUse(ext.compatibility as Record<string, Compatibility>, spec.providerId);
          return c.ok ? null : `EXTENSION_INCOMPATIBLE: ${extId} (${ext.name}) ${c.reason}`;
        })();
    if (why) {
      move('BLOCKED', why);
      return out('BLOCKED', why, { providerId: provider.id });
    }
  }
  // rate limit recente: nem probe nem processo até o fim do cooldown, então não há laço de 429 (AER-REQ-048)
  const until = read((s) => s.providerCooldownUntil(provider.id, d.rateLimitCooldownMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS));
  if (until) {
    const why = `PROVIDER_COOLDOWN: ${provider.id} teve RATE_LIMITED; novas tentativas só após ${until}`;
    move('BLOCKED', why);
    return out('BLOCKED', why, { providerId: provider.id });
  }
  if (provider.requiresConsent && !d.consented?.has(provider.id)) {
    // sem aceite explícito nada roda, nem o probe: a conta (cota/cobrança) é do usuário (AER-REQ-123)
    const why = `CONSENT_REQUIRED: rode /run --consent ${provider.id} para autorizar o uso da sua conta ${provider.id}`;
    move('BLOCKED', why);
    return out('BLOCKED', why, { providerId: provider.id });
  }
  const probe = await provider.probe();
  const simulated = probe.simulated;
  const base = { providerId: provider.id, simulated };
  if (probe.availability !== 'READY') {
    // AER-REQ-108: provider indisponível bloqueia a tarefa, o AER continua de pé
    d.mutate((s) => s.appendEvent({ eventType: 'ProviderUnavailable', phaseId, taskId, payload: { providerId: provider.id, availability: probe.availability, evidence: probe.evidence, simulated } }));
    move('BLOCKED', probe.availability);
    return out('BLOCKED', probe.availability, base);
  }
  d.mutate((s) => s.appendEvent({ eventType: 'ProviderDetected', phaseId, taskId, payload: { providerId: provider.id, version: probe.version ?? null, contractVersion: probe.contractVersion, contractStatus: probe.contractStatus, simulated, label: simulated ? 'SIMULATED' : null } }));

  // o próximo id de tentativa é previsível porque só quem tem o lease cria tentativas desta tarefa
  const expectedAttempt = formatAttemptId(read((s) => s.listAttempts(taskId)).length + 1);
  let wt;
  try {
    // continuidade (PHASE-11): parte do último checkpoint da tarefa, não do main, para trocar de provider sem perder arquivos
    const { base: baseRef } = await nextAttemptBase(d.root, read((s) => s.listAttempts(taskId)));
    wt = await createWorktree(d.root, taskId, expectedAttempt, baseRef);
  } catch (err) {
    const why = `WORKTREE_FAILED: ${(err as Error).message.slice(0, 300)}`;
    move('BLOCKED', why);
    return out('BLOCKED', why, base);
  }
  const attemptId = d.mutate((s) => s.startAttempt(taskId, fencingToken, { providerId: provider.id, worktreePath: wt.path, branch: wt.branch, baseCommit: wt.baseCommit }));
  const ev = (eventType: Parameters<ProjectStore['appendEvent']>[0]['eventType'], payload: Record<string, unknown>) =>
    d.mutate((s) => s.appendEvent({ eventType, phaseId, taskId, attemptId, payload: { ...base, ...payload } }));
  const end = (state: 'EXITED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN', exitCode: number | null, failureCode: string | null) => d.mutate((s) => s.endAttempt(taskId, attemptId, { state, exitCode, failureCode }));

  if (attemptId !== expectedAttempt) {
    // defensivo: a worktree foi criada com outro id; não roda nada nela
    end('UNKNOWN', null, 'ATTEMPT_ID_MISMATCH');
    return fin('BLOCKED', `ATTEMPT_ID_MISMATCH: ${attemptId} != ${expectedAttempt} (worktree ${wt.path})`);
  }
  const instructionsFile = path.join(d.root, '.ases', 'worktrees', `${taskId}-${attemptId}.instructions.md`);
  // pacote de contexto: só a tarefa, os requisitos dela e o último handoff, dentro do orçamento (AER-REQ-177/179)
  const requirements = read((s) => task.reqs.map((id) => s.getRequirement(id)).filter((r) => r !== undefined).map((r) => ({ id: r.id, title: r.title, acceptance: r.acceptance })));
  writeFileSync(instructionsFile, buildPromptPack({ task, requirements, handoff: read((s) => latestHandoff(d.root, s, taskId)) }));

  const ac = new AbortController();
  const onCancel = () => ac.abort();
  signal.addEventListener('abort', onCancel, { once: true });
  let lostLease = false;
  const hb = setInterval(() => {
    try {
      d.mutate((s) => s.heartbeat(taskId, fencingToken, d.ttlMs));
    } catch {
      lostLease = true; // token velho: para o agente; nunca publica conclusão tardia (AER-REQ-046)
      ac.abort();
    }
  }, Math.max(50, Math.floor(d.ttlMs / 3)));

  let exit: Extract<AgentStreamEvent, { type: 'exit' }> | undefined;
  let lastError: string | undefined;
  let parseError = false;
  let violation: string | undefined;
  let approval: string | undefined;
  let usageSeen = false;
  try {
    move('RUNNING', `${provider.id}${simulated ? ' (SIMULATED)' : ''} ${attemptId}`);
    ev('TaskStarted', { attemptId, worktree: path.relative(d.root, wt.path).split(path.sep).join('/'), branch: wt.branch });
    const stream = provider.start({
      taskId, attemptId, workingDirectory: wt.path, instructionsFile, allowedPaths: ['.'], deniedPaths: ['.git', '.ases'], mode: 'WORKTREE_WRITE',
      approvedToolPolicyId: 'default-deny', timeoutMs: d.timeoutMs, signal: ac.signal, ...(spec.preference ? { modelPreference: spec.preference } : {}),
    });
    for await (const e of stream) {
      switch (e.type) {
        case 'message':
        case 'status': {
          const t = redactText(e.type === 'message' ? e.text : `${e.status}${e.detail ? ` ${e.detail}` : ''}`);
          ev('ProviderOutputChunk', { kind: e.type, text: t.text, redacted: t.redacted, truncated: t.truncated, visibleToUser: e.type === 'message' ? e.visibleToUser : false });
          break;
        }
        case 'tool_call':
          ev('ProviderToolCallObserved', { name: e.name, arguments: redactText(JSON.stringify(e.safeArguments ?? null), 1000).text });
          break;
        case 'tool_result':
          ev('ProviderToolResultObserved', { name: e.name, success: e.success, summary: redactText(e.safeSummary, 1000).text });
          break;
        case 'file_change':
          try {
            resolveInside(wt.path, e.relativePath);
            if (/^(\.git|\.ases)(\/|\\|$)/.test(e.relativePath)) throw new GitError('PATH_ESCAPE', `denied path: ${e.relativePath}`);
            ev('ProviderToolResultObserved', { name: 'file_change', success: true, summary: `${e.kind} ${e.relativePath}` });
          } catch (err) {
            violation = (err as Error).message;
            ev('SecurityViolationBlocked', { rule: 'PATH_ESCAPE', path: redactText(e.relativePath, 300).text, detail: violation });
            ac.abort();
          }
          break;
        case 'usage':
          usageSeen = true;
          ev('ProviderUsageObserved', { metric: e.metric, value: e.value, unit: e.unit, source: e.source });
          break;
        case 'approval_request':
          // shortcut: sem canal de aprovação nesta fase; a operação fica BLOCKED até /approval (PHASE-10)
          approval = e.description;
          ev('ApprovalRequested', { operationHash: e.operationHash, description: redactText(e.description, 1000).text });
          ac.abort();
          break;
        case 'error':
          if (e.code === 'PARSE_ERROR') parseError = true;
          else if (!lastError || isBlocking(e.code)) lastError = e.code;
          ev('ProviderOutputChunk', { kind: 'error', code: e.code, text: redactText(e.userMessage, 1000).text, redacted: false, truncated: false, visibleToUser: true });
          break;
        case 'exit':
          exit = e;
          break;
      }
    }
    if (!usageSeen) for (const u of (await provider.getUsage?.()) ?? []) ev('ProviderUsageObserved', { metric: u.metric, value: u.value, unit: u.unit, source: u.source });

    const code = exit?.exitCode ?? null;
    if (!exit?.reconciled) {
      end('UNKNOWN', code, 'PROCESS_TREE_NOT_RECONCILED');
      return fin('BLOCKED', 'PROCESS_TREE_NOT_RECONCILED: processos do agente podem continuar vivos; verifique antes de repetir');
    }
    if (lostLease) {
      end('UNKNOWN', code, 'LEASE_LOST');
      return out(read((s) => s.getTask(taskId))!.state, 'LEASE_LOST', { ...base, attemptId });
    }
    if (violation) {
      end('FAILED', code, 'SECURITY_VIOLATION');
      return fin('FAILED', `SECURITY_VIOLATION: ${violation}`);
    }
    if (approval) {
      end('CANCELLED', code, 'APPROVAL_REQUIRED');
      return fin('BLOCKED', `APPROVAL_REQUIRED: ${approval}`);
    }
    if (signal.aborted) {
      end('CANCELLED', code, 'CANCELLED_BY_USER');
      move('CANCEL_REQUESTED', 'cancelado pelo usuário');
      const v = read((s) => s.getTask(taskId))!.version;
      d.mutate((s) => s.transitionTask(taskId, 'CANCELLED', v, 'árvore de processos encerrada e confirmada'));
      return out('CANCELLED', 'cancelled by user', { ...base, attemptId });
    }
    if (lastError && isBlocking(lastError)) {
      end('FAILED', code, lastError);
      return fin('BLOCKED', lastError); // AUTH_EXPIRED ≠ RATE_LIMITED: o motivo é o código do provider (AER-REQ-107)
    }
    if (lastError === 'TIMEOUT') {
      end('FAILED', code, 'TIMEOUT');
      return fin('FAILED', `TIMEOUT após ${d.timeoutMs} ms; árvore de processos encerrada`);
    }
    if (parseError) {
      end('UNKNOWN', code, 'PARSE_ERROR');
      return fin('FAILED', 'PARSE_ERROR: saída do agente fora do contrato; não é tratada como sucesso');
    }
    if (code !== 0 || lastError) {
      end('FAILED', code, lastError ?? 'NONZERO_EXIT');
      return fin('FAILED', `${lastError ?? 'NONZERO_EXIT'} (exit ${code ?? exit?.signal ?? '?'})`);
    }
    const commit = await commitAll(wt.path, `${taskId} ${attemptId}: ${task.title}${simulated ? ' [SIMULATED]' : ''}`, agentAuthor(provider.id));
    if (commit) ev('GitCheckpointCreated', { branch: wt.branch, commit, baseCommit: wt.baseCommit });
    end('EXITED', 0, null);
    move('VERIFYING', `exit 0${commit ? `, checkpoint ${commit.slice(0, 12)}` : ', sem alterações'}`);
    return fin('REVIEW', `aguarda revisão humana${simulated ? ' (saída SIMULATED)' : ''}`);
  } catch (err) {
    // falha do próprio worker: a tentativa nunca fica RUNNING nem vira sucesso
    try {
      end('UNKNOWN', exit?.exitCode ?? null, 'WORKER_ERROR');
    } catch {
      // tentativa já encerrada
    }
    try {
      move('FAILED', `WORKER_ERROR: ${(err as Error).message.slice(0, 300)}`);
    } catch {
      // lease perdido: o expireLeases do scheduler leva a tarefa a BLOCKED
    }
    return out(read((s) => s.getTask(taskId))!.state, `WORKER_ERROR: ${(err as Error).message}`, { ...base, attemptId });
  } finally {
    clearInterval(hb);
    signal.removeEventListener('abort', onCancel);
  }

  function fin(state: TaskState, reason: string): AttemptOutcome {
    move(state, reason);
    return out(state, reason, { ...base, attemptId });
  }
}
