import { accessSync, constants, statSync } from 'node:fs';
import path from 'node:path';
import type { PlatformAdapter } from '@aer/platform-core';
import { redactText } from './redact.ts';
import { NdjsonDecoder } from './stream.ts';
import type { AgentStreamEvent } from './types.ts';

export type ProcessPlatform = Pick<PlatformAdapter, 'id' | 'spawnManagedProcess' | 'terminateProcessTree'>;

export interface AgentProcessOptions {
  command: string;
  args: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string | undefined>>;
  timeoutMs: number;
  signal: AbortSignal;
  graceMs?: number;
  /** traduz um objeto JSON do agente para zero ou mais eventos do contrato */
  map: (value: unknown) => AgentStreamEvent[];
  /** eventos extras depois que o stdout fecha (p.ex. "faltou o resultado final"), com o fim do stderr redigido */
  finish?: (ctx: { exitCode: number | null; stderrTail: string }) => AgentStreamEvent[];
  onSpawn?: (pid: number) => void;
  /**
   * Protocolos bidirecionais (ACP): recebe o canal de escrita no stdin do agente. `end()` fecha o stdin e, se o agente
   * não sair sozinho em `graceMs` (padrão 3 s), encerra a árvore — isso conta como fim normal, não como cancelamento.
   */
  stdin?: (io: { write: (line: string) => void; end: () => void }) => void;
  /** teto de bytes TOTAIS de stdout (padrão 64 MiB); ao passar, a árvore é encerrada com OUTPUT_LIMIT (AER-REQ-171) */
  maxOutputBytes?: number;
}

export const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

const STDERR_TAIL = 2000;

/**
 * Roda um agente como subprocesso gerenciado e devolve o stream normalizado (§7.6): NDJSON incremental, linha inválida =
 * PARSE_ERROR, timeout/cancelamento encerram a árvore, e o `exit` final é sintetizado aqui com o código real e a
 * confirmação de que nenhum processo do grupo sobrou (AER-REQ-105/106).
 */
export async function* runAgentProcess(platform: ProcessPlatform, o: AgentProcessOptions): AsyncGenerator<AgentStreamEvent> {
  const p = platform.spawnManagedProcess(o.command, o.args, { cwd: o.cwd, ...(o.env ? { env: o.env } : {}), ...(o.stdin ? { stdin: 'pipe' as const } : {}) });
  o.onSpawn?.(p.pid);
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let stderr = '';
  p.child.stderr.on('data', (d: Buffer) => {
    stderr = (stderr + d.toString('utf8')).slice(-STDERR_TAIL);
  });
  let timedOut = false;
  let cancelled = false;
  const kill = () => void platform.terminateProcessTree(p.pid, o.graceMs === undefined ? {} : { graceMs: o.graceMs });
  const onAbort = () => {
    cancelled = true;
    kill();
  };
  o.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    kill();
  }, o.timeoutMs);
  const input = p.child.stdin;
  if (o.stdin && input) {
    input.on('error', () => undefined); // EPIPE quando o agente já saiu: o resultado vem do exit
    o.stdin({
      write: (line) => {
        if (!input.destroyed && input.writable) input.write(line.endsWith('\n') ? line : `${line}\n`);
      },
      end: () => {
        if (!input.destroyed) input.end();
        endTimer ??= setTimeout(kill, o.graceMs ?? 3000);
      },
    });
  }
  const lines = (decoded: ReturnType<NdjsonDecoder['push']>): AgentStreamEvent[] =>
    decoded.flatMap((l) => (l.ok ? o.map(l.value) : [{ type: 'error', code: 'PARSE_ERROR', userMessage: `${l.code}: ${l.detail}` } as AgentStreamEvent]));
  try {
    const decoder = new NdjsonDecoder();
    const max = o.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    let total = 0;
    let overflow = false;
    for await (const chunk of p.child.stdout) {
      total += (chunk as Buffer).length;
      if (total > max) {
        overflow = true;
        kill();
        break;
      }
      yield* lines(decoder.push(chunk as Buffer));
    }
    if (!overflow) yield* lines(decoder.end());
    const r = await p.exited;
    if (overflow) yield { type: 'error', code: 'OUTPUT_LIMIT', userMessage: `agent wrote more than ${max} bytes to stdout and was terminated` };
    if (timedOut) yield { type: 'error', code: 'TIMEOUT', userMessage: `agent exceeded ${o.timeoutMs} ms and was terminated` };
    const stderrTail = redactText(stderr, STDERR_TAIL).text;
    if (!cancelled && !timedOut && !overflow) yield* o.finish?.({ exitCode: r.exitCode, stderrTail }) ?? [];
    if (r.exitCode !== 0 && stderrTail.trim()) yield { type: 'status', status: 'STDERR_TAIL', detail: stderrTail.trim() };
    // reconciliação: mesmo após saída normal, nenhum neto pode sobrar no grupo
    const t = await platform.terminateProcessTree(p.pid, { graceMs: 200 });
    yield { type: 'exit', exitCode: r.exitCode, signal: r.signal, cancelled, reconciled: t.terminated };
  } finally {
    clearTimeout(timer);
    if (endTimer) clearTimeout(endTimer);
    o.signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Procura um executável no PATH sem shell (§7.4). No Windows tenta as extensões de PATHEXT.
 * Devolve o caminho absoluto ou undefined (NOT_INSTALLED).
 */
export function findExecutable(name: string, env: Readonly<Record<string, string | undefined>> = process.env, platform: string = process.platform): string | undefined {
  const exts = platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean) : [''];
  const sep = platform === 'win32' ? ';' : ':';
  // 1.4.0: além do PATH, as pastas por usuário onde os instaladores oficiais põem as CLIs (o PATH delas costuma vir só
  // do ~/.bashrc, e um terminal aberto por outro programa pode não ter): ~/.local/bin (claude, agy), ~/.opencode/bin
  const home = env.HOME ?? env.USERPROFILE;
  const extra = platform === 'win32' || !home ? [] : [path.join(home, '.local', 'bin'), path.join(home, '.opencode', 'bin')];
  for (const dir of [...(env.PATH ?? env.Path ?? '').split(sep).filter(Boolean), ...extra]) {
    for (const ext of exts) {
      const full = path.join(dir, name + ext.toLowerCase());
      try {
        if (!statSync(full).isFile()) continue;
        if (platform !== 'win32') accessSync(full, constants.X_OK);
        return full;
      } catch {
        // ausente ou sem permissão de execução: segue procurando
      }
    }
  }
  return undefined;
}

