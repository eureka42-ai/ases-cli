import { execFile } from 'node:child_process';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export class GitError extends Error {
  readonly code: 'GIT_FAILED' | 'NOT_A_REPO' | 'DIRTY_TREE' | 'WRONG_BRANCH' | 'INVALID_ID' | 'PATH_ESCAPE' | 'NOT_CLEAN';
  readonly stderr: string;
  constructor(code: GitError['code'], message: string, stderr = '') {
    super(message);
    this.name = 'GitError';
    this.code = code;
    this.stderr = stderr;
  }
}

/** git oficial, argumentos em vetor e sem shell (§7.6, AER-REQ-109); nunca pede credencial interativa. */
export async function git(cwd: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await run('git', [...args], {
      cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    });
    return stdout.trimEnd();
  } catch (err) {
    const e = err as { stderr?: string; message: string; code?: unknown };
    throw new GitError('GIT_FAILED', `git ${args.join(' ')} failed: ${(e.stderr ?? e.message).trim()}`, e.stderr ?? '');
  }
}

export const headCommit = (cwd: string) => git(cwd, ['rev-parse', 'HEAD']);
export const currentBranch = (cwd: string) => git(cwd, ['symbolic-ref', '--short', 'HEAD']);
export async function repoRoot(cwd: string): Promise<string> {
  try {
    return realpathSync.native(await git(cwd, ['rev-parse', '--show-toplevel']));
  } catch {
    throw new GitError('NOT_A_REPO', `${cwd} is not inside a Git repository`);
  }
}

/** Limpo = nada modificado, nada staged e nenhum arquivo não rastreado (fora os ignorados). */
export async function isClean(cwd: string): Promise<boolean> {
  return (await git(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])) === '';
}

const TASK_RE = /^TAR-\d{4,}$/;
const ATT_RE = /^ATT-\d{4,}$/;

export interface Worktree {
  path: string;
  branch: string;
  baseCommit: string;
}

/** Worktree isolada por tarefa/attempt em .ases/worktrees, branch ases/TAR-XXXX/ATT-XXXX (AER-REQ-051/052/053). */
export async function createWorktree(root: string, taskId: string, attemptId: string, base = 'HEAD'): Promise<Worktree> {
  if (!TASK_RE.test(taskId) || !ATT_RE.test(attemptId)) throw new GitError('INVALID_ID', `invalid ids ${taskId}/${attemptId}`);
  const baseCommit = await git(root, ['rev-parse', '--verify', `${base}^{commit}`]);
  const branch = `ases/${taskId}/${attemptId}`;
  const wt = path.join(root, '.ases', 'worktrees', `${taskId}-${attemptId}`);
  await git(root, ['worktree', 'add', '-b', branch, wt, baseCommit]);
  return { path: realpathSync.native(wt), branch, baseCommit };
}

/** Remove a worktree só se estiver limpa; nunca --force (alterações não confirmadas ficam para o humano). */
export async function removeWorktree(root: string, wt: string): Promise<void> {
  if (existsSync(wt) && !(await isClean(wt))) throw new GitError('NOT_CLEAN', `worktree has uncommitted changes, refusing to remove: ${wt}`);
  await git(root, ['worktree', 'remove', wt]);
}

/**
 * Resolve um caminho relativo dentro da worktree recusando fuga por '..', caminho absoluto ou symlink que aponte
 * para fora, inclusive em componentes intermediários (AER-REQ-060/164).
 */
export function resolveInside(worktree: string, rel: string): string {
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new GitError('PATH_ESCAPE', `absolute path not allowed: ${rel}`);
  const root = realpathSync.native(worktree);
  const target = path.resolve(root, rel);
  const inside = (p: string) => p === root || p.startsWith(root + path.sep);
  if (!inside(target)) throw new GitError('PATH_ESCAPE', `path escapes worktree: ${rel}`);
  // o componente existente mais profundo, resolvido, também precisa estar dentro (symlink de diretório ou do próprio arquivo)
  let probe = target;
  while (!existsSync(probe) && probe !== root) probe = path.dirname(probe);
  const real = realpathSync.native(probe);
  if (!inside(real)) throw new GitError('PATH_ESCAPE', `path resolves outside worktree through a symlink: ${rel}`);
  if (probe === target && lstatSync(target).isSymbolicLink() && !inside(realpathSync.native(target))) {
    throw new GitError('PATH_ESCAPE', `symlink points outside worktree: ${rel}`);
  }
  return target;
}

export async function diffStat(root: string, base: string, branch: string): Promise<string> {
  return git(root, ['diff', '--stat', `${base}...${branch}`]);
}

export type MergeResult = { status: 'MERGED'; commit: string } | { status: 'CONFLICT'; files: string[] };

/**
 * Integra a branch no branch alvo do checkout principal (AER-REQ-055/057/059):
 * exige estar no alvo e com árvore limpa (nada do humano é tocado); conflito → `merge --abort` (seguro porque a árvore
 * estava limpa) e CONFLICT, sem auto-resolução. A serialização entre processos é feita por quem chama (lock no banco).
 */
export async function mergeBranch(root: string, branch: string, target: string, message: string): Promise<MergeResult> {
  if ((await currentBranch(root)) !== target) throw new GitError('WRONG_BRANCH', `main checkout is not on ${target}`);
  if (!(await isClean(root))) throw new GitError('DIRTY_TREE', 'main checkout has uncommitted changes; refusing to merge (human work is preserved)');
  try {
    await git(root, ['merge', '--no-ff', '--no-edit', '-m', message, branch]);
    return { status: 'MERGED', commit: await headCommit(root) };
  } catch (err) {
    const files = (await git(root, ['diff', '--name-only', '--diff-filter=U']).catch(() => '')).split('\n').filter(Boolean);
    if (!files.length) throw err;
    await git(root, ['merge', '--abort']);
    return { status: 'CONFLICT', files };
  }
}
