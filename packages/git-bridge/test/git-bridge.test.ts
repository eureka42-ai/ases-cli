import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GitError, createRestorePoint, createWorktree, currentBranch, markTurnEnd, restoreFromPoint, turnDiff, git, isClean, mergeBranch, removeWorktree, resolveInside } from '../src/index.ts';
import { dirs, tempRepo } from './helpers.ts';

async function commitIn(wt: string, file: string, content: string) {
  writeFileSync(path.join(wt, file), content);
  await git(wt, ['add', file]);
  await git(wt, ['commit', '-q', '-m', `edit ${file}`]);
}

describe('worktrees (TAR-0023, AER-REQ-051/052/053)', () => {
  it('two attempts get isolated worktrees with named branches and recorded base', async () => {
    const root = await tempRepo();
    const a = await createWorktree(root, 'TAR-0001', 'ATT-0001');
    const b = await createWorktree(root, 'TAR-0002', 'ATT-0001');
    expect(a.branch).toBe('ases/TAR-0001/ATT-0001');
    expect(a.baseCommit).toBe(await git(root, ['rev-parse', 'HEAD']));
    writeFileSync(path.join(a.path, 'a.txt'), 'A');
    writeFileSync(path.join(b.path, 'b.txt'), 'B');
    expect(await isClean(root)).toBe(true); // nada vaza para o checkout principal
    expect(await isClean(a.path)).toBe(false);
    await expect(removeWorktree(root, a.path)).rejects.toMatchObject({ code: 'NOT_CLEAN' });
    rmSync(path.join(b.path, 'b.txt'));
    await removeWorktree(root, b.path);
  });

  it('rejects ids that could inject into branch names or paths', async () => {
    const root = await tempRepo();
    await expect(createWorktree(root, 'TAR-0001; rm -rf /', 'ATT-0001')).rejects.toMatchObject({ code: 'INVALID_ID' });
    await expect(createWorktree(root, 'TAR-0001', '../ATT')).rejects.toMatchObject({ code: 'INVALID_ID' });
  });
});

describe('path safety (AER-REQ-060, AER-REQ-164)', () => {
  it('allows paths inside and blocks .., absolute and symlink escapes', async () => {
    const root = await tempRepo();
    const wt = await createWorktree(root, 'TAR-0003', 'ATT-0001');
    expect(resolveInside(wt.path, 'src/novo.ts')).toBe(path.join(wt.path, 'src', 'novo.ts'));
    for (const bad of ['../fora.txt', 'src/../../fora.txt', path.join(os.tmpdir(), 'x'), 'C:\\Windows\\x']) {
      expect(() => resolveInside(wt.path, bad), bad).toThrow(GitError);
    }
    if (process.platform !== 'win32') {
      const outside = mkdtempSync(path.join(os.tmpdir(), 'aer-outside-'));
      dirs.push(outside);
      symlinkSync(outside, path.join(wt.path, 'link-dir'));
      symlinkSync(path.join(outside, 'f'), path.join(wt.path, 'link-file'));
      expect(() => resolveInside(wt.path, 'link-dir/x.txt')).toThrow(/symlink/);
      expect(() => resolveInside(wt.path, 'link-file')).toThrow(/symlink/); // symlink quebrado para fora
      writeFileSync(path.join(outside, 'existe'), 'x');
      symlinkSync(path.join(outside, 'existe'), path.join(wt.path, 'link-ok-target'));
      expect(() => resolveInside(wt.path, 'link-ok-target')).toThrow(/symlink/);
      symlinkSync('real', path.join(wt.path, 'link-interno'));
      mkdirSync(path.join(wt.path, 'real'));
      expect(resolveInside(wt.path, 'real/ok.txt')).toBe(path.join(wt.path, 'real', 'ok.txt'));
      expect(resolveInside(wt.path, 'link-interno/ok.txt')).toBe(path.join(wt.path, 'link-interno', 'ok.txt')); // link que fica dentro é permitido
    }
  });
});

