import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ManifestSchema, VERSIONS, type Manifest } from '@aer/contracts';
import { detectPlatform, writePrivateFile, type LocalIpcEndpoint, type PlatformAdapter } from '@aer/platform-core';

export const ASES_DIR = '.ases';
export const paths = (root: string) => {
  const A = path.join(root, ASES_DIR);
  return { ases: A, manifest: path.join(A, 'MANIFEST.json'), dbDir: path.join(A, 'db'), db: path.join(A, 'db', 'ases.sqlite'), history: path.join(A, 'HISTORY.jsonl') };
};

export class ProjectError extends Error {
  readonly code: 'NOT_A_PROJECT' | 'INTERIM_PROJECT' | 'INVALID_MANIFEST' | 'ENGINE_NOT_RUNNING';
  constructor(code: ProjectError['code'], message: string) {
    super(message);
    this.name = 'ProjectError';
    this.code = code;
  }
}

/** Carrega só o adapter do SO atual (§3.6). */
export async function loadPlatformAdapter(platform: string = process.platform): Promise<PlatformAdapter> {
  switch (detectPlatform(platform)) {
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
  const h = paths(root).history;
  if (!existsSync(h)) return false;
  const first = readFileSync(h, 'utf8').split('\n', 1)[0];
  return Boolean(first && (JSON.parse(first) as { actor?: string }).actor === 'ases-dev-interim');
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
  writeIfAbsent(path.join(p.ases, '.gitignore'), '# estado privado (MD mestre §4.3)\ndb/\nipc/\nruntime/\nlocks/\n', created, root);
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
