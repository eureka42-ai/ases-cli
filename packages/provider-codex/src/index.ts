import { readFileSync } from 'node:fs';
import os from 'node:os';
import {
  PROVIDER_CONTRACT_VERSION, findExecutable, redactText, runAgentProcess, runShort, scopedEnv, versionInRange,
  type AgentProvider, type AgentRunRequest, type AgentStreamEvent, type Capability, type ProcessPlatform, type ProviderAvailability,
  type ProviderCapabilityInfo, type ProviderProbeResult,
} from '@aer/provider-sdk';

/**
 * Adapter do Codex CLI oficial via `codex exec --json` (alternativa documentada do §7.3; o app-server está
 * [experimental] na 0.170.0). Auth: OFFICIAL_CLI_SESSION. Contrato de eventos: VERIFIED só nas versões de CODEX_VERIFIED_VERSIONS (fixture real, TAR-0035); erros ainda pela documentação.
 */
/** Versões com fixture real capturada (TAR-0035, 23/11/2026). */
export const CODEX_VERIFIED_VERSIONS: readonly string[] = ['0.170.0'];
export const CODEX_SUPPORTED = { min: '0.170.0', maxExclusive: '0.171.0', researchedVersion: '0.170.0' } as const;

export interface CodexOptions {
  executable?: string;
  /** argumentos antes dos do CLI (testes: `executable` = node, `prefixArgs` = [falso binário]) */
  prefixArgs?: readonly string[];
  env?: Readonly<Record<string, string | undefined>>;
  probeTimeoutMs?: number;
  graceMs?: number;
}

/**
 * Argumentos do `codex exec`. Nunca `--dangerously-bypass-*`, `danger-full-access` nem `--trust` (persistiria confiança no
 * projeto do usuário). `approval_policy="never"`: sem canal de aprovação, falhas voltam ao modelo em vez de pedir ao humano.
 */
export function codexArgs(req: Pick<AgentRunRequest, 'mode' | 'modelPreference' | 'workingDirectory'>, prompt: string): string[] {
  // a pasta do chat pode não ser Git (ex.: a Mesa): sem esta opção o codex sai com 1 sem dizer nada no stream
  const args = ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '-C', req.workingDirectory, '-s', req.mode === 'READ_ONLY' ? 'read-only' : 'workspace-write', '-c', 'approval_policy="never"'];
  if (req.modelPreference) args.push('-m', req.modelPreference);
  args.push('--', prompt);
  return args;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : undefined);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** shortcut: classificação por texto (a documentação não fixa códigos de erro); trocar pelos campos da fixture real. */
export function classifyCodexError(text: string): string {
  if (/rate.?limit|usage limit|too many requests|\b429\b|quota/i.test(text)) return 'RATE_LIMITED';
  if (/(token|session|login).{0,40}expired|expired.{0,40}(token|session|login)|refresh token/i.test(text)) return 'AUTH_EXPIRED';
  if (/not logged in|codex login|unauthori[sz]ed|\b401\b|invalid api key/i.test(text)) return 'NOT_AUTHENTICATED';
  return 'TASK_FAILED';
}

/** Erro de quando o codex termina sem turn.completed/turn.failed: o motivo é o que ele escreveu no stderr. */
export function codexFinishError(exitCode: number | null, stderrTail: string): { type: 'error'; code: string; userMessage: string } {
  const why = redactText(stderrTail.trim().split('\n').filter(Boolean).slice(-3).join(' '), 400).text;
  return { type: 'error', code: exitCode === 0 ? 'NO_RESULT' : classifyCodexError(stderrTail), userMessage: `codex terminou sem responder (código ${exitCode ?? '?'})${why ? `: ${why}` : ''}` };
}

export interface CodexStreamState {
  turnEnded?: 'completed' | 'failed';
  threadId?: string | undefined;
}

const relativeTo = (cwd: string, file: string) => {
  const norm = (p: string) => p.replaceAll('\\', '/');
  const base = norm(cwd).replace(/\/$/, '');
  return norm(file).startsWith(`${base}/`) ? norm(file).slice(base.length + 1) : file;
};

