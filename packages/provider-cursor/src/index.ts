import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PROVIDER_CONTRACT_VERSION, findExecutable, redactText, runAgentProcess, runShort, scopedEnv, versionInRange,
  type AgentProvider, type AgentRunRequest, type AgentStreamEvent, type Capability, type ProcessPlatform, type ProviderAvailability,
  type ProviderCapabilityInfo, type ProviderProbeResult,
} from '@aer/provider-sdk';

/**
 * Adapter do Cursor CLI oficial (`cursor-agent -p --output-format stream-json`), PHASE-21.
 * Formato dos eventos pela documentação (cursor.com/docs/cli/reference/output-format, 24/11/2026): system/init, user,
 * assistant, tool_call (started/completed, correlacionados por call_id) e result. Contrato UNVERIFIED até um smoke real
 * com login; eventos desconhecidos são ignorados (o fórum relata eventos não documentados de reconexão).
 *
 * Segurança: no modo -p o Cursor "tem acesso a todas as ferramentas, inclusive shell". O AER não deixa agente usar shell:
 * `--sandbox enabled`, nunca `--force`/`--yolo`, e qualquer ferramenta de shell vira SECURITY_VIOLATION (o worker aborta).
 */
export const CURSOR_VERIFIED_VERSIONS: readonly string[] = [];
export const CURSOR_SUPPORTED = { min: '2026.11.0', maxExclusive: '2026.12.0', researchedVersion: '2026.11.19' } as const;

export interface CursorOptions {
  executable?: string;
  /** argumentos antes dos do CLI (testes: `executable` = node, `prefixArgs` = [falso binário]) */
  prefixArgs?: readonly string[];
  env?: Readonly<Record<string, string | undefined>>;
  probeTimeoutMs?: number;
  graceMs?: number;
}

/** `--trust`: só modo headless, sem pergunta; `--mode ask` = somente leitura (revisão). */
export function cursorArgs(req: Pick<AgentRunRequest, 'mode' | 'modelPreference' | 'workingDirectory'>, prompt: string): string[] {
  const args = ['-p', '--output-format', 'stream-json', '--sandbox', 'enabled', '--trust', '--workspace', req.workingDirectory];
  if (req.mode === 'READ_ONLY') args.push('--mode', 'ask');
  if (req.modelPreference) args.push('--model', req.modelPreference);
  args.push(prompt);
  return args;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : undefined);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

export function classifyCursorError(text: string): string {
  if (/rate.?limit|usage limit|too many requests|\b429\b|quota/i.test(text)) return 'RATE_LIMITED';
  if (/expired/i.test(text) && /(token|session|login|auth)/i.test(text)) return 'AUTH_EXPIRED';
  if (/authentication required|not logged in|agent login|unauthori[sz]ed|\b401\b|invalid api key/i.test(text)) return 'NOT_AUTHENTICATED';
  return 'TASK_FAILED';
}

/** Quando o processo termina sem o evento `result`: o motivo é o que o Cursor escreveu no stderr. */
export function cursorFinishError(exitCode: number | null, stderrTail: string): { type: 'error'; code: string; userMessage: string } {
  const why = redactText(stderrTail.trim().split('\n').filter(Boolean).slice(-3).join(' '), 400).text;
  return { type: 'error', code: exitCode === 0 ? 'NO_RESULT' : classifyCursorError(stderrTail), userMessage: `cursor terminou sem responder (código ${exitCode ?? '?'})${why ? `: ${why}` : ''}` };
}

export interface CursorStreamState { done?: 'success' | 'error' }

const SHELL_TOOL = /shell|bash|terminal|command|exec|run_?cmd/i;
const toolName = (key: string) => {
  const base = key.replace(/ToolCall$/, '');
  return base.charAt(0).toUpperCase() + base.slice(1);
};
const insideDir = (dir: string, p: string) => {
  const r = path.relative(dir, p);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};
const rel = (cwd: string, p: string) => {
  const r = path.isAbsolute(p) ? path.relative(cwd, p) : p;
  return r.split(path.sep).join('/');
};

