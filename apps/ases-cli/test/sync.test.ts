import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initProject, loadPlatformAdapter, paths, projectSync, snapshotFile } from '@aer/project-store';
import { syncCommand } from '../src/chat-commands.ts';
import { handleLine } from '../src/commands.ts';
import { Engine } from '../src/engine.ts';
import { CLOUD_EXCLUDES, cloudRemotes, enableSync, initGitRepo, listRemoteProjects, pickCloudRemote, pullProject, repoSlug, syncProject, type Run } from '../src/sync.ts';

// 1.4.0: levar o projeto (com o contexto) para outra máquina pelo GitHub e/ou pela nuvem (rclone).

const adapter = await loadPlatformAdapter();
const dirs: string[] = [];
const tmp = (name: string) => {
  const d = mkdtempSync(path.join(os.tmpdir(), name));
  dirs.push(d);
  return d;
};
const g = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' });
const gitId = (cwd: string) => {
  for (const [k, v] of [['user.name', 'T'], ['user.email', 't@example.invalid'], ['commit.gpgsign', 'false']]) g(cwd, 'config', k!, v!);
};

beforeAll(() => {
  const home = tmp('aer-sync-home-');
  process.env.XDG_CONFIG_HOME = home;
  process.env.APPDATA = home;
});
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })));

/** rclone/gh falsos: registra as chamadas; git é o de verdade. */
function fakeRun(answers: Record<string, { status?: number; stdout?: string; stderr?: string }>): { run: Run; calls: string[][] } {
  const calls: string[][] = [];
  const run: Run = (cmd, args, cwd) => {
    if (cmd === 'git') {
      try {
        return { status: 0, stdout: execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), stderr: '' };
      } catch (err) {
        const e = err as { status?: number; stderr?: string };
        return { status: e.status ?? 1, stdout: '', stderr: String(e.stderr ?? '') };
      }
    }
    calls.push([cmd, ...args]);
    const key = Object.keys(answers).find((k) => [cmd, ...args].join(' ').startsWith(k));
    const a = key ? answers[key]! : { status: 127, stderr: 'ENOENT' };
    return { status: a.status ?? 0, stdout: a.stdout ?? '', stderr: a.stderr ?? '' };
  };
  return { run, calls };
}

describe('sync helpers', () => {
  it('repo names, rclone remotes and the preferred remote', () => {
    expect(repoSlug('Meu App Ação')).toBe('Meu-App-Acao');
    expect(repoSlug('...')).toBe('projeto');
    expect(cloudRemotes(fakeRun({}).run)).toBeUndefined(); // rclone ausente
    const { run } = fakeRun({ 'rclone listremotes': { stdout: 'gdrive:\nonedrive:\n' } });
    expect(cloudRemotes(run)).toEqual(['gdrive:', 'onedrive:']);
    expect(pickCloudRemote(['gdrive:', 'onedrive:'], 'onedrive:')).toBe('onedrive:');
    expect(pickCloudRemote(['gdrive:'], 'mega:')).toBe('gdrive:');
    expect(pickCloudRemote([], undefined)).toBeUndefined();
  });

  it('lists projects from the cloud folder and from GitHub repos tagged ases-project', () => {
    const { run } = fakeRun({ 'rclone lsf --dirs-only gdrive:Projetos Eureka42': { stdout: 'loja/\nsite/\n' }, 'gh repo list --topic ases-project': { stdout: 'eu/loja loja\n' } });
    expect(listRemoteProjects({ github: true, cloud: 'gdrive:' }, run).projects).toEqual([
      { source: 'cloud', name: 'loja', ref: 'gdrive:Projetos Eureka42/loja' }, { source: 'cloud', name: 'site', ref: 'gdrive:Projetos Eureka42/site' }, { source: 'github', name: 'loja', ref: 'eu/loja' },
    ]);
  });
});

