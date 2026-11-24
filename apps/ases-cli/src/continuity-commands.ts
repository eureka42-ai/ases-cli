import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createWorktree, git, isClean, removeWorktree } from '@aer/git-bridge';
import type { TaskState } from '@aer/contracts';
import { redactText, runShort } from '@aer/provider-sdk';
import { agentAuthor, checkpointLeftovers, nextAttemptBase, parseProviderSpec, recoverInterrupted, runReview, writeHandoff } from '@aer/scheduler';
import { evaluate, operationHash } from '@aer/security';
import type { Engine } from './engine.ts';

export const CONTINUITY_HELP = `Continuidade, métricas e revisão (PHASE-11):
  /handoff TAR-XXXX <provider[:pref]> <motivo>   troca o executor de uma tarefa parada; grava HANDOFF e a próxima
                                  tentativa parte do último checkpoint (nada se perde)
  /test TAR-XXXX <comando …>      roda um teste real (sem shell) no último checkpoint e registra exit/tempo; exige
                                  aprovação EXEC_TESTS do comando exato (/approval)
  /review TAR-XXXX <provider[:pref]> [--consent]  revisão independente, somente leitura, por outro provider
  /resume                         recupera tentativas interrompidas (lease vencido): checkpoint das sobras e volta a READY
  /usage [TAR-XXXX]               consumo por provider com a fonte; nunca soma providers diferentes
  /diff TAR-XXXX [ATT-XXXX]       diff da tentativa (padrão: a última com branch) contra a base; só leitura`;

export const CONTINUITY_COMMANDS = new Set(['/handoff', '/test', '/review', '/resume', '/usage', '/diff']);

/** Caminho para READY a partir de uma tarefa parada (máquina de estados §5.1). */
const TO_READY: Partial<Record<TaskState, TaskState[]>> = { REVIEW: ['REWORK', 'READY'], REWORK: ['READY'], FAILED: ['READY'], BLOCKED: ['READY'] };

function toReady(engine: Engine, taskId: string, reason: string): void {
  const t = engine.store.getTask(taskId)!;
  const path_ = TO_READY[t.state];
  if (!path_) throw Object.assign(new Error(`${taskId} está ${t.state}; handoff só de REVIEW, REWORK, FAILED ou BLOCKED`), { code: 'INVALID_TRANSITION' });
  for (const to of path_) engine.mutate((s) => s.transitionTask(taskId, to, s.getTask(taskId)!.version, reason));
}

async function handoff(engine: Engine, taskId: string, to: string, reason: string): Promise<string> {
  const s = engine.store;
  const task = s.getTask(taskId);
  if (!task) return `tarefa ${taskId} não encontrada`;
  const spec = parseProviderSpec(to);
  if (!spec || !(spec.providerId in engine.providers)) return `provider desconhecido: ${to}`;
  if (!reason.trim()) return 'informe o motivo do handoff';
  if (!TO_READY[task.state]) return `${taskId} está ${task.state}; handoff só de REVIEW, REWORK, FAILED ou BLOCKED`;
  const last = s.listAttempts(taskId).at(-1);
  // sobras não commitadas da tentativa anterior viram checkpoint de recuperação (marcado como não verificado)
  const recoveryCommit = last ? await checkpointLeftovers(last, agentAuthor(last.providerId)) : undefined;
  if (recoveryCommit && last) engine.mutate((st) => st.appendEvent({ eventType: 'GitCheckpointCreated', phaseId: task.phaseId, taskId, attemptId: last.id, payload: { branch: last.branch, commit: recoveryCommit, baseCommit: last.baseCommit, recovery: true } }));
  engine.mutate((st) => st.setTaskProvider(taskId, to));
  const h = await writeHandoff(engine.projectRoot, s, taskId, { from: task.provider, to, reason, recoveryCommit });
  engine.mutate((st) => {
    st.recordArtifact(taskId, { kind: 'REPORT', relativePath: h.path, sha256: h.sha256, note: `handoff ${task.provider ?? '—'} → ${to}` });
    st.appendEvent({ eventType: 'HandoffCreated', phaseId: task.phaseId, taskId, payload: { from: task.provider, to, reason, document: h.path, sha256: h.sha256 } });
  });
  toReady(engine, taskId, `handoff para ${to}: ${reason}`);
  const { base } = await nextAttemptBase(engine.projectRoot, s.listAttempts(taskId));
  return `${taskId}: ${task.provider ?? '—'} → ${to} · ${h.path} · próxima tentativa parte de ${base === 'HEAD' ? 'HEAD' : base.slice(0, 12)}${recoveryCommit ? ` (inclui checkpoint de recuperação ${recoveryCommit.slice(0, 12)})` : ''} · tarefa READY`;
}

