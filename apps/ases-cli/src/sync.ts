import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { snapshotDatabase } from '@aer/persistence';
import { t } from './i18n.ts';
import { paths, preferredCloudRemote, projectSync, readManifest, saveProjectSync, snapshotFile, type ProjectSync, type SyncTarget } from '@aer/project-store';

// 1.4.0: levar o projeto para outra máquina. O projeto roda numa pasta LOCAL (~/Projetos); o GitHub e/ou a nuvem
// (Google Drive, OneDrive, Mega, Dropbox… pelo rclone) guardam uma cópia. Nada de trabalhar dentro da pasta
// sincronizada: o sync de pasta corrompe o SQLite (22/11/2026). O contexto vai junto em .ases/snapshot/ases.sqlite.

export interface RunResult { status: number; stdout: string; stderr: string }
export type Run = (cmd: string, args: string[], cwd?: string) => RunResult;

/** Sem shell (as ferramentas são executáveis: gh, git, rclone). Timeout longo: upload/download de projeto. */
export const defaultRun: Run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 10 * 60_000, windowsHide: true });
  return { status: r.status ?? 127, stdout: r.stdout ?? '', stderr: `${r.stderr ?? ''}${r.error ? r.error.message : ''}` };
};

/** Pasta dos projetos: ~/Projetos Eureka42 nesta máquina e Projetos Eureka42 na nuvem. */
export const PROJECTS_DIR_NAME = 'Projetos Eureka42';
export const CLOUD_BASE = PROJECTS_DIR_NAME;
/** Tópico que marca no GitHub os repositórios que são projetos do ASES (para listar na outra máquina). */
export const GITHUB_TOPIC = 'ases-project';
/** Estado local que não viaja: banco vivo, IPC, worktrees das tarefas, dependências instaladas. */
export const CLOUD_EXCLUDES = ['.ases/db/**', '.ases/ipc/**', '.ases/runtime/**', '.ases/locks/**', '.ases/worktrees/**', '.ases/backups/**', 'node_modules/**'];

const fail = (what: string, r: RunResult) => new Error(`${what}: ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' ') || `saída ${r.status}`}`);

/** Remotos do rclone (`gdrive:`, `onedrive:`…); undefined quando o rclone não está instalado. */
export function cloudRemotes(run: Run = defaultRun): string[] | undefined {
  const r = run('rclone', ['listremotes']);
  if (r.status === 127 || /ENOENT/.test(r.stderr)) return undefined;
  return r.status === 0 ? r.stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[\w .-]+:$/.test(l)) : [];
}

/** Remoto a usar: o preferido (config pessoal) se ainda existe, senão o primeiro. */
export function pickCloudRemote(remotes: string[] | undefined, preferred = preferredCloudRemote()): string | undefined {
  if (!remotes?.length) return undefined;
  return preferred && remotes.includes(preferred) ? preferred : remotes[0];
}

export const githubReady = (run: Run = defaultRun): boolean => run('gh', ['auth', 'status']).status === 0;

/** Nome amigável do tipo de remoto do rclone. */
const CLOUD_NAMES: Record<string, string> = { drive: 'Google Drive', onedrive: 'OneDrive', mega: 'Mega', dropbox: 'Dropbox', box: 'Box', pcloud: 'pCloud', s3: 'S3', webdav: 'WebDAV', protondrive: 'Proton Drive', yandex: 'Yandex Disk' };

/** `gdrive:` → `Google Drive`; tipo desconhecido fica com o nome do remoto. */
export function cloudLabel(remote: string, run: Run = defaultRun): string {
  const r = run('rclone', ['listremotes', '--long']);
  const line = r.stdout.split(/\r?\n/).find((l) => l.trim().startsWith(remote));
  const type = line?.trim().slice(remote.length).trim();
  return (type && CLOUD_NAMES[type]) || remote.replace(/:$/, '');
}

/** Linha de status para o cabeçalho: o que está conectado e se ESTE projeto é enviado. */
export function syncStatusLine(root: string, avail: { github: boolean; cloud?: string; cloudName?: string }): string {
  const s = projectSync(root);
  const parts: string[] = [];
  const c = avail.cloudName ?? avail.cloud;
  if (avail.cloud) parts.push(t(s.targets.includes('cloud') ? 'sync.cloudOn' : 'sync.cloudLocal', { c: c! }));
  else parts.push(t('sync.noCloud'));
  if (avail.github) parts.push(t(s.targets.includes('github') ? 'sync.githubOn' : 'sync.githubLocal'));
  return parts.join(' · ');
}

/** O que existe nesta máquina para sincronizar (a tela inicial e o /sincronizar mostram só o que funciona). */
export function syncAvailability(run: Run = defaultRun): { github: boolean; cloud?: string; cloudName?: string; rcloneMissing: boolean; rcloneInstalled: boolean } {
  const remotes = cloudRemotes(run);
  const cloud = pickCloudRemote(remotes);
  return { github: githubReady(run), ...(cloud ? { cloud, cloudName: cloudLabel(cloud, run) } : {}), rcloneMissing: remotes === undefined, rcloneInstalled: remotes !== undefined };
}

