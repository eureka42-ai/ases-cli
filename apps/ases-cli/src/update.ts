import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { npmCli } from '@aer/platform-core';

// PHASE-18 §5.9: `ases update` / `/atualizar` instala a versão exata pelo npm-cli.js do próprio Node, sem shell.
// PHASE-28: ao abrir, no máximo uma vez por dia, consulta só o dist-tags.latest (nada do projeto vai junto, AER-REQ-174)
// e, por padrão, instala ao sair (/config atualizacao auto|avisar|off).

const PACKAGE = '@eureka42-ai/aer';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

/** `dist-tags.latest` do pacote. `AER_REGISTRY=file://…` (só testes) lê um JSON local. */
export async function latestVersion(o: { registry?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<string> {
  const registry = o.registry ?? process.env.AER_REGISTRY ?? DEFAULT_REGISTRY;
  let doc: unknown;
  if (registry.startsWith('file://')) doc = JSON.parse(readFileSync(fileURLToPath(registry), 'utf8'));
  else {
    const res = await (o.fetchImpl ?? fetch)(`${registry.replace(/\/$/, '')}/${PACKAGE.replace('/', '%2f')}`, { signal: AbortSignal.timeout(o.timeoutMs ?? 10_000), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`registro npm respondeu ${res.status}`);
    doc = await res.json();
  }
  const v = (doc as { 'dist-tags'?: { latest?: unknown } })['dist-tags']?.latest;
  if (typeof v !== 'string' || !/^\d+\.\d+\.\d+/.test(v)) throw new Error('registro npm sem dist-tags.latest válido');
  return v;
}

/** Instalado por `npm install -g` (o bin fica dentro de node_modules/@eureka42-ai/aer)? */
export const installedFromNpmGlobal = (binPath: string) => /[\\/]node_modules[\\/]@eureka42-ai[\\/]aer[\\/]/.test(binPath);

const newer = (a: string, b: string) => {
  const n = (s: string) => s.split(/[.-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
};

export interface UpdateResult { status: 'UP_TO_DATE' | 'AVAILABLE' | 'UPDATED' | 'REFUSED' | 'FAILED'; from: string; to?: string; message: string }

export async function runUpdate(o: { current: string; check: boolean; running: number; binPath: string; registry?: string; fetchImpl?: typeof fetch; npm?: { cli: string; node: string } }): Promise<UpdateResult> {
  const from = o.current;
  if (!o.check && o.running > 0) return { status: 'REFUSED', from, message: `há ${o.running} tarefa(s) rodando; pare as tarefas antes (/parar)` };
  if (!o.check && !installedFromNpmGlobal(o.binPath)) return { status: 'REFUSED', from, message: `este ases roda do repositório (${o.binPath}), não do npm; atualize com git pull && npm run build` };
  let to: string;
  try {
    to = await latestVersion({ ...(o.registry ? { registry: o.registry } : {}), ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}) });
  } catch (err) {
    return { status: 'FAILED', from, message: `não consegui consultar o npm: ${(err as Error).message}. Nada foi alterado.` };
  }
  if (!newer(to, from)) return { status: 'UP_TO_DATE', from, to, message: `instalada ${from}: já está na versão mais nova` };
  if (o.check) return { status: 'AVAILABLE', from, to, message: `instalada ${from} → disponível ${to}; rode \`ases update\`` };
  const npm = o.npm ?? { cli: npmCli(), node: process.execPath };
  try {
    // --prefer-online: logo após publicar, o cache local do npm ainda não conhece a versão (ETARGET)
    const r = await promisify(execFile)(npm.node, [npm.cli, 'install', '-g', `${PACKAGE}@${to}`, '--prefer-online'], { encoding: 'utf8', timeout: 10 * 60_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    return { status: 'UPDATED', from, to, message: `atualizado: ${from} → ${to}. Feche e abra o ases de novo (o banco do projeto migra com backup).${r.stdout.trim() ? `\n${r.stdout.trim().split('\n').slice(-3).join('\n')}` : ''}` };
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    return { status: 'FAILED', from, to, message: `o npm falhou; nada foi alterado na versão instalada (${from}):\n${(e.stderr ?? e.message).trim().split('\n').slice(-6).join('\n')}` };
  }
}

export type AutoUpdateMode = 'auto' | 'avisar' | 'off';
export const AUTO_UPDATE_MODES: readonly AutoUpdateMode[] = ['auto', 'avisar', 'off'];
const DAY_MS = 24 * 60 * 60_000;

/**
 * Checagem ao abrir. undefined = nada a fazer nem a registrar (desligada, já checou hoje, roda do repositório, sem rede).
 * A instalação fica para a saída: trocar os arquivos do pacote com o ases aberto misturaria módulos de duas versões.
 */
export async function autoUpdateCheck(o: { current: string; binPath: string; mode?: string; checkedAt?: string; now?: number; registry?: string; fetchImpl?: typeof fetch }): Promise<{ checkedAt: string; to?: string; install?: boolean; message?: string } | undefined> {
  const mode = o.mode ?? 'auto';
  if (mode === 'off' || !installedFromNpmGlobal(o.binPath)) return undefined;
  const now = o.now ?? Date.now();
  if (o.checkedAt && now - Date.parse(o.checkedAt) < DAY_MS) return undefined;
  let to: string;
  try {
    to = await latestVersion({ ...(o.registry ? { registry: o.registry } : {}), ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}), timeoutMs: 5_000 });
  } catch {
    return undefined;
  }
  const checkedAt = new Date(now).toISOString();
  if (!newer(to, o.current)) return { checkedAt };
  const install = mode === 'auto';
  return { checkedAt, to, install, message: install ? `Nova versão do AER: ${to} (você tem ${o.current}). Ela é instalada sozinha quando você sair (/sair). Para só avisar: /config atualizacao avisar` : `Nova versão do AER: ${to} (você tem ${o.current}). Atualize com /atualizar` };
}