async function resume(engine: Engine): Promise<string> {
  const out = await recoverInterrupted(engine.projectRoot, (fn) => engine.mutate(fn), agentAuthor);
  return out.length ? out.join('\n') : 'nada a recuperar';
}

async function testRun(engine: Engine, taskId: string, argv: string[]): Promise<string> {
  const s = engine.store;
  const task = s.getTask(taskId);
  if (!task) return `tarefa ${taskId} não encontrada`;
  if (!argv.length) return 'uso: /test TAR-XXXX <comando …>';
  const op = { scope: 'EXEC_TESTS', subject: taskId, detail: { argv } };
  const d = evaluate(op, { approvals: s.listApprovals(), taskId });
  if (d.decision === 'DENY') return `${taskId}: ${d.reason}`;
  if (d.decision === 'NEEDS_APPROVAL') {
    const a = engine.mutate((st) => st.requestApproval({ scope: 'EXEC_TESTS', subject: taskId, operationHash: operationHash(op), description: `rodar \`${argv.join(' ')}\` no checkpoint de ${taskId}`, taskId }));
    return `${a.id} ${a.state}: conceda com /approval grant ${a.id} <seu nome> e rode /test de novo`;
  }
  engine.mutate((st) => st.consumeApproval(d.approvalId!));
  const attempts = s.listAttempts(taskId);
  const { base, from } = await nextAttemptBase(engine.projectRoot, attempts);
  const n = s.listTestRuns(taskId).length + 1;
  const wt = await createWorktree(engine.projectRoot, taskId, `TST-${String(n).padStart(4, '0')}`, base);
  const startedAt = new Date().toISOString();
  const r = await runShort(engine.platform, argv[0]!, argv.slice(1), { cwd: wt.path, timeoutMs: 10 * 60_000 });
  const endedAt = new Date().toISOString();
  if (!(await isClean(wt.path))) {
    await git(wt.path, ['checkout', '--', '.']).catch(() => undefined);
    await git(wt.path, ['clean', '-fdq']).catch(() => undefined);
  }
  await removeWorktree(engine.projectRoot, wt.path).catch(() => undefined);
  await git(engine.projectRoot, ['branch', '-D', wt.branch]).catch(() => undefined);
  const exitCode = r.exitCode ?? (r.timedOut ? 124 : 127);
  const log = redactText(`$ ${argv.join(' ')}\n# commit ${base === 'HEAD' ? 'HEAD' : base.slice(0, 12)}${from ? ` (${from})` : ''} · ${startedAt} → ${endedAt} · exit ${exitCode}${r.timedOut ? ' (TIMEOUT)' : ''}\n\n${r.stdout}\n${r.stderr}`, 64_000).text;
  const rel = `.ases/evidence/${taskId}-test-${String(n).padStart(2, '0')}.log`;
  mkdirSync(path.join(engine.projectRoot, '.ases', 'evidence'), { recursive: true });
  writeFileSync(path.join(engine.projectRoot, rel), log);
  engine.mutate((st) => {
    // contagens não são inventadas: o exit code é a verdade; total/passed/failed ficam 0 quando o runner não é interpretado
    st.recordTestRun(taskId, { command: argv.join(' '), exitCode, total: 0, passed: 0, failed: exitCode === 0 ? 0 : 1, skipped: 0, environment: `${process.platform}-${process.arch} node ${process.version}`, startedAt, endedAt, ...(from ? { attemptId: from } : {}) });
    st.recordArtifact(taskId, { kind: 'LOG', relativePath: rel, sha256: createHash('sha256').update(log).digest('hex'), note: `test run ${n}: exit ${exitCode}` });
  });
  return `${taskId}: \`${argv.join(' ')}\` → exit ${exitCode}${r.timedOut ? ' (TIMEOUT)' : ''} · log ${rel}`;
}

