import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createWorktree, git, isClean, removeWorktree } from '@aer/git-bridge';
import { redactText, runShort, type ProcessPlatform } from '@aer/provider-sdk';
import { nextAttemptBase } from './continuity.ts';
import type { WorkerDeps } from './worker.ts';

/**
 * Roda um comando de teste real (sem shell) numa worktree própria no último checkpoint da tarefa e registra o resultado
 * e o log. A política de aprovação fica com quem chama (`/test` pede EXEC_TESTS; o chat usa o comando autorizado).
 */
export async function runTestInWorktree(d: Pick<WorkerDeps, 'root' | 'mutate' | 'read'>, platform: ProcessPlatform, taskId: string, argv: string[]): Promise<{ exitCode: number; timedOut: boolean; log: string; output: string }> {
  const read = d.read ?? d.mutate;
  const attempts = read((s) => s.listAttempts(taskId));
  const { base, from } = await nextAttemptBase(d.root, attempts);
  const n = read((s) => s.listTestRuns(taskId)).length + 1;
  const wt = await createWorktree(d.root, taskId, `TST-${String(n).padStart(4, '0')}`, base);
  const startedAt = new Date().toISOString();
  const r = await runShort(platform, argv[0]!, argv.slice(1), { cwd: wt.path, timeoutMs: 10 * 60_000 });
  const endedAt = new Date().toISOString();
  if (!(await isClean(wt.path))) {
    await git(wt.path, ['checkout', '--', '.']).catch(() => undefined);
    await git(wt.path, ['clean', '-fdq']).catch(() => undefined);
  }
  await removeWorktree(d.root, wt.path).catch(() => undefined);
  await git(d.root, ['branch', '-D', wt.branch]).catch(() => undefined);
  const exitCode = r.exitCode ?? (r.timedOut ? 124 : 127);
  const output = redactText(`${r.stdout}\n${r.stderr}`, 64_000).text;
  const log = `$ ${argv.join(' ')}\n# commit ${base === 'HEAD' ? 'HEAD' : base.slice(0, 12)}${from ? ` (${from})` : ''} · ${startedAt} → ${endedAt} · exit ${exitCode}${r.timedOut ? ' (TIMEOUT)' : ''}\n\n${output}`;
  const rel = `.ases/evidence/${taskId}-test-${String(n).padStart(2, '0')}.log`;
  mkdirSync(path.join(d.root, '.ases', 'evidence'), { recursive: true });
  writeFileSync(path.join(d.root, rel), log);
  d.mutate((st) => {
    // contagens não são inventadas: o exit code é a verdade; total/passed ficam 0 quando o runner não é interpretado
    st.recordTestRun(taskId, { command: argv.join(' '), exitCode, total: 0, passed: 0, failed: exitCode === 0 ? 0 : 1, skipped: 0, environment: `${process.platform}-${process.arch} node ${process.version}`, startedAt, endedAt, ...(from ? { attemptId: from } : {}) });
    st.recordArtifact(taskId, { kind: 'LOG', relativePath: rel, sha256: createHash('sha256').update(log).digest('hex'), note: `test run ${n}: exit ${exitCode}` });
  });
  return { exitCode, timedOut: r.timedOut, log: rel, output };
}
