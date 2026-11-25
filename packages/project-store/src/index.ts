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

// ---- PHASE-18: bloco `chat` do CONFIG (principal, modo, limites, revisão cruzada, teste, consentimentos) ----
export type ChatMode = 'manual' | 'auto' | 'hybrid';
export interface ChatConfig {
  main?: string;
  mode: ChatMode;
  /** sessões simultâneas por IA; ausente = 1 */
  limits: Record<string, number>;
  crossReview: boolean;
  /** argv do comando de teste do projeto (sem shell) */
  testCommand?: string[];
  /** IAs com consentimento gravado (`/config consentir <ia> --save`) */
  consent: string[];
}
type ChatKey = keyof ChatConfig;
const CHAT_KEYS: ChatKey[] = ['main', 'mode', 'limits', 'crossReview', 'testCommand', 'consent'];

function readChat(file: string): Partial<ChatConfig> {
  if (!existsSync(file)) return {};
  let j: unknown;
  try {
    j = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ProjectError('CONFIG_INVALID', `${file}: ${(err as Error).message}`);
  }
  const c = (j as { chat?: unknown } | null)?.chat;
  if (c === undefined) return {};
  const bad = (field: string, why: string) => new ProjectError('CONFIG_INVALID', `${file}: chat.${field} ${why}`);
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw bad('', 'must be an object');
  const o = c as Record<string, unknown>;
  const out: Partial<ChatConfig> = {};
  if (o.main !== undefined) {
    if (typeof o.main !== 'string' || !/^[a-z][a-z0-9-]*$/.test(o.main)) throw bad('main', 'must be a provider id');
    out.main = o.main;
  }
  if (o.mode !== undefined) {
    if (o.mode !== 'manual' && o.mode !== 'auto' && o.mode !== 'hybrid') throw bad('mode', 'must be manual|auto|hybrid');
    out.mode = o.mode;
  }
  if (o.limits !== undefined) {
    if (!o.limits || typeof o.limits !== 'object' || Object.values(o.limits).some((v) => !Number.isInteger(v) || (v as number) < 1 || (v as number) > 8)) throw bad('limits', 'must map provider → integer 1..8');
    out.limits = o.limits as Record<string, number>;
  }
  if (o.crossReview !== undefined) {
    if (typeof o.crossReview !== 'boolean') throw bad('crossReview', 'must be true|false');
    out.crossReview = o.crossReview;
  }
  if (o.testCommand !== undefined) {
    if (!Array.isArray(o.testCommand) || !o.testCommand.length || o.testCommand.some((x) => typeof x !== 'string' || !x)) throw bad('testCommand', 'must be a non-empty argv array, e.g. ["npm","test"]');
    out.testCommand = o.testCommand as string[];
  }
  if (o.consent !== undefined) {
    if (!Array.isArray(o.consent) || o.consent.some((x) => typeof x !== 'string')) throw bad('consent', 'must be a list of provider ids');
    out.consent = o.consent as string[];
  }
  return out;
}

/** Config `chat` efetiva: projeto > global > padrão, com a origem de cada campo. */
export function chatConfig(root: string | undefined, globalFile: string = globalConfigFile()): ChatConfig & { sources: Record<ChatKey, string> } {
  const layers: [string, Partial<ChatConfig>][] = [...(root ? [['.ases/CONFIG.json', readChat(path.join(root, ASES_DIR, 'CONFIG.json'))] as [string, Partial<ChatConfig>]] : []), [globalFile, readChat(globalFile)]];
  const defaults: ChatConfig = { mode: 'manual', limits: {}, crossReview: true, consent: [] };
  const out = { ...defaults } as ChatConfig & { sources: Record<ChatKey, string> };
  out.sources = Object.fromEntries(CHAT_KEYS.map((k) => [k, 'default'])) as Record<ChatKey, string>;
  for (const k of CHAT_KEYS) {
    const hit = layers.find(([, l]) => l[k] !== undefined);
    if (hit) {
      (out as unknown as Record<string, unknown>)[k] = hit[1][k];
      out.sources[k] = hit[0];
    }
  }
  return out;
}