/** Diff entre refs (base...branch): o git não toca a worktree nem o índice (AER-REQ-097). */
async function diff(engine: Engine, taskId: string, attemptId?: string): Promise<string> {
  const attempts = engine.store.listAttempts(taskId).filter((a) => a.branch && a.baseCommit);
  const a = attemptId ? attempts.find((x) => x.id === attemptId) : attempts.at(-1);
  if (!a) return `${taskId}: nenhuma tentativa${attemptId ? ` ${attemptId}` : ''} com branch`;
  const out = await git(engine.projectRoot, ['diff', '--no-color', '--no-ext-diff', '--no-textconv', `${a.baseCommit!}...${a.branch!}`]);
  return `${taskId} ${a.id} (${a.branch} desde ${a.baseCommit!.slice(0, 12)}):\n${out ? redactText(out, 64_000).text : '(sem alterações)'}`;
}

function usage(engine: Engine, taskId?: string): string {
  type Agg = { value: number; unit: string; sources: Set<string> };
  const by = new Map<string, Map<string, Agg>>();
  const attemptsBy = new Map<string, number>();
  let after = 0;
  for (;;) {
    const page = engine.store.eventsSince(after, 1000);
    if (!page.length) break;
    after = page.at(-1)!.seq;
    for (const e of page) {
      if (taskId && e.taskId !== taskId) continue;
      if (e.eventType === 'AttemptStarted') attemptsBy.set(String(e.payload.providerId), (attemptsBy.get(String(e.payload.providerId)) ?? 0) + 1);
      if (e.eventType !== 'ProviderUsageObserved') continue;
      const p = String(e.payload.providerId);
      const metric = String(e.payload.metric);
      const m = by.get(p) ?? new Map<string, Agg>();
      const a = m.get(metric) ?? { value: 0, unit: String(e.payload.unit), sources: new Set<string>() };
      if (typeof e.payload.value === 'number') a.value += e.payload.value;
      a.sources.add(String(e.payload.source));
      m.set(metric, a);
      by.set(p, m);
    }
  }
  const providers = [...new Set([...attemptsBy.keys(), ...by.keys()])].sort();
  if (!providers.length) return `nenhuma tentativa${taskId ? ` em ${taskId}` : ''}: sem dados de uso`;
  // cada provider à parte: tokens de providers diferentes não são uma reserva única (§8.3)
  return [`Uso${taskId ? ` de ${taskId}` : ''} por provider (só o que o cliente reportou; — = não disponível, não é zero):`, ...providers.flatMap((p) => {
    const m = by.get(p);
    const head = `  ${p} · ${attemptsBy.get(p) ?? 0} tentativa(s)`;
    if (!m) return [`${head} · tokens: —`];
    return [head, ...[...m.entries()].map(([metric, a]) => `    ${metric.padEnd(20)} ${String(a.value).padStart(10)} ${a.unit} · fonte: ${[...a.sources].join(', ')}`)];
  })].join('\n');
}

export function handleContinuity(engine: Engine, cmd: string, sub: string | undefined, rest: string[]): string | Promise<string> {
  switch (cmd) {
    case '/handoff': {
      const [to = '', ...why] = rest;
      if (!sub || !to) return 'uso: /handoff TAR-XXXX <provider[:pref]> <motivo>';
      return handoff(engine, sub, to, why.join(' '));
    }
    case '/test':
      if (!sub) return 'uso: /test TAR-XXXX <comando …>';
      return testRun(engine, sub, rest);
    case '/review': {
      const [reviewer = '', ...flags] = rest;
      if (!sub || !reviewer) return 'uso: /review TAR-XXXX <provider[:pref]> [--consent]';
      const base = parseProviderSpec(reviewer)?.providerId ?? reviewer;
      return runReview(engine.workerDeps(flags.includes('--consent') ? [base] : []), sub, reviewer, new AbortController().signal)
        .then((r) => `${r.reviewId} ${r.taskId}: ${r.verdict} (${r.reason}) · ${r.reportPath}`);
    }
    case '/resume':
      return resume(engine);
    case '/usage':
      return usage(engine, sub);
    case '/diff':
      if (!sub) return 'uso: /diff TAR-XXXX [ATT-XXXX]';
      return diff(engine, sub, rest[0]);
    default:
      return `comando desconhecido: ${cmd}`;
  }
}