/** Um evento NDJSON do Cursor → eventos normalizados do AER. Só caminhos vão para os argumentos (nunca o conteúdo). */
export function mapCursorEvent(v: unknown, state: CursorStreamState, cwd: string): AgentStreamEvent[] {
  const e = obj(v);
  if (!e) return [];
  switch (e.type) {
    case 'system':
      return e.subtype === 'init' ? [{ type: 'status', status: 'INIT', detail: (str(e.model) ?? '').slice(0, 100) }] : [];
    case 'assistant': {
      const content = (obj(e.message)?.content as unknown[] | undefined) ?? [];
      const text = content.map((c) => (obj(c)?.type === 'text' ? str(obj(c)?.text) ?? '' : '')).join('');
      return text ? [{ type: 'message', text, visibleToUser: true }] : [];
    }
    case 'tool_call': {
      const tc = obj(e.tool_call) ?? {};
      const [key = '', body] = Object.entries(tc)[0] ?? [];
      const b = obj(body) ?? {};
      const fnName = key === 'function' ? str(b.name) ?? 'function' : key;
      // shell nunca: nem por chave (shellToolCall) nem pelo nome da função (run_terminal_cmd)
      if (SHELL_TOOL.test(fnName)) return [{ type: 'error', code: 'SECURITY_VIOLATION', userMessage: `o cursor tentou usar o shell (${fnName}); o AER não permite shell para agentes` }];
      const name = key === 'function' ? fnName : toolName(key);
      const args = obj(b.args) ?? {};
      const p = str(args.path);
      // smoke real (25/11/2026): o Cursor leu sozinho uma "skill" em ~/.claude. Nada fora da pasta do projeto.
      if (e.subtype === 'started' && p && path.isAbsolute(p) && !insideDir(cwd, p)) {
        return [{ type: 'error', code: 'SECURITY_VIOLATION', userMessage: `o cursor tentou acessar um arquivo fora da pasta do projeto (${redactText(p, 200).text})` }];
      }
      if (e.subtype === 'started') return [{ type: 'tool_call', name, safeArguments: p ? { path: rel(cwd, p) } : {} }];
      if (e.subtype === 'completed') {
        const success = obj(obj(b.result)?.success);
        if (!success) return [{ type: 'tool_result', name, success: false, safeSummary: redactText(JSON.stringify(obj(b.result)?.error ?? 'falhou'), 300).text }];
        if (key === 'writeToolCall' || key === 'editToolCall') {
          const file = str(success.path) ?? p ?? '';
          const r = rel(cwd, file);
          return [{ type: 'file_change', relativePath: r, kind: 'modify' }, { type: 'tool_result', name, success: true, safeSummary: `${r}${typeof success.linesCreated === 'number' ? ` (${success.linesCreated} linhas)` : ''}` }];
        }
        return [{ type: 'tool_result', name, success: true, safeSummary: p ?? name }];
      }
      return [];
    }
    case 'result':
      if (e.is_error === true || (e.subtype !== undefined && e.subtype !== 'success')) {
        state.done = 'error';
        const msg = redactText(str(e.result) ?? 'erro do cursor', 1000).text;
        return [{ type: 'error', code: classifyCursorError(msg), userMessage: msg }];
      }
      state.done = 'success';
      return [];
    default:
      return []; // user, reconnecting/reconnected e outros não documentados
  }
}

export class CursorProvider implements AgentProvider {
  readonly id = 'cursor' as const;
  readonly contractVersion = PROVIDER_CONTRACT_VERSION;
  readonly requiresConsent = true;
  private readonly running = new Map<string, number>();
  private readonly platform: ProcessPlatform;
  private readonly o: CursorOptions;

  constructor(platform: ProcessPlatform, o: CursorOptions = {}) {
    this.platform = platform;
    this.o = o;
  }

  private env() {
    return scopedEnv('cursor', this.o.env ?? process.env);
  }

