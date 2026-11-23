import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { git } from '../src/index.ts';

export const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })));

/** Repositório Git temporário (caminho com espaço e acento) com um commit base e .ases/worktrees ignorado. */
export async function tempRepo(): Promise<string> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aer git ç '));
  dirs.push(dir);
  await git(dir, ['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', 'AER Test'], ['user.email', 'aer-test@example.invalid'], ['commit.gpgsign', 'false']]) await git(dir, ['config', k!, v!]);
  writeFileSync(path.join(dir, '.gitignore'), '.ases/worktrees/\n');
  writeFileSync(path.join(dir, 'app.txt'), 'linha 1\n');
  await git(dir, ['add', '.']);
  await git(dir, ['commit', '-q', '-m', 'base']);
  return dir;
}