/** Nome de pasta → nome de repositório do GitHub (sem acento, espaço vira hífen). */
export function repoSlug(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 100) || 'projeto';
}

export const cloudPath = (remote: string, name: string): string => `${remote}${CLOUD_BASE}/${name}`;

/** Grava a cópia do contexto (banco) que viaja com o projeto. */
export function writeSnapshot(root: string): boolean {
  if (!existsSync(paths(root).db)) return false;
  snapshotDatabase(paths(root).db, snapshotFile(root));
  return true;
}

function git(root: string, args: string[], run: Run): RunResult {
  return run('git', args, root);
}

/** Envia ao GitHub: commit de tudo (código + .ases + cópia do contexto) e push; cria o repositório privado na 1ª vez. */
export function pushGithub(root: string, sync: ProjectSync, run: Run = defaultRun): { repo: string; line: string } {
  if (!existsSync(path.join(root, '.git'))) {
    const r = git(root, ['init', '-q', '-b', 'main'], run);
    if (r.status !== 0) throw fail('git init', r);
  }
  git(root, ['add', '-A'], run);
  const changed = git(root, ['status', '--porcelain'], run).stdout.trim() !== '';
  const hasHead = git(root, ['rev-parse', '--verify', 'HEAD'], run).status === 0;
  if (changed || !hasHead) {
    const c = git(root, ['commit', '-q', ...(changed ? [] : ['--allow-empty']), '-m', `ases: sincronização ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`], run);
    if (c.status !== 0) throw fail('git commit (configure user.name e user.email do git)', c);
  }
  let repo = sync.github;
  if (git(root, ['remote', 'get-url', 'origin'], run).status !== 0) {
    const name = repoSlug(readManifest(root).name);
    const r = run('gh', ['repo', 'create', name, '--private', '--source', root, '--remote', 'origin'], root);
    if (r.status !== 0) throw fail('gh repo create', r);
    const v = run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], root);
    repo = v.stdout.trim() || name;
    run('gh', ['repo', 'edit', repo, '--add-topic', GITHUB_TOPIC], root); // só para listar na outra máquina; falha não impede o push
  }
  const p = git(root, ['push', '-q', '-u', 'origin', 'HEAD'], run);
  if (p.status !== 0) throw fail('git push', p);
  repo ??= git(root, ['remote', 'get-url', 'origin'], run).stdout.trim();
  return { repo, line: `GitHub: enviado para ${repo}` };
}

/** Envia à nuvem: espelha a pasta do projeto (sem o estado local) em <remoto>Projetos/<nome>. */
export function pushCloud(root: string, dest: string, run: Run = defaultRun): string {
  // vários arquivos ao mesmo tempo: o Drive é lento por arquivo (um projeto de 108 arquivos levou ~3 min em série)
  const r = run('rclone', ['sync', root, dest, '--transfers', '16', '--checkers', '16', '--fast-list', ...CLOUD_EXCLUDES.flatMap((e) => ['--exclude', e])]);
  if (r.status !== 0) throw fail('rclone sync', r);
  return `nuvem: enviado para ${dest}`;
}

/** Sincroniza o projeto com os destinos escolhidos. Cada destino falha sozinho (o outro ainda é enviado). */
export function syncProject(root: string, run: Run = defaultRun): string[] {
  const s = projectSync(root);
  if (!s.targets.length) return ['sincronização desligada neste projeto (/sincronizar github | nuvem | ambos)'];
  const out: string[] = [];
  writeSnapshot(root);
  if (s.targets.includes('github')) {
    try {
      const g = pushGithub(root, s, run);
      if (g.repo !== s.github) saveProjectSync(root, { ...projectSync(root), github: g.repo });
      out.push(g.line);
    } catch (err) {
      out.push(`GitHub: falhou — ${(err as Error).message}`);
    }
  }
  if (s.targets.includes('cloud')) {
    const dest = s.cloud;
    if (!dest) out.push('nuvem: sem destino; rode /sincronizar nuvem');
    else {
      try {
        out.push(pushCloud(root, dest, run));
      } catch (err) {
        out.push(`nuvem: falhou — ${(err as Error).message}`);
      }
    }
  }
  return out;
}

/** Liga os destinos de um projeto (escolha na tela inicial ou no /sincronizar). */
export function enableSync(root: string, targets: SyncTarget[], cloudRemote: string | undefined): ProjectSync {
  const cur = projectSync(root);
  const name = path.basename(root);
  const keep = cur.cloud && cloudRemote && cur.cloud.startsWith(cloudRemote) ? cur.cloud : undefined;
  const s: ProjectSync = { ...cur, targets, ...(targets.includes('cloud') && cloudRemote ? { cloud: keep ?? cloudPath(cloudRemote, name) } : {}) };
  saveProjectSync(root, s);
  return s;
}

export interface RemoteProject { source: SyncTarget; name: string; ref: string }

