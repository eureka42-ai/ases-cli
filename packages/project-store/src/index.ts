import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { ManifestSchema, VERSIONS, type EventEnvelope, type Manifest, type PhaseState, type TaskState } from '@aer/contracts';
import { assertSupportedTarget, writePrivateFile, type LocalIpcEndpoint, type PlatformAdapter } from '@aer/platform-core';

export const ASES_DIR = '.ases';
export const paths = (root: string) => {
  const A = path.join(root, ASES_DIR);
  return { ases: A, manifest: path.join(A, 'MANIFEST.json'), dbDir: path.join(A, 'db'), db: path.join(A, 'db', 'ases.sqlite'), history: path.join(A, 'HISTORY.jsonl') };
};

export class ProjectError extends Error {
  readonly code: 'NOT_A_PROJECT' | 'INTERIM_PROJECT' | 'INVALID_MANIFEST' | 'ENGINE_NOT_RUNNING' | 'DB_MISSING' | 'CONFIG_INVALID';
  constructor(code: ProjectError['code'], message: string) {
    super(message);
    this.name = 'ProjectError';
    this.code = code;
  }
}

/** Carrega só o adapter do SO atual (§3.6). */
export async function loadPlatformAdapter(platform: string = process.platform, arch: string = process.arch): Promise<PlatformAdapter> {
  switch (assertSupportedTarget(platform, arch)) {
    case 'darwin':
      return (await import('@aer/platform-macos')).createMacosAdapter();
    case 'win32':
      return (await import('@aer/platform-windows')).createWindowsAdapter();
    case 'linux':
      return (await import('@aer/platform-linux')).createLinuxAdapter();
  }
}

/** Sobe a partir de start até achar .ases/MANIFEST.json (AER-REQ-012). */
export function findProjectRoot(start: string): string | undefined {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    if (existsSync(paths(dir).manifest)) return dir;
    if (path.dirname(dir) === dir) return undefined;
  }
}

export function readManifest(root: string): Manifest {
  const r = ManifestSchema.safeParse(JSON.parse(readFileSync(paths(root).manifest, 'utf8')));
  if (!r.success) throw new ProjectError('INVALID_MANIFEST', `${paths(root).manifest}: ${r.error.message}`);
  return r.data;
}

/**
 * O .ases/ do próprio AER ainda é escrito por scripts/ases-dev.mjs (ADR-0001 §7). Abrir o engine nele
 * criaria dois escritores do HISTORY.jsonl; até o corte, recusamos.
 */
export function isInterimProject(root: string): boolean {
  return historyState(root) === 'INTERIM';
}

/**
 * Estado do espelho em relação ao banco:
 * - NONE: sem histórico; INTERIM: só eventos do bootstrap interino e sem banco (pode migrar);
 * - DB_MISSING: histórico do engine sem o banco (clone novo, outra worktree): recriar o banco apagaria o histórico
 *   versionado na próxima exportação, então o engine recusa iniciar; OK: banco presente.
 */
export function historyState(root: string): 'NONE' | 'INTERIM' | 'DB_MISSING' | 'OK' {
  const p = paths(root);
  if (existsSync(p.db)) return 'OK';
  if (!existsSync(p.history)) return 'NONE';
  const lines = readFileSync(p.history, 'utf8').split('\n').filter(Boolean);
  if (!lines.length) return 'NONE';
  return lines.every((l) => (JSON.parse(l) as { actor?: string }).actor === 'ases-dev-interim') ? 'INTERIM' : 'DB_MISSING';
}

function writeIfAbsent(file: string, content: string, created: string[], root: string): void {
  if (existsSync(file)) return;
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, file);
  created.push(path.relative(root, file).split(path.sep).join('/'));
}

/** ases init: cria só o que falta; nunca sobrescreve (AER-REQ-011, AER-REQ-017). */
export function initProject(root: string, adapter: PlatformAdapter, name = path.basename(path.resolve(root))): { created: string[]; manifest: Manifest } {
  const p = paths(root);
  const created: string[] = [];
  const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
  if (!existsSync(p.manifest)) {
    const manifest: Manifest = {
      schemaVersion: 1, projectId: `prj_${randomBytes(6).toString('hex')}`, name, createdAt: new Date().toISOString(),
      versions: { projectSchema: VERSIONS.projectSchema, dbSchema: VERSIONS.dbSchema }, sources: [],
    };
    writeIfAbsent(p.manifest, json(ManifestSchema.parse(manifest)), created, root);
  }
  writeIfAbsent(path.join(p.ases, 'VERSION'), `${VERSIONS.projectSchema}\n`, created, root);
  writeIfAbsent(path.join(p.ases, '.gitignore'), '# estado privado (MD mestre §4.3)\ndb/\nipc/\nruntime/\nlocks/\nworktrees/\nbackups/\n', created, root);
  writeIfAbsent(path.join(p.ases, 'CONFIG.json'), json({
    schemaVersion: 1, project: { name, locale: 'pt-BR' },
    security: { defaultPolicy: 'deny-unclassified', storeRawPrompts: false, allowOutsideRepo: false },
    branding: { theme: 'teal', logo: 'auto' },
  }), created, root);
  for (const [f, title] of [['PROJECT.md', 'Projeto'], ['STATUS.md', 'Status'], ['NEXT-STEPS.md', 'Próximos passos'], ['HANDOFF.md', 'Handoff']] as const) {
    writeIfAbsent(path.join(p.ases, f), `# ${title} — ${name}\n\n(gerenciado pelo AER)\n`, created, root);
  }
  for (const d of ['phases', 'decisions', 'evidence', 'handoffs', 'checkpoints']) writeIfAbsent(path.join(p.ases, d, '.gitkeep'), '', created, root);
  adapter.ensurePrivateDir(p.dbDir);
  return { created, manifest: readManifest(root) };
}

