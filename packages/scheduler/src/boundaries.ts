import { git } from '@aer/git-bridge';

// PHASE-26 (boundaries do ESAA): cada tipo de tarefa só pode alterar o que lhe cabe. Docs não mexe em código,
// teste não mexe no código de produção e revisão não altera nada. code/other seguem livres dentro da worktree.

export type TaskKind = 'code' | 'test' | 'docs' | 'review' | 'other';

const DOCS = /(^|\/)(docs?|documentation)\/|\.(md|mdx|markdown|txt|rst|adoc)$|(^|\/)(README|CHANGELOG|LICENSE|NOTICE|CONTRIBUTING|AUTHORS)[^/]*$/i;
const TESTS = /(^|\/)(tests?|__tests__|spec|specs|e2e)\/|\.(test|spec)\.[^/]+$|_test\.[^/]+$|(^|\/)test_[^/]+\.py$/i;

export function boundaryViolations(kind: TaskKind, files: string[]): string[] {
  if (kind === 'review') return files;
  if (kind === 'docs') return files.filter((f) => !DOCS.test(f));
  if (kind === 'test') return files.filter((f) => !TESTS.test(f));
  return [];
}

/** Arquivos alterados pela tarefa: da base da primeira tentativa até a ponta da branch da última. */
export async function changedFiles(root: string, base: string, tip: string): Promise<string[]> {
  return (await git(root, ['diff', '--name-only', `${base}...${tip}`])).split('\n').map((l) => l.trim()).filter(Boolean);
}