/** Projetos que existem na nuvem e no GitHub (para abrir numa outra máquina). */
export function listRemoteProjects(avail: { github: boolean; cloud?: string }, run: Run = defaultRun): { projects: RemoteProject[]; errors: string[] } {
  const projects: RemoteProject[] = [];
  const errors: string[] = [];
  if (avail.cloud) {
    const r = run('rclone', ['lsf', '--dirs-only', `${avail.cloud}${CLOUD_BASE}`]);
    if (r.status === 0) for (const d of r.stdout.split(/\r?\n/).map((l) => l.trim().replace(/\/$/, '')).filter(Boolean)) projects.push({ source: 'cloud', name: d, ref: cloudPath(avail.cloud, d) });
    else if (!/directory not found/i.test(r.stderr)) errors.push(fail(`nuvem (${avail.cloud})`, r).message);
  }
  if (avail.github) {
    const r = run('gh', ['repo', 'list', '--topic', GITHUB_TOPIC, '--limit', '100', '--json', 'nameWithOwner,name', '--jq', '.[] | .nameWithOwner + " " + .name']);
    if (r.status === 0) {
      for (const l of r.stdout.split(/\r?\n/).filter(Boolean)) {
        const [ref = '', name = ref] = l.trim().split(' ');
        projects.push({ source: 'github', name, ref });
      }
    } else errors.push(fail('GitHub', r).message);
  }
  return { projects, errors };
}

/** Traz um projeto para <dir>/<nome> e liga a sincronização com a mesma origem. Pasta já existente: só reabre. */
export function pullProject(p: RemoteProject, projectsDir: string, run: Run = defaultRun): string {
  const dest = path.join(projectsDir, p.name);
  if (!existsSync(dest)) {
    const r = p.source === 'cloud' ? run('rclone', ['copy', p.ref, dest, '--transfers', '16', '--checkers', '16', '--fast-list']) : run('gh', ['repo', 'clone', p.ref, dest]);
    if (r.status !== 0) throw fail(p.source === 'cloud' ? 'rclone copy' : 'gh repo clone', r);
  }
  if (existsSync(path.join(dest, '.ases', 'MANIFEST.json'))) {
    const cur = projectSync(dest);
    const targets = cur.targets.includes(p.source) ? cur.targets : [...cur.targets, p.source];
    saveProjectSync(dest, { ...cur, targets, ...(p.source === 'cloud' ? { cloud: p.ref } : { github: p.ref }) });
  }
  return dest;
}

/** Nuvens com login pelo navegador (OAuth do próprio rclone; o AER nunca vê senha nem token). */
export const CLOUD_PROVIDERS = [
  { id: 'google', label: 'Google Drive', remote: 'gdrive', type: 'drive', extra: ['scope=drive'] },
  { id: 'onedrive', label: 'OneDrive', remote: 'onedrive', type: 'onedrive', extra: [] },
  { id: 'dropbox', label: 'Dropbox', remote: 'dropbox', type: 'dropbox', extra: [] },
] as const;
export type CloudProviderId = (typeof CLOUD_PROVIDERS)[number]['id'];

/**
 * Conecta uma nuvem: `rclone config create` abre o navegador para o login e espera. Assíncrono (a TUI continua viva).
 * Mega e outras que pedem senha: só pelo `rclone config` no terminal (o AER não digita senhas).
 */
export async function connectCloud(id: CloudProviderId, spawnFn: typeof spawn = spawn): Promise<{ remote: string; label: string }> {
  const c = CLOUD_PROVIDERS.find((x) => x.id === id);
  if (!c) throw new Error(`nuvem desconhecida: ${id}`);
  const code = await new Promise<{ code: number | null; err: string }>((resolve) => {
    let err = '';
    const child = spawnFn('rclone', ['config', 'create', c.remote, c.type, ...c.extra], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    child.stderr?.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', (e) => resolve({ code: 127, err: e.message }));
    child.on('close', (n) => resolve({ code: n, err }));
  });
  if (code.code !== 0) throw new Error(code.code === 127 ? 'rclone não instalado (https://rclone.org/install)' : `login não concluído: ${code.err.trim().split('\n').slice(-2).join(' ')}`);
  return { remote: `${c.remote}:`, label: c.label };
}

/**
 * Projeto novo com Git e um primeiro commit (planos em paralelo exigem um repositório: cada IA trabalha numa worktree).
 * Sem nome/e-mail do git configurados, usa um autor local só neste repositório. Já existe .git: não faz nada.
 */
export function initGitRepo(root: string, run: Run = defaultRun): boolean {
  if (existsSync(path.join(root, '.git'))) return false;
  if (run('git', ['init', '-q', '-b', 'main'], root).status !== 0) return false;
  if (run('git', ['config', 'user.email'], root).stdout.trim() === '') {
    run('git', ['config', 'user.name', 'Eureka42 ASES'], root);
    run('git', ['config', 'user.email', 'ases@localhost'], root);
  }
  run('git', ['add', '-A'], root);
  return run('git', ['commit', '-q', '--allow-empty', '-m', 'ases: projeto criado'], root).status === 0;
}