/** Traduz uma linha JSONL do `codex exec --json` para o contrato do AER. */
export function mapCodexEvent(value: unknown, state: CodexStreamState, cwd: string): AgentStreamEvent[] {
  const v = obj(value);
  if (!v) return [{ type: 'error', code: 'PARSE_ERROR', userMessage: 'JSONL line is not an object' }];
  const type = str(v.type) ?? '';
  switch (type) {
    case 'thread.started':
      state.threadId = str(v.thread_id);
      return [{ type: 'status', status: 'THREAD_STARTED' }];
    case 'turn.started':
      return [{ type: 'status', status: 'TURN_STARTED' }];
    case 'turn.completed': {
      state.turnEnded = 'completed';
      const u = obj(v.usage) ?? {};
      return ([['TOKENS_INPUT', 'input_tokens'], ['TOKENS_CACHE_READ', 'cached_input_tokens'], ['TOKENS_OUTPUT', 'output_tokens']] as const).flatMap(([metric, key]): AgentStreamEvent[] => {
        const n = num(u[key]);
        return n === undefined ? [] : [{ type: 'usage', metric, value: n, unit: 'tokens', source: 'codex exec turn.completed' }];
      });
    }
    case 'turn.failed': {
      state.turnEnded = 'failed';
      const msg = str(obj(v.error)?.message) ?? 'turn failed';
      return [{ type: 'error', code: classifyCodexError(msg), userMessage: redactText(msg, 1000).text }];
    }
    case 'error': {
      const msg = str(v.message) ?? 'error';
      return [{ type: 'error', code: classifyCodexError(msg), userMessage: redactText(msg, 1000).text }];
    }
    case 'item.started':
    case 'item.updated':
    case 'item.completed': {
      const item = obj(v.item);
      if (!item) return [];
      const done = type === 'item.completed';
      switch (str(item.type)) {
        case 'agent_message':
          return done ? [{ type: 'message', text: redactText(str(item.text) ?? '', 8000).text, visibleToUser: true }] : [];
        case 'command_execution':
          // o comando em si não vai para o log (pode conter segredo); só o fato e o resultado
          if (type === 'item.started') return [{ type: 'tool_call', name: 'command_execution', safeArguments: { id: str(item.id) ?? null } }];
          return done ? [{ type: 'tool_result', name: 'command_execution', success: num(item.exit_code) === 0, safeSummary: `exit ${num(item.exit_code) ?? '?'} (${str(item.status) ?? '?'})` }] : [];
        case 'file_change': {
          if (!done) return [];
          const changes = Array.isArray(item.changes) ? item.changes : [];
          return changes.flatMap((c): AgentStreamEvent[] => {
            const ch = obj(c);
            const p = str(ch?.path);
            if (!p) return [];
            const kind = str(ch?.kind) === 'add' ? 'create' : str(ch?.kind) === 'delete' ? 'delete' : 'modify';
            return [{ type: 'file_change', relativePath: relativeTo(cwd, p), kind }];
          });
        }
        case 'mcp_tool_call':
        case 'web_search':
          return type === 'item.started' ? [{ type: 'tool_call', name: str(item.type)!, safeArguments: { id: str(item.id) ?? null } }] : [];
        case 'error':
          return done ? [{ type: 'error', code: classifyCodexError(str(item.message) ?? ''), userMessage: redactText(str(item.message) ?? 'error', 1000).text }] : [];
        default:
          return []; // reasoning, todo_list etc.: não relevantes ao estado da tarefa
      }
    }
    default:
      return [{ type: 'status', status: 'UNRECOGNIZED_EVENT', detail: type.slice(0, 60) || '?' }];
  }
}

export class CodexProvider implements AgentProvider {
  readonly id = 'codex' as const;
  readonly contractVersion = PROVIDER_CONTRACT_VERSION;
  readonly requiresConsent = true;
  private readonly running = new Map<string, number>();
  private readonly platform: ProcessPlatform;
  private readonly o: CodexOptions;

  constructor(platform: ProcessPlatform, o: CodexOptions = {}) {
    this.platform = platform;
    this.o = o;
  }

  private env() {
    return scopedEnv('codex', this.o.env ?? process.env);
  }