describe('merge (TAR-0024, AER-REQ-055/057)', () => {
  it('merges a clean branch with --no-ff', async () => {
    const root = await tempRepo();
    const wt = await createWorktree(root, 'TAR-0004', 'ATT-0001');
    await commitIn(wt.path, 'novo.txt', 'ok\n');
    const r = await mergeBranch(root, wt.branch, 'main', 'TAR-0004: novo');
    expect(r.status).toBe('MERGED');
    expect(readFileSync(path.join(root, 'novo.txt'), 'utf8')).toBe('ok\n');
    expect(await git(root, ['log', '-1', '--format=%s'])).toBe('TAR-0004: novo');
  });

  it('conflict ends in CONFLICT, aborts cleanly and never auto-resolves', async () => {
    const root = await tempRepo();
    const a = await createWorktree(root, 'TAR-0005', 'ATT-0001');
    const b = await createWorktree(root, 'TAR-0006', 'ATT-0001');
    await commitIn(a.path, 'app.txt', 'versão A\n');
    await commitIn(b.path, 'app.txt', 'versão B\n');
    expect((await mergeBranch(root, a.branch, 'main', 'A')).status).toBe('MERGED');
    const head = await git(root, ['rev-parse', 'HEAD']);
    expect(await mergeBranch(root, b.branch, 'main', 'B')).toEqual({ status: 'CONFLICT', files: ['app.txt'] });
    expect(await git(root, ['rev-parse', 'HEAD'])).toBe(head);
    expect(await isClean(root)).toBe(true);
    expect(readFileSync(path.join(root, 'app.txt'), 'utf8')).toBe('versão A\n');
  });

  it('refuses to merge over uncommitted human work and keeps its bytes (AER-REQ-055)', async () => {
    const root = await tempRepo();
    const wt = await createWorktree(root, 'TAR-0007', 'ATT-0001');
    await commitIn(wt.path, 'novo.txt', 'agente\n');
    writeFileSync(path.join(root, 'app.txt'), 'edição humana não commitada\n');
    writeFileSync(path.join(root, 'rascunho.md'), 'notas\n');
    await expect(mergeBranch(root, wt.branch, 'main', 'x')).rejects.toMatchObject({ code: 'DIRTY_TREE' });
    expect(readFileSync(path.join(root, 'app.txt'), 'utf8')).toBe('edição humana não commitada\n');
    expect(readFileSync(path.join(root, 'rascunho.md'), 'utf8')).toBe('notas\n');
    await git(root, ['switch', '-q', '-c', 'outro']);
    await git(root, ['stash', 'push', '-q', '-u', '-m', 'aer-test']); // limpa só para testar o branch errado
    await expect(mergeBranch(root, wt.branch, 'main', 'x')).rejects.toMatchObject({ code: 'WRONG_BRANCH' });
    expect(await currentBranch(root)).toBe('outro');
  });
});

describe('concurrent worktrees (CI run 45460214446)', () => {
  it('eight createWorktree calls at once on one repo all succeed, then all are removed', async () => {
    const root = await tempRepo();
    const ids = Array.from({ length: 8 }, (_, i) => `TAR-${String(i + 1).padStart(4, '0')}`);
    const wts = await Promise.all(ids.map((t) => createWorktree(root, t, 'ATT-0001')));
    expect(new Set(wts.map((w) => w.path)).size).toBe(8);
    await Promise.all(wts.map((w) => removeWorktree(root, w.path)));
    expect((await git(root, ['worktree', 'list'])).split('\n')).toHaveLength(1);
  });
});

