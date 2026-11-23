import os from 'node:os';
import {
  PROVIDER_CONTRACT_VERSION, findExecutable, redactText, runAgentProcess, runShort, scopedEnv, versionInRange,
  type AgentProvider, type AgentRunRequest, type AgentStreamEvent, type Capability, type ProcessPlatform, type ProviderAvailability,
  type ProviderCapabilityInfo, type ProviderProbeResult,
} from '@aer/provider-sdk';

/**
 * Adapter do Claude Code oficial em modo programático (§7.3, docs/PROVIDERS_PESQUISA.md).
 * Auth: OFFICIAL_CLI_SESSION — o login é do próprio cliente; o AER nunca lê, copia ou intercepta tokens (AER-REQ-121/126).
 * Contrato de eventos: UNVERIFIED até haver fixture real capturada desta versão (TAR-0035).
 */
export const CLAUDE_SUPPORTED = { min: '2.1.0', maxExclusive: '2.2.0', researchedVersion: '2.1.330' } as const;

export interface ClaudeOptions {
  /** caminho do binário; padrão: `claude` no PATH */
  executable?: string;
  /** argumentos antes dos do CLI (testes: `executable` = node, `prefixArgs` = [falso binário]) */
  prefixArgs?: readonly string[];
  env?: Readonly<Record<string, string | undefined>>;
  probeTimeoutMs?: number;
  graceMs?: number;
}

/**
 * Argumentos do `claude -p`. Nunca `--dangerously-skip-permissions`/`bypassPermissions` nem `--bare` (que só aceita
 * API key). `--restricted` tira as ferramentas que executam código e prende as de arquivo à worktree;
 * `--permission-prompts none` nega tudo o que pediria aprovação (não há canal de aprovação até a PHASE-10).
 */
export function claudeArgs(req: Pick<AgentRunRequest, 'mode' | 'modelPreference'>, prompt: string): string[] {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--strict-mcp-config', '--restricted', '--permission-prompts', 'none'];
  if (req.mode === 'READ_ONLY') args.push('--permission-mode', 'plan', '--tools', 'Read,Grep,Glob');
  else args.push('--permission-mode', 'acceptEdits');
  if (req.modelPreference) args.push('--model', req.modelPreference);
  return args;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : undefined);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Ferramentas que alteram arquivo → file_change (o worker valida o caminho dentro da worktree). */
const EDIT_TOOLS: Record<string, 'create' | 'modify'> = { Write: 'create', Edit: 'modify', MultiEdit: 'modify', NotebookEdit: 'modify' };

/**
 * Classifica erro de autenticação/limite pelo texto. shortcut: heurística por texto (a documentação não fixa códigos);
 * trocar pelos campos estruturados assim que a fixture real mostrar quais existem.
 */
export function classifyClaudeError(text: string): string {
  if (/rate.?limit|usage limit|limit (reached|exceeded)|too many requests|\b429\b/i.test(text)) return 'RATE_LIMITED';
  if (/(token|session|login|oauth).{0,40}expired|expired.{0,40}(token|session|login)/i.test(text)) return 'AUTH_EXPIRED';
  if (/not (logged|signed) in|please run \/login|invalid api key|authentication|unauthori[sz]ed|\b401\b/i.test(text)) return 'NOT_AUTHENTICATED';
  return 'TASK_FAILED';
}

export interface ClaudeStreamState {
  result?: { isError: boolean; subtype: string };
  sessionId?: string | undefined;
}