/** Grava campos de `chat` (merge raso) no CONFIG do projeto ou no global, preservando as outras chaves; atômico. */
export function saveChatConfig(target: 'project' | 'global', root: string | undefined, patch: Partial<ChatConfig>, globalFile: string = globalConfigFile()): void {
  if (target === 'project' && !root) throw new ProjectError('NOT_A_PROJECT', 'no project to save the chat config in');
  const file = target === 'project' ? path.join(root!, ASES_DIR, 'CONFIG.json') : globalFile;
  const current: Record<string, unknown> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const chat = { ...((current.chat as Record<string, unknown> | undefined) ?? {}), ...patch };
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ ...current, chat }, null, 2)}\n`);
  renameSync(tmp, file);
  readChat(file); // valida o que foi gravado
}

/** Grava `ui.theme`/`ui.logo` no CONFIG do projeto ou no global (merge raso, atômico); vale na próxima abertura. */
export function saveUiConfig(target: 'project' | 'global', root: string | undefined, patch: { theme?: string; logo?: string }, globalFile: string = globalConfigFile()): void {
  if (target === 'project' && !root) throw new ProjectError('NOT_A_PROJECT', 'no project to save the ui config in');
  const file = target === 'project' ? path.join(root!, ASES_DIR, 'CONFIG.json') : globalFile;
  const current: Record<string, unknown> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ ...current, ui: { ...((current.ui as Record<string, unknown> | undefined) ?? {}), ...patch } }, null, 2)}\n`);
  renameSync(tmp, file);
}

// ---- PHASE-19: Mesa, projetos recentes e autorização única das IAs (só na config PESSOAL, nunca no projeto) ----

/** Mesa/Área de Trabalho: no Windows a do OneDrive quando existe (é para onde o Windows a move), senão ~/Desktop. */
export function desktopDir(platform: string = process.platform, env: Readonly<Record<string, string | undefined>> = process.env, home: string = homedir()): string {
  if (platform === 'win32') {
    for (const base of [env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial]) {
      if (!base) continue;
      for (const name of ['Desktop', 'Área de Trabalho']) if (existsSync(path.join(base, name))) return path.join(base, name);
    }
  }
  return path.join(home, 'Desktop');
}

function readGlobal(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    throw new ProjectError('CONFIG_INVALID', `${file}: ${(err as Error).message}`);
  }
}
function writeGlobal(file: string, patch: Record<string, unknown>): void {
  const cur = readGlobal(file);
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ ...cur, ...patch }, null, 2)}\n`);
  renameSync(tmp, file);
}

/** Lembra um projeto aberto pelo `ases` (o mais novo primeiro, até 5); o `ases-tar` usa o último. */
export function rememberProject(root: string, globalFile: string = globalConfigFile()): void {
  const list = recentProjects(globalFile).filter((p) => p !== root);
  writeGlobal(globalFile, { recentProjects: [root, ...list].slice(0, 5) });
}

export function recentProjects(globalFile: string = globalConfigFile()): string[] {
  const v = readGlobal(globalFile).recentProjects;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** O usuário autorizou, uma vez, o uso das IAs instaladas (conta/cota dele) sem perguntar de novo. Só a config pessoal vale. */
export function consentAllGranted(globalFile: string = globalConfigFile()): boolean {
  return readGlobal(globalFile).aiConsentAll === true;
}

export function setConsentAll(on: boolean, globalFile: string = globalConfigFile()): void {
  writeGlobal(globalFile, { aiConsentAll: on, aiConsentAt: new Date().toISOString() });
}

/** Modelo escolhido para cada IA (`/modelo`), na config pessoal: vale para a principal e para as tarefas. */
export function chosenModels(globalFile: string = globalConfigFile()): Record<string, string> {
  const v = readGlobal(globalFile).models;
  return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '')) : {};
}

export function setChosenModel(provider: string, model: string | null, globalFile: string = globalConfigFile()): void {
  const cur = chosenModels(globalFile);
  if (model) cur[provider] = model;
  else delete cur[provider];
  writeGlobal(globalFile, { models: cur });
}