  async probe(): Promise<ProviderProbeResult> {
    const checkedAt = new Date().toISOString();
    const exe = this.o.executable ?? findExecutable('cursor-agent', this.o.env ?? process.env);
    const doc: Record<Capability, ProviderCapabilityInfo['status']> = {
      headless: 'SUPPORTED', structured_stream: 'CONDITIONAL', file_edit: 'SUPPORTED', interrupt: 'SUPPORTED', usage_tokens: 'NOT_SUPPORTED',
      session_resume: 'NOT_SUPPORTED', tool_approvals: 'NOT_SUPPORTED', mcp: 'NOT_SUPPORTED', native_plugins: 'UNKNOWN', skills: 'UNKNOWN',
      subscription_quota: 'UNKNOWN', parallel_sessions: 'CONDITIONAL',
    };
    const caps = (ok: boolean): ProviderCapabilityInfo[] => (Object.keys(doc) as Capability[]).map((id) => ({ id, checkedAt, source: 'OFFICIAL_DOC' as const, status: ok ? doc[id] : 'UNKNOWN' }));
    const base = { providerId: this.id, contractVersion: this.contractVersion, simulated: false, contractStatus: 'UNVERIFIED' as const };
    const fail = (availability: ProviderAvailability, evidence: string[], extra: Partial<ProviderProbeResult> = {}): ProviderProbeResult => ({ ...base, ...extra, availability, capabilities: caps(false), evidence });
    if (!exe) return fail('NOT_INSTALLED', ['cursor-agent not found in PATH']);
    const pre = this.o.prefixArgs ?? [];
    const v = await runShort(this.platform, exe, [...pre, '--version'], { cwd: os.homedir(), env: this.env(), timeoutMs: this.o.probeTimeoutMs ?? 15_000 });
    const version = /(\d{4}\.\d+\.\d+)/.exec(v.stdout)?.[1];
    if (v.exitCode !== 0 || !version) return fail('UNKNOWN', [`--version ${v.timedOut ? 'TIMEOUT' : `exit ${v.exitCode}`}`], { executable: exe });
    if (!versionInRange(version, CURSOR_SUPPORTED.min, CURSOR_SUPPORTED.maxExclusive)) return fail('UNSUPPORTED_VERSION', [`version ${version} outside [${CURSOR_SUPPORTED.min}, ${CURSOR_SUPPORTED.maxExclusive})`], { executable: exe, version });
    // status de login pelo comando oficial; o e-mail da conta nunca vai para a evidência
    const a = await runShort(this.platform, exe, [...pre, 'status'], { cwd: os.homedir(), env: this.env(), timeoutMs: this.o.probeTimeoutMs ?? 15_000 });
    const said = `${a.stdout}\n${a.stderr}`;
    const loggedIn = a.exitCode === 0 && !/not logged in|authentication required|not authenticated/i.test(said) && /logged in|authenticated/i.test(said);
    const ev = [`--version -> ${version}`, `status -> exit ${a.exitCode}, loggedIn=${loggedIn}`];
    if (!loggedIn) return fail('NOT_AUTHENTICATED', [...ev, 'run `cursor-agent login` yourself; the AER never logs in for you'], { executable: exe, version });
    const contractStatus = CURSOR_VERIFIED_VERSIONS.includes(version) ? 'VERIFIED' as const : 'UNVERIFIED' as const;
    return { ...base, contractStatus, executable: exe, version, availability: 'READY', capabilities: caps(true), evidence: ev };
  }

  async *start(req: AgentRunRequest): AsyncGenerator<AgentStreamEvent> {
    const probe = await this.probe();
    if (probe.availability !== 'READY' || !probe.executable) {
      yield { type: 'error', code: probe.availability, userMessage: `cursor ${probe.availability}: ${probe.evidence.join('; ')}` };
      yield { type: 'exit', exitCode: null, signal: null, cancelled: false, reconciled: true };
      return;
    }
    const state: CursorStreamState = {};
    try {
      yield* runAgentProcess(this.platform, {
        command: probe.executable, args: [...(this.o.prefixArgs ?? []), ...cursorArgs(req, readFileSync(req.instructionsFile, 'utf8'))], cwd: req.workingDirectory, env: this.env(),
        timeoutMs: req.timeoutMs, signal: req.signal, ...(this.o.graceMs === undefined ? {} : { graceMs: this.o.graceMs }),
        map: (v) => mapCursorEvent(v, state, req.workingDirectory),
        onSpawn: (pid) => this.running.set(req.attemptId, pid),
        finish: ({ exitCode, stderrTail }) => (state.done ? [] : [cursorFinishError(exitCode, stderrTail)]),
      });
    } finally {
      this.running.delete(req.attemptId);
    }
  }

  async cancel(attemptId: string): Promise<void> {
    const pid = this.running.get(attemptId);
    if (pid !== undefined) await this.platform.terminateProcessTree(pid, this.o.graceMs === undefined ? {} : { graceMs: this.o.graceMs });
  }
}