/** Traduz uma linha do stream-json do Claude Code para o contrato do AER. Tipo desconhecido não falha (o vendor adiciona tipos). */
export function mapClaudeEvent(value: unknown, state: ClaudeStreamState, cwd: string): AgentStreamEvent[] {
  const v = obj(value);
  if (!v) return [{ type: 'error', code: 'PARSE_ERROR', userMessage: 'stream-json line is not an object' }];
  const type = str(v.type);
  const subtype = str(v.subtype);
  switch (type) {
    case 'system':
      if (subtype === 'init') {
        state.sessionId = str(v.session_id);
        return [{ type: 'status', status: 'INIT', detail: `model ${str(v.model) ?? '?'}` }];
      }
      if (subtype === 'permission_denied') return [{ type: 'status', status: 'PERMISSION_DENIED', detail: redactText(JSON.stringify(v.tool_name ?? v.tool ?? ''), 200).text }];
      return [{ type: 'status', status: `SYSTEM_${(subtype ?? 'unknown').toUpperCase()}`.slice(0, 100) }];
    case 'assistant':
    case 'user': {
      const content = obj(v.message)?.content;
      if (!Array.isArray(content)) return [];
      return content.flatMap((b): AgentStreamEvent[] => {
        const block = obj(b);
        if (!block) return [];
        if (block.type === 'text' && type === 'assistant') return [{ type: 'message', text: redactText(str(block.text) ?? '', 8000).text, visibleToUser: true }];
        if (block.type === 'tool_use') {
          const name = str(block.name) ?? 'unknown';
          const input = obj(block.input) ?? {};
          // só chaves e o caminho: conteúdo de arquivo e comandos não vão para o log (§12.2)
          const safe = { keys: Object.keys(input), ...(str(input.file_path) ? { file_path: str(input.file_path) } : {}) };
          const out: AgentStreamEvent[] = [{ type: 'tool_call', name, safeArguments: safe }];
          const kind = EDIT_TOOLS[name];
          const file = str(input.file_path) ?? str(input.notebook_path);
          if (kind && file) out.push({ type: 'file_change', relativePath: relativeTo(cwd, file), kind });
          return out;
        }
        if (block.type === 'tool_result') {
          const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
          return [{ type: 'tool_result', name: str(block.tool_use_id) ?? 'tool', success: block.is_error !== true, safeSummary: redactText(text, 300).text }];
        }
        return [];
      });
    }
    case 'result': {
      const isError = v.is_error === true || (subtype !== undefined && subtype !== 'success');
      state.result = { isError, subtype: subtype ?? '?' };
      const usage = obj(v.usage) ?? {};
      const out: AgentStreamEvent[] = [];
      for (const [metric, key] of [['TOKENS_INPUT', 'input_tokens'], ['TOKENS_OUTPUT', 'output_tokens'], ['TOKENS_CACHE_READ', 'cache_read_input_tokens'], ['TOKENS_CACHE_WRITE', 'cache_creation_input_tokens']] as const) {
        const n = num(usage[key]);
        if (n !== undefined) out.push({ type: 'usage', metric, value: n, unit: 'tokens', source: 'claude stream-json result' });
      }
      // total_cost_usd não é registrado: em assinatura não é cobrança real (§8.1, API_SPEND só com cobrança efetiva)
      if (isError) {
        const text = str(v.result) ?? (Array.isArray(v.errors) ? JSON.stringify(v.errors) : subtype ?? 'error');
        out.push({ type: 'error', code: subtype === 'error_max_turns' ? 'MAX_TURNS' : classifyClaudeError(text), userMessage: redactText(text, 1000).text });
      }
      return out;
    }
    case 'stream_event':
      return [];
    default:
      return [{ type: 'status', status: 'UNRECOGNIZED_EVENT', detail: (type ?? '?').slice(0, 60) }];
  }
}

function relativeTo(cwd: string, file: string): string {
  // caminho absoluto dentro da worktree vira relativo; fora dela continua absoluto e o worker recusa (PATH_ESCAPE)
  const norm = (p: string) => p.replaceAll('\\', '/');
  const base = norm(cwd).replace(/\/$/, '');
  const f = norm(file);
  return f.startsWith(`${base}/`) ? f.slice(base.length + 1) : file;
}

export class ClaudeCodeProvider implements AgentProvider {
  readonly id = 'claude' as const;
  readonly contractVersion = PROVIDER_CONTRACT_VERSION;
  readonly requiresConsent = true;
  private readonly running = new Map<string, number>();
  private readonly platform: ProcessPlatform;
  private readonly o: ClaudeOptions;

  constructor(platform: ProcessPlatform, o: ClaudeOptions = {}) {
    this.platform = platform;
    this.o = o;
  }

  private env() {
    return scopedEnv('claude', this.o.env ?? process.env);
  }

