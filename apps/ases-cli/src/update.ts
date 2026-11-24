import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { npmCli } from '@aer/platform-core';

// PHASE-18 §5.9: `ases update` / `/atualizar`. Só consulta o registro quando o usuário pede (sem checagem automática
// nem telemetria, AER-REQ-174) e instala a versão exata pelo npm-cli.js do próprio Node, sem shell.

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
    const r = await promisify(execFile)(npm.node, [npm.cli, 'install', '-g', `${PACKAGE}@${to}`], { encoding: 'utf8', timeout: 10 * 60_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    return { status: 'UPDATED', from, to, message: `atualizado: ${from} → ${to}. Feche e abra o ases de novo (o banco do projeto migra com backup).${r.stdout.trim() ? `\n${r.stdout.trim().split('\n').slice(-3).join('\n')}` : ''}` };
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    return { status: 'FAILED', from, to, message: `o npm falhou; nada foi alterado na versão instalada (${from}):\n${(e.stderr ?? e.message).trim().split('\n').slice(-6).join('\n')}` };
  }
}