// variáveis de credencial de CADA provider; um adapter só recebe as suas (AER-REQ-117/127)
const CREDENTIAL_PREFIXES: Record<string, readonly string[]> = {
  claude: ['ANTHROPIC_', 'CLAUDE_CODE_OAUTH', 'CLAUDE_API'],
  codex: ['OPENAI_', 'CODEX_', 'AZURE_OPENAI_'],
  google: ['GEMINI_', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_', 'GOOGLE_APPLICATION_CREDENTIALS'],
  kimi: ['MOONSHOT_', 'KIMI_'],
  opencode: ['OPENCODE_'],
  cursor: ['CURSOR_'],
};

/** Ambiente do subprocesso sem as credenciais dos OUTROS providers (nem do próprio AER). */
export function scopedEnv(providerId: string, env: Readonly<Record<string, string | undefined>> = process.env): Record<string, string | undefined> {
  const foreign = Object.entries(CREDENTIAL_PREFIXES).filter(([id]) => id !== providerId).flatMap(([, p]) => p);
  return Object.fromEntries(Object.entries(env).filter(([k]) => !foreign.some((p) => k.toUpperCase().startsWith(p)) && !k.startsWith('ASES_')));
}

/** `2.1.330` dentro de [min, maxExclusive) por comparação numérica de major.minor.patch. */
export function versionInRange(v: string, min: string, maxExclusive: string): boolean {
  const n = (s: string) => s.split('.').map((x) => Number.parseInt(x, 10) || 0);
  const cmp = (a: number[], b: number[]) => (a[0]! - b[0]!) || (a[1]! - b[1]!) || ((a[2] ?? 0) - (b[2] ?? 0));
  return cmp(n(v), n(min)) >= 0 && cmp(n(v), n(maxExclusive)) < 0;
}

/** Comando curto e sem efeito colateral para probes (`--version`, status de login), com timeout e saída limitada. */
export async function runShort(platform: ProcessPlatform, command: string, args: readonly string[], o: { cwd: string; env?: Readonly<Record<string, string | undefined>>; timeoutMs?: number }): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  let p;
  try {
    p = platform.spawnManagedProcess(command, args, { cwd: o.cwd, ...(o.env ? { env: o.env } : {}) });
  } catch {
    return { exitCode: null, stdout: '', stderr: '', timedOut: false };
  }
  let stdout = '';
  let stderr = '';
  p.child.stdout.on('data', (d: Buffer) => {
    if (stdout.length < 64 * 1024) stdout += d.toString('utf8');
  });
  // alguns clientes escrevem o status no stderr (codex login status 0.170.0, verificado em 23/11/2026)
  p.child.stderr.on('data', (d: Buffer) => {
    if (stderr.length < 64 * 1024) stderr += d.toString('utf8');
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void platform.terminateProcessTree(p.pid, { graceMs: 100 });
  }, o.timeoutMs ?? 10_000);
  try {
    const r = await p.exited;
    return { exitCode: r.exitCode, stdout, stderr, timedOut };
  } catch {
    return { exitCode: null, stdout, stderr, timedOut };
  } finally {
    clearTimeout(timer);
  }
}