  async probe(): Promise<ProviderProbeResult> {
    const checkedAt = new Date().toISOString();
    const exe = this.o.executable ?? findExecutable('claude', this.o.env ?? process.env);
    const doc: Record<Capability, ProviderCapabilityInfo['status']> = {
      headless: 'SUPPORTED', structured_stream: 'CONDITIONAL', file_edit: 'SUPPORTED', interrupt: 'SUPPORTED', usage_tokens: 'CONDITIONAL',
      session_resume: 'NOT_SUPPORTED', tool_approvals: 'NOT_SUPPORTED', mcp: 'NOT_SUPPORTED', native_plugins: 'NOT_SUPPORTED', skills: 'UNKNOWN',
      subscription_quota: 'UNKNOWN', parallel_sessions: 'CONDITIONAL',
    };
    const notes: Partial<Record<Capability, string>> = {
      structured_stream: 'stream-json documentado; fixture real desta versão pendente (UNVERIFIED)',
      tool_approvals: 'desligado pelo AER nesta fase (--permission-prompts none)',
      session_resume: 'desligado pelo AER nesta fase (--no-session-persistence)',
      mcp: 'desligado pelo AER nesta fase (--strict-mcp-config)',
      parallel_sessions: 'limite 1 por padrão (termos de uso individual, docs/PROVIDERS_PESQUISA.md)',
    };
    const caps = (ok: boolean): ProviderCapabilityInfo[] => (Object.keys(doc) as Capability[]).map((id) => ({
      id, checkedAt, source: 'OFFICIAL_DOC' as const, status: ok ? doc[id] : 'UNKNOWN', ...(notes[id] ? { notes: notes[id] } : {}),
    }));
    const base = { providerId: this.id, contractVersion: this.contractVersion, simulated: false, contractStatus: 'UNVERIFIED' as const };
    const fail = (availability: ProviderAvailability, evidence: string[], extra: Partial<ProviderProbeResult> = {}): ProviderProbeResult => ({ ...base, ...extra, availability, capabilities: caps(false), evidence });
    if (!exe) return fail('NOT_INSTALLED', ['claude not found in PATH']);
    const cwd = os.homedir();
    const v = await runShort(this.platform, exe, [...(this.o.prefixArgs ?? []), '--version'], { cwd, env: this.env(), timeoutMs: this.o.probeTimeoutMs ?? 10_000 });
    const version = /(\d+\.\d+\.\d+)/.exec(v.stdout)?.[1];
    if (v.exitCode !== 0 || !version) return fail('UNKNOWN', [`--version ${v.timedOut ? 'TIMEOUT' : `exit ${v.exitCode}`}`], { executable: exe });
    if (!versionInRange(version, CLAUDE_SUPPORTED.min, CLAUDE_SUPPORTED.maxExclusive)) {
      return fail('UNSUPPORTED_VERSION', [`version ${version} outside [${CLAUDE_SUPPORTED.min}, ${CLAUDE_SUPPORTED.maxExclusive})`], { executable: exe, version });
    }
    // status de login pelo comando oficial; o AER lê só o JSON que o cliente imprime, nunca os arquivos de credencial
    const a = await runShort(this.platform, exe, [...(this.o.prefixArgs ?? []), 'auth', 'status'], { cwd, env: this.env(), timeoutMs: this.o.probeTimeoutMs ?? 10_000 });
    let auth: Json | undefined;
    try {
      auth = obj(JSON.parse(a.stdout));
    } catch {
      auth = undefined;
    }
    const ev = [`--version -> ${version}`, `auth status -> ${auth ? `loggedIn=${String(auth.loggedIn)} method=${str(auth.authMethod) ?? '?'}` : `exit ${a.exitCode}, unparsed`}`];
    if (!auth) return fail('UNKNOWN', ev, { executable: exe, version });
    if (auth.loggedIn !== true) return fail('NOT_AUTHENTICATED', [...ev, 'run `claude auth login` yourself; the AER never logs in for you'], { executable: exe, version });
    const expires = str(auth.loginExpiresAt);
    if (expires && Date.parse(expires) <= Date.now()) return fail('AUTH_EXPIRED', [...ev, `login expired at ${expires}`], { executable: exe, version });
    return { ...base, executable: exe, version, availability: 'READY', capabilities: caps(true), evidence: ev };
  }

  async *start(req: AgentRunRequest): AsyncGenerator<AgentStreamEvent> {
    const probe = await this.probe();
    if (probe.availability !== 'READY' || !probe.executable) {
      yield { type: 'error', code: probe.availability, userMessage: `claude ${probe.availability}: ${probe.evidence.join('; ')}` };
      yield { type: 'exit', exitCode: null, signal: null, cancelled: false, reconciled: true };
      return;
    }
    const { readFileSync } = await import('node:fs');
    // shortcut: prompt vai no argv (visível no `ps` do próprio usuário); passar por stdin quando o SpawnOptions aceitar stdin
    const prompt = readFileSync(req.instructionsFile, 'utf8');
    const state: ClaudeStreamState = {};
    try {
      yield* runAgentProcess(this.platform, {
        command: probe.executable, args: [...(this.o.prefixArgs ?? []), ...claudeArgs(req, prompt)], cwd: req.workingDirectory, env: this.env(), timeoutMs: req.timeoutMs, signal: req.signal,
        ...(this.o.graceMs === undefined ? {} : { graceMs: this.o.graceMs }),
        map: (v) => mapClaudeEvent(v, state, req.workingDirectory),
        onSpawn: (pid) => this.running.set(req.attemptId, pid),
        // sem `result` final o resultado é desconhecido: nunca vira sucesso (§7.6)
        finish: ({ exitCode, stderrTail }) => (state.result ? [] : [{ type: 'error', code: exitCode === 0 ? 'NO_RESULT' : classifyClaudeError(stderrTail), userMessage: `claude ended without a result event (exit ${exitCode})` }]),
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