describe('restore points and undo (PHASE-18, TAR-0083)', () => {
  const ref = 'refs/ases/restore/CNV-0001/1';
  it('restore point does not touch index, HEAD or branch', async () => {
    const root = await tempRepo();
    writeFileSync(path.join(root, 'staged.txt'), 'staged\n');
    await git(root, ['add', 'staged.txt']);
    writeFileSync(path.join(root, 'app.txt'), 'linha 1\nmodificada\n');
    const before = [await git(root, ['status', '--porcelain=v1']), await git(root, ['rev-parse', 'HEAD']), await currentBranch(root)];
    const rp = await createRestorePoint(root, ref);
    expect(rp.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(rp.files.sort()).toEqual(['app.txt', 'staged.txt']);
    expect([await git(root, ['status', '--porcelain=v1']), await git(root, ['rev-parse', 'HEAD']), await currentBranch(root)]).toEqual(before);
    expect(await git(root, ['rev-parse', ref])).toBe(rp.commit);
  });
  it('undo restores edits and deletes files created by the turn', async () => {
    const root = await tempRepo();
    writeFileSync(path.join(root, 'notes.txt'), 'do usuário\n'); // não rastreado, anterior ao turno
    await createRestorePoint(root, ref);
    writeFileSync(path.join(root, 'app.txt'), 'reescrito pela IA\n');
    writeFileSync(path.join(root, 'novo.txt'), 'criado pela IA\n');
    const { touched } = await markTurnEnd(root, ref);
    expect(touched.sort()).toEqual(['app.txt', 'novo.txt']);
    const r = await restoreFromPoint(root, ref, touched);
    expect(r).toEqual({ restored: ['app.txt', 'novo.txt'] });
    expect(readFileSync(path.join(root, 'app.txt'), 'utf8')).toBe('linha 1\n');
    expect(existsSync(path.join(root, 'novo.txt'))).toBe(false);
    expect(readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('do usuário\n');
  });
  it('undo refuses when the user edited a file after the turn', async () => {
    const root = await tempRepo();
    await createRestorePoint(root, ref);
    writeFileSync(path.join(root, 'app.txt'), 'pela IA\n');
    const { touched } = await markTurnEnd(root, ref);
    writeFileSync(path.join(root, 'app.txt'), 'o usuário mexeu depois\n');
    expect(await restoreFromPoint(root, ref, touched)).toEqual({ refused: ['app.txt'] });
    expect(readFileSync(path.join(root, 'app.txt'), 'utf8')).toBe('o usuário mexeu depois\n');
  });
  it('untracked files are captured; ignored files are not', async () => {
    const root = await tempRepo();
    writeFileSync(path.join(root, '.gitignore'), '.ases/worktrees/\nsegredo.env\n');
    writeFileSync(path.join(root, 'segredo.env'), 'X=1\n');
    writeFileSync(path.join(root, 'solto.txt'), 'solto\n');
    const rp = await createRestorePoint(root, ref);
    expect(rp.files).toContain('solto.txt');
    expect(rp.files).not.toContain('segredo.env');
    expect(await git(root, ['ls-tree', '-r', '--name-only', ref])).not.toContain('segredo.env');
  });
});

describe('merge with engine files pending (PHASE-18)', () => {
  it('engine-owned .ases changes do not block a merge; user changes still do', async () => {
    const root = await tempRepo();
    const wt = await createWorktree(root, 'TAR-0001', 'ATT-0001');
    writeFileSync(path.join(wt.path, 'feito.txt'), 'x\n');
    await git(wt.path, ['add', '.']);
    await git(wt.path, ['commit', '-q', '-m', 'tarefa']);
    mkdirSync(path.join(root, '.ases'), { recursive: true });
    writeFileSync(path.join(root, '.ases', 'HISTORY.jsonl'), '{}\n');
    writeFileSync(path.join(root, 'app.txt'), 'mexido pelo usuário\n');
    await expect(mergeBranch(root, wt.branch, 'main', 'm')).rejects.toThrow(/uncommitted/);
    await git(root, ['checkout', '--', 'app.txt']);
    expect(await mergeBranch(root, wt.branch, 'main', 'm')).toMatchObject({ status: 'MERGED' });
    expect(existsSync(path.join(root, '.ases', 'HISTORY.jsonl'))).toBe(true);
  });
});

describe('what the main changed in a turn (PHASE-19)', () => {
  it('turnDiff lists each file with +added −removed and its patch', async () => {
    const root = await tempRepo();
    const ref = 'refs/ases/restore/CNV-0001/1';
    await createRestorePoint(root, ref);
    writeFileSync(path.join(root, 'app.txt'), 'linha 1 mudada\nlinha 2\n');
    writeFileSync(path.join(root, 'novo.txt'), 'a\nb\nc\n');
    await markTurnEnd(root, ref);
    const d = await turnDiff(root, ref);
    expect(d.map((x) => [x.file, x.added, x.removed])).toEqual([['app.txt', 2, 1], ['novo.txt', 3, 0]]);
    expect(d[0]!.patch.split('\n')).toEqual(expect.arrayContaining(['-linha 1', '+linha 1 mudada', '+linha 2']));
  });
});