  async probe(): Promise<ProviderProbeResult> {
    const checkedAt = new Date().toISOString();
    const exe = this.o.executable ?? findExecutable('codex', this.o.env ?? process.env);
    const doc: Record<Capability, ProviderCapabilityInfo['status']> = {
      headless: 'SUPPORTED', structured_stream: 'CONDITIONAL', file_edit: 'SUPPORTED', interrupt: 'SUPPORTED', usage_tokens: 'CONDITIONAL',
      session_resume: 'NOT_SUPPORTED', tool_approvals: 'NOT_SUPPORTED', mcp: 'UNKNOWN', native_plugins: 'UNKNOWN', skills: 'UNKNOWN',
      subscription_quota: 'UNKNOWN', parallel_sessions: 'CONDITIONAL',
    };
    const caps = (ok: boolean): ProviderCapabilityInfo[] => (Object.keys(doc) as Capability[]).map((id) => ({ id, checkedAt, source: 'OFFICIAL_DOC' as const, status: ok ? doc[id] : 'UNKNOWN' }));
    const base = { providerId: this.id, contractVersion: this.contractVersion, simulated: false, contractStatus: 'UNVERIFIED' as const };
    const fail = (availability: ProviderAvailability, evidence: string[], extra: Partial<ProviderProbeResult> = {}): ProviderProbeResult => ({ ...base, ...extra, availability, capabilities: caps(false), evidence });
    if (!exe) return fail('NOT_INSTALLED', ['codex not found in PATH']);
    const cwd = os.homedir();
    const v = await runShort(this.platform, exe, [...(this.o.prefixArgs ?? []), '--version'], { cwd, env: this.env(), timeoutMs: this.o.probeTimeoutMs ?? 10_000 });
    const version = /(\d+\.\d+\.\d+)/.exec(v.stdout)?.[1];
    if (v.exitCode !== 0 || !version) return fail('UNKNOWN', [`--version ${v.timedOut ? 'TIMEOUT' : `exit ${v.exitCode}`}`], { executable: exe });
    if (!versionInRange(version, CODEX_SUPPORTED.min, CODEX_SUPPORTED.maxExclusive)) {
      return fail('UNSUPPORTED_VERSION', [`version ${version} outside [${CODEX_SUPPORTED.min}, ${CODEX_SUPPORTED.maxExclusive})`], { executable: exe, version });
    }
    const a = await runShort(this.platform, exe, [...(this.o.prefixArgs ?? []), 'login', 'status'], { cwd, env: this.env(), timeoutMs: this.o.probeTimeoutMs ?? 10_000 });
    const said = `${a.stdout}\n${a.stderr}`; // 0.170.0 imprime o status no stderr
    const loggedIn = a.exitCode === 0 && /logged in/i.test(said) && !/not logged in/i.test(said);
    const method = /using (chatgpt|an? api key)/i.exec(said)?.[1] ?? '?';
    const ev = [`--version -> ${version}`, `login status -> exit ${a.exitCode}, loggedIn=${loggedIn}, method=${method}`];
    if (!loggedIn) return fail('NOT_AUTHENTICATED', [...ev, 'run `codex login` yourself; the AER never logs in for you'], { executable: exe, version });
    // VERIFIED só para a versão exata cuja saída real foi capturada e versionada (test/fixtures/real-*, TAR-0035)
    const contractStatus = CODEX_VERIFIED_VERSIONS.includes(version) ? 'VERIFIED' as const : 'UNVERIFIED' as const;
    return { ...base, contractStatus, executable: exe, version, availability: 'READY', capabilities: caps(true), evidence: ev };
  }

  async *start(req: AgentRunRequest): AsyncGenerator<AgentStreamEvent> {
    const probe = await this.probe();
    if (probe.availability !== 'READY' || !probe.executable) {
      yield { type: 'error', code: probe.availability, userMessage: `codex ${probe.availability}: ${probe.evidence.join('; ')}` };
      yield { type: 'exit', exitCode: null, signal: null, cancelled: false, reconciled: true };
      return;
    }
    const state: CodexStreamState = {};
    try {
      yield* runAgentProcess(this.platform, {
        command: probe.executable, args: [...(this.o.prefixArgs ?? []), ...codexArgs(req, readFileSync(req.instructionsFile, 'utf8'))], cwd: req.workingDirectory, env: this.env(),
        timeoutMs: req.timeoutMs, signal: req.signal, ...(this.o.graceMs === undefined ? {} : { graceMs: this.o.graceMs }),
        map: (v) => mapCodexEvent(v, state, req.workingDirectory),
        onSpawn: (pid) => this.running.set(req.attemptId, pid),
        finish: ({ exitCode, stderrTail }) => (state.turnEnded ? [] : [codexFinishError(exitCode, stderrTail)]),
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