describe('a project travels with its context', () => {
  it('GitHub: sync commits the DB snapshot; a fresh clone on another machine opens with the same history', async () => {
    const root = tmp('aer sync a ');
    g(root, 'init', '-q', '-b', 'main');
    gitId(root);
    initProject(root, adapter, 'viagem');
    const origin = tmp('aer-sync-origin-');
    g(origin, 'init', '-q', '--bare', '-b', 'main');
    g(root, 'remote', 'add', 'origin', origin);
    const engine = await Engine.start(root, adapter);
    await handleLine(engine, '/phase new Contexto que viaja');
    const seq = engine.info.lastSeq;
    await engine.stop();

    enableSync(root, ['github'], undefined);
    const { run, calls } = fakeRun({});
    expect(syncProject(root, run)).toEqual([expect.stringMatching(/^GitHub: enviado para /)]);
    expect(calls).toEqual([]); // com origin já configurado, o gh não é chamado
    expect(existsSync(snapshotFile(root))).toBe(true);

    // "outra máquina": clone limpo, sem .ases/db
    const other = path.join(tmp('aer-sync-b-'), 'viagem');
    execFileSync('git', ['clone', '-q', origin, other]);
    expect(existsSync(paths(other).db)).toBe(false);
    const e2 = await Engine.start(other, adapter);
    try {
      expect(e2.info.lastSeq).toBe(seq);
      expect(String(await handleLine(e2, '/phases'))).toContain('Contexto que viaja');
    } finally {
      await e2.stop();
    }
  }, 60_000);

  it('cloud: rclone sync excludes local state; pull downloads into ~/Projetos and keeps the cloud target', () => {
    const root = tmp('aer sync c ');
    initProject(root, adapter, 'nuvem');
    enableSync(root, ['cloud'], 'gdrive:');
    expect(projectSync(root)).toMatchObject({ targets: ['cloud'], cloud: `gdrive:Projetos Eureka42/${path.basename(root)}` });
    const { run, calls } = fakeRun({ 'rclone sync': {} });
    expect(syncProject(root, run)).toEqual([`nuvem: enviado para gdrive:Projetos Eureka42/${path.basename(root)}`]);
    expect(calls[0]!.slice(0, 4)).toEqual(['rclone', 'sync', root, `gdrive:Projetos Eureka42/${path.basename(root)}`]);
    for (const e of CLOUD_EXCLUDES) expect(calls[0]).toContain(e);

    // pull: o rclone falso "baixa" criando o projeto no destino
    const projects = tmp('aer-sync-projetos-');
    const pull: Run = (cmd, args) => {
      if (cmd === 'rclone' && args[0] === 'copy') initProject(args[2]!, adapter, 'loja');
      return { status: 0, stdout: '', stderr: '' };
    };
    const dest = pullProject({ source: 'cloud', name: 'loja', ref: 'gdrive:Projetos Eureka42/loja' }, projects, pull);
    expect(dest).toBe(path.join(projects, 'loja'));
    expect(projectSync(dest)).toMatchObject({ targets: ['cloud'], cloud: 'gdrive:Projetos Eureka42/loja' });
  });

  it('a failing target is reported and does not stop the other', () => {
    const root = tmp('aer sync d ');
    initProject(root, adapter, 'falha');
    writeFileSync(path.join(root, 'a.txt'), 'x');
    enableSync(root, ['github', 'cloud'], 'mega:');
    const { run } = fakeRun({ 'rclone sync': {}, 'gh repo create': { status: 1, stderr: 'HTTP 401: Bad credentials' } });
    const out = syncProject(root, run);
    expect(out[0]).toMatch(/^GitHub: falhou — /);
    expect(out[1]).toBe(`nuvem: enviado para mega:Projetos Eureka42/${path.basename(root)}`);
  });

  it('/sincronizar explains what is missing instead of failing', async () => {
    const root = tmp('aer sync e ');
    initProject(root, adapter, 'cmd');
    expect(await syncCommand(root, 'nuvem', '', fakeRun({}).run)).toMatch(/instale o rclone/);
    expect(await syncCommand(root, 'github', '', fakeRun({ 'gh auth status': { status: 1 } }).run)).toMatch(/gh auth login/);
    expect(await syncCommand(root, '', '', fakeRun({}).run)).toMatch(/sincronização: desligada/);
    expect(await syncCommand(root, 'nuvem', 'onedrive', fakeRun({ 'rclone listremotes': { stdout: 'gdrive:\n' } }).run)).toMatch(/remoto onedrive não existe/);
    const ok = await syncCommand(root, 'nuvem', '', fakeRun({ 'rclone listremotes': { stdout: 'gdrive:\n' }, 'rclone sync': {} }).run);
    expect(ok).toMatch(/nuvem \(gdrive:Projetos Eureka42\//);
    expect(ok).toMatch(/nuvem: enviado para gdrive:Projetos Eureka42\//);
    expect(await syncCommand(root, 'desligar', '', fakeRun({}).run)).toMatch(/desligada/);
    expect(projectSync(root).targets).toEqual([]);
  });
});

describe('new project has Git (parallel plans need worktrees)', () => {
  it('git init + first commit; a second call does nothing', () => {
    const root = tmp('aer sync git ');
    initProject(root, adapter, 'git');
    const { run } = fakeRun({});
    expect(initGitRepo(root, run)).toBe(true);
    expect(g(root, 'log', '--oneline')).toContain('ases: projeto criado');
    expect(initGitRepo(root, run)).toBe(false);
  });
});
