import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createWorktree, diffStat, git, isClean, removeWorktree } from '@aer/git-bridge';
import { StoreError } from '@aer/persistence';
import { redactText, type AgentStreamEvent } from '@aer/provider-sdk';
import { buildPromptPack, latestHandoff, nextAttemptBase } from './continuity.ts';
import { parseProviderSpec, type WorkerDeps } from './worker.ts';

export interface ReviewOutcome {
  reviewId: string;
  taskId: string;
  reviewer: string;
  verdict: 'APPROVED' | 'REJECTED' | 'UNCLEAR' | 'INVALID';
  reason: string;
  reportPath: string;
}

/**
 * Revisão independente (PHASE-11, AER-REQ-187): outro provider, que não escreveu nenhuma tentativa da tarefa, lê o último
 * checkpoint numa worktree própria em modo READ_ONLY e devolve um parecer. Não muda o estado da tarefa (a decisão é humana).
 * Se o revisor alterar qualquer arquivo, a revisão é INVALID e as alterações são descartadas (nunca entram na tarefa).
 */
export async function runReview(d: WorkerDeps, taskId: string, reviewerSpec: string, signal: AbortSignal): Promise<ReviewOutcome> {
  const read = d.read ?? d.mutate;
  const task = read((s) => s.getTask(taskId));
  if (!task) throw new StoreError('NOT_FOUND', `task ${taskId} not found`);
  if (task.state !== 'REVIEW') throw new StoreError('INVALID_TRANSITION', `${taskId} is ${task.state}; only tasks in REVIEW are reviewed`);
  const spec = parseProviderSpec(reviewerSpec);
  const provider = spec ? d.providers[spec.providerId] : undefined;
  if (!spec || !provider) throw new StoreError('INVALID_INPUT', `unknown reviewer provider ${reviewerSpec}`);
  const attempts = read((s) => s.listAttempts(taskId));
  const authors = new Set(attempts.map((a) => a.providerId));
  if (authors.has(spec.providerId)) throw new StoreError('INVALID_INPUT', `${spec.providerId} wrote attempts of ${taskId}; an independent review needs another provider (autores: ${[...authors].join(', ')})`);
  if (provider.requiresConsent && !d.consented?.has(provider.id)) throw new StoreError('INVALID_INPUT', `CONSENT_REQUIRED: /review ${taskId} ${provider.id} --consent`);
  const n = read((s) => s.listArtifacts(taskId).filter((a) => a.relativePath.startsWith('.ases/reviews/')).length) + 1;
  const reviewId = `REV-${String(n).padStart(4, '0')}`;
  const reportPath = `.ases/reviews/${taskId}-${reviewId}.md`;
  const { base, from } = await nextAttemptBase(d.root, attempts);
  const firstBase = attempts.find((a) => a.baseCommit)?.baseCommit;
  const wt = await createWorktree(d.root, taskId, reviewId, base);
  const stat = firstBase ? await diffStat(d.root, firstBase, wt.branch).catch(() => '') : '';
  const instructionsFile = path.join(d.root, '.ases', 'worktrees', `${taskId}-${reviewId}.instructions.md`);
  const requirements = read((s) => task.reqs.map((id) => s.getRequirement(id)).filter((r) => r !== undefined).map((r) => ({ id: r.id, title: r.title, acceptance: r.acceptance })));
  writeFileSync(instructionsFile, `${buildPromptPack({ task, requirements, handoff: read((s) => latestHandoff(d.root, s, taskId)), lessons: read((s) => s.activeLessons()) })}
## MODO REVISÃO (somente leitura)
Você é o revisor independente desta tarefa. NÃO altere, crie nem apague arquivos. Verifique se as alterações abaixo
atendem aos critérios de aceite e responda começando com APROVADO ou REPROVADO, seguido dos motivos.

Alterações acumuladas da tarefa:
\`\`\`
${stat.trim() || '(nenhuma)'}
\`\`\`
`);
  const messages: string[] = [];
  let error: string | undefined;
  let wrote = false;
  let exit: Extract<AgentStreamEvent, { type: 'exit' }> | undefined;
  try {
    for await (const e of provider.start({
      taskId, attemptId: reviewId, workingDirectory: wt.path, instructionsFile, allowedPaths: ['.'], deniedPaths: ['.git', '.ases'], mode: 'READ_ONLY',
      approvedToolPolicyId: 'review-read-only', timeoutMs: d.timeoutMs, signal, ...(spec.preference ? { modelPreference: spec.preference } : {}),
    })) {
      if (e.type === 'message' && e.visibleToUser) messages.push(redactText(e.text, 8000).text);
      if (e.type === 'file_change') wrote = true;
      if (e.type === 'error') error = `${e.code}: ${e.userMessage}`;
      if (e.type === 'exit') exit = e;
    }
  } finally {
    // o que o revisor escreveu nunca vai para a tarefa: confere no disco (não só nos eventos) e descarta
    if (!(await isClean(wt.path))) {
      wrote = true;
      await git(wt.path, ['checkout', '--', '.']).catch(() => undefined);
      await git(wt.path, ['clean', '-fdq']).catch(() => undefined);
    }
    await removeWorktree(d.root, wt.path).catch(() => undefined);
    await git(d.root, ['branch', '-D', wt.branch]).catch(() => undefined);
  }
  const text = messages.join('\n\n').trim();
  // veredito: a 1ª linha que começa com APROVADO/REPROVADO (o agente pode mandar mensagens antes do parecer)
  const said = /^\W*(?:SIMULATED:\s*)?(APROVADO|REPROVADO|APPROVED|REJECTED)\b/im.exec(text)?.[1]?.toUpperCase();
  const verdict: ReviewOutcome['verdict'] = wrote || error || exit?.exitCode !== 0 ? 'INVALID' : said === 'APROVADO' || said === 'APPROVED' ? 'APPROVED' : said ? 'REJECTED' : 'UNCLEAR';
  const reason = wrote ? 'REVIEWER_WROTE: o revisor alterou arquivos em modo somente leitura; alterações descartadas'
    : error ?? (exit?.exitCode !== 0 ? `exit ${exit?.exitCode ?? exit?.signal ?? '?'}` : verdict === 'UNCLEAR' ? 'parecer sem APROVADO/REPROVADO explícito' : 'parecer do revisor');
  const report = `# Revisão ${reviewId} de ${taskId}

- **Revisor:** ${reviewerSpec} (independente; autores: ${[...authors].join(', ') || '—'})
- **Commit revisado:** ${base === 'HEAD' ? 'HEAD do projeto' : base.slice(0, 12)}${from ? ` (ponta de ${from})` : ''}
- **Veredito:** ${verdict} — ${reason}
- A decisão final é humana; esta revisão não muda o estado da tarefa.

## Parecer
${text || '(sem texto)'}
`;
  mkdirSync(path.join(d.root, '.ases', 'reviews'), { recursive: true });
  writeFileSync(path.join(d.root, reportPath), report);
  const sha = createHash('sha256').update(report).digest('hex');
  d.mutate((s) => {
    s.recordArtifact(taskId, { kind: 'REPORT', relativePath: reportPath, sha256: sha, note: `${reviewId} ${verdict} by ${reviewerSpec}` });
    s.appendEvent({ eventType: 'TaskReviewRequested', phaseId: task.phaseId, taskId, payload: { reviewId, reviewer: reviewerSpec, verdict, reason, report: reportPath, reviewedCommit: base } });
  });
  return { reviewId, taskId, reviewer: reviewerSpec, verdict, reason, reportPath };
}