export interface Session {
  pid: number;
  protocolVersion: number;
  endpoint: LocalIpcEndpoint;
  controlToken: string;
  monitorToken: string;
  startedAt: string;
}

export const sessionFile = (adapter: PlatformAdapter, projectId: string): string => path.join(adapter.getRuntimeDir(projectId), 'session.json');

export function writeSession(adapter: PlatformAdapter, projectId: string, s: Session): void {
  adapter.ensurePrivateDir(adapter.getRuntimeDir(projectId));
  writePrivateFile(sessionFile(adapter, projectId), JSON.stringify(s));
}

export function readSession(adapter: PlatformAdapter, projectId: string): Session {
  const f = sessionFile(adapter, projectId);
  if (!existsSync(f)) throw new ProjectError('ENGINE_NOT_RUNNING', 'no running ases engine for this project (start `ases` in another terminal)');
  return JSON.parse(readFileSync(f, 'utf8')) as Session;
}

export interface InterimProject {
  events: EventEnvelope[];
  phases: { id: string; title: string; state: PhaseState }[];
  tasks: { id: string; phaseId: string; title: string; state: TaskState; reqs: string[]; dependsOn: string[] }[];
  artifacts: { taskId: string; relativePath: string; sha256: string; note?: string }[];
  missingEvidence: string[];
}

/** Lê o .ases/ escrito por scripts/ases-dev.mjs: HISTORY.jsonl, STATUS.json e PLAN.json de cada fase/tarefa e evidências (SHA-256 atual). */
export function readInterimProject(root: string): InterimProject {
  const p = paths(root);
  const events = readFileSync(p.history, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as EventEnvelope);
  const out: InterimProject = { events, phases: [], tasks: [], artifacts: [], missingEvidence: [] };
  const phasesDir = path.join(p.ases, 'phases');
  for (const ph of readdirSync(phasesDir).filter((d) => /^PHASE-\d{2,}$/.test(d)).sort()) {
    const st = JSON.parse(readFileSync(path.join(phasesDir, ph, 'STATUS.json'), 'utf8')) as { phaseId: string; title: string; state: PhaseState };
    out.phases.push({ id: st.phaseId, title: st.title, state: st.state });
    const planFile = path.join(phasesDir, ph, 'PLAN.json');
    const deps = new Map<string, string[]>(existsSync(planFile) ? (JSON.parse(readFileSync(planFile, 'utf8')) as { tasks: { id: string; dependencies: string[] }[] }).tasks.map((t) => [t.id, t.dependencies]) : []);
    for (const tar of readdirSync(path.join(phasesDir, ph)).filter((d) => /^TAR-\d{4,}$/.test(d)).sort()) {
      const t = JSON.parse(readFileSync(path.join(phasesDir, ph, tar, 'STATUS.json'), 'utf8')) as { taskId: string; phaseId: string; title: string; state: TaskState; reqs: string[]; evidence: string[] };
      out.tasks.push({ id: t.taskId, phaseId: t.phaseId, title: t.title, state: t.state, reqs: t.reqs, dependsOn: deps.get(t.taskId) ?? [] });
      for (const ev of t.evidence) {
        const f = path.join(root, ev);
        if (!existsSync(f)) out.missingEvidence.push(`${t.taskId}: ${ev}`);
        else out.artifacts.push({ taskId: t.taskId, relativePath: ev, sha256: createHash('sha256').update(readFileSync(f)).digest('hex') });
      }
    }
  }
  return out;
}

/** Arquivo de configuração global do usuário: `%APPDATA%\ases\config.json` no Windows, `$XDG_CONFIG_HOME/ases/config.json` (ou `~/.config`) nos outros. */
export function globalConfigFile(platform: string = process.platform, env: Readonly<Record<string, string | undefined>> = process.env, home: string = homedir()): string {
  if (platform === 'win32') return path.win32.join(env.APPDATA ?? path.win32.join(home, 'AppData', 'Roaming'), 'ases', 'config.json');
  return path.posix.join(env.XDG_CONFIG_HOME || path.posix.join(home, '.config'), 'ases', 'config.json');
}

/** Bloco `ui` (theme/logo) de um JSON de configuração; ausente = {}; JSON inválido = erro com o arquivo. */
function readUi(file: string): { theme?: unknown; logo?: unknown } {
  if (!existsSync(file)) return {};
  let j: unknown;
  try {
    j = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ProjectError('CONFIG_INVALID', `${file}: ${(err as Error).message}`);
  }
  const ui = (j as { ui?: unknown } | null)?.ui;
  return ui && typeof ui === 'object' ? { theme: (ui as { theme?: unknown }).theme, logo: (ui as { logo?: unknown }).logo } : {};
}

/** Camadas de preferência de marca abaixo da CLI, na ordem de precedência: projeto (`.ases/CONFIG.json`) > global (AER-REQ-249). */
export function brandConfigLayers(root: string | undefined, globalFile: string = globalConfigFile()): { source: string; theme?: unknown; logo?: unknown }[] {
  return [
    ...(root ? [{ source: '.ases/CONFIG.json', ...readUi(path.join(root, ASES_DIR, 'CONFIG.json')) }] : []),
    { source: globalFile, ...readUi(globalFile) },
  ];
}
