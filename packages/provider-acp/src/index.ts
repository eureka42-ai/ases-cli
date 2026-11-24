import { readFileSync } from 'node:fs';
import os from 'node:os';
import {
  PROVIDER_CONTRACT_VERSION, findExecutable, redactText, runAgentProcess, runShort, scopedEnv, versionInRange,
  type AgentProvider, type AgentRunRequest, type AgentStreamEvent, type Capability, type ProcessPlatform, type ProviderAvailability,
  type ProviderCapabilityInfo, type ProviderId, type ProviderProbeResult,
} from '@aer/provider-sdk';

/**
 * Cliente do Agent Client Protocol v1 (JSON-RPC 2.0 em NDJSON pelo stdio), comum a `kimi acp`, `opencode acp` e
 * `gemini --acp` (docs/PROVIDERS_PESQUISA_PHASE08.md). O agente PEDE permissão (`session/request_permission`) e quem
 * decide é o AER: o modo "print" desses clientes aprova tudo sozinho e por isso não é usado (§12).
 */
export const ACP_PROTOCOL_VERSION = 1;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : undefined);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

const norm = (p: string) => p.replaceAll('\\', '/').replace(/\/$/, '');
/** dentro da worktree: igual à raiz ou abaixo dela, sem `..` (o agente manda caminhos absolutos) */
export function insideWorktree(cwd: string, file: string): boolean {
  const base = norm(cwd);
  const f = norm(file);
  if (f.split('/').includes('..')) return false;
  return f === base || f.startsWith(`${base}/`);
}
const relativeTo = (cwd: string, file: string) => (insideWorktree(cwd, file) && norm(file) !== norm(cwd) ? norm(file).slice(norm(cwd).length + 1) : file);

/** Kinds de ferramenta do ACP v1 que só leem; `edit` depende do modo; o resto (execute, fetch, delete, move, other…) é negado. */
const READ_KINDS = new Set(['read', 'search', 'think']);

export interface PermissionDecision {
  allow: boolean;
  reason: string;
}

/** Política do AER para `session/request_permission` (mesmo nível do `--restricted` do Claude: sem shell, só a worktree). */
export function decidePermission(toolCall: { kind?: string | undefined; locations?: string[] | undefined }, mode: AgentRunRequest['mode'], cwd: string): PermissionDecision {
  const kind = toolCall.kind ?? 'unknown';
  const locs = toolCall.locations ?? [];
  const outside = locs.find((l) => !insideWorktree(cwd, l));
  if (outside) return { allow: false, reason: `path outside worktree: ${outside}` };
  if (READ_KINDS.has(kind)) return { allow: true, reason: kind };
  if (kind === 'edit') {
    if (mode !== 'WORKTREE_WRITE') return { allow: false, reason: 'edit in READ_ONLY mode' };
    if (locs.length === 0) return { allow: false, reason: 'edit without a declared path' };
    return { allow: true, reason: 'edit inside worktree' };
  }
  return { allow: false, reason: `tool kind ${kind} is not allowed by the AER policy` };
}

/** shortcut: classificação por texto/código (o ACP v1 só fixa -32000 auth_required); refinar com fixture real de erro. */
export function classifyAcpError(code: number | undefined, text: string): string {
  if (/rate.?limit|usage limit|too many requests|\b429\b|quota/i.test(text)) return 'RATE_LIMITED';
  // "This API key has expired" (opencode 1.19.6, capturado em 23/11/2026)
  if (/(token|session|login|key).{0,40}expired|expired.{0,40}(token|session|login|key)/i.test(text)) return 'AUTH_EXPIRED';
  if (code === -32000 || /auth(entication)? required|not logged in|login|unauthori[sz]ed|\b401\b|api key/i.test(text)) return 'NOT_AUTHENTICATED';
  return 'TASK_FAILED';
}

interface ToolInfo {
  kind?: string | undefined;
  title?: string | undefined;
  locations: string[];
}

export interface AcpSessionState {
  phase: 'init' | 'session' | 'prompt' | 'done';
  stopReason?: string | undefined;
  failed?: boolean;
  sessionId?: string | undefined;
}

/** nome para o log: o kind do ACP ou, se o agente não manda (kimi 1.50.0), a 1ª palavra do título ('WriteFile', 'Shell') */
const safeTitle = (t: ToolInfo) => (t.kind === 'execute' ? '[comando omitido]' : redactText(t.title ?? '', 120).text);
const toolName = (t: ToolInfo) => t.kind ?? (t.title?.split(/[\s:]/)[0] || 'unknown').slice(0, 60);
const locationsOf = (v: unknown): string[] => (Array.isArray(v) ? v.map((l) => str(obj(l)?.path)).filter((x): x is string => !!x) : []);
/** caminhos dos blocos `{type: 'diff', path}` do content (kimi 1.50.0 não manda kind/locations; o alvo vem só no diff) */
const diffPathsOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(obj).filter((c) => c?.type === 'diff').map((c) => str(c?.path)).filter((x): x is string => !!x) : []);

/**
 * Máquina de estados do lado cliente: initialize → session/new → session/prompt → fim (fecha o stdin).
 * Traduz `session/update` para o contrato do AER e responde aos pedidos do agente.
 */
export class AcpSession {
  readonly state: AcpSessionState = { phase: 'init' };
  private readonly tools = new Map<string, ToolInfo>();
  private text = '';
  private readonly req: Pick<AgentRunRequest, 'mode' | 'workingDirectory'>;
  private readonly prompt: string;
  private readonly io: { write: (line: string) => void; end: () => void };

  constructor(req: Pick<AgentRunRequest, 'mode' | 'workingDirectory'>, prompt: string, io: { write: (line: string) => void; end: () => void }) {
    this.req = req;
    this.prompt = prompt;
    this.io = io;
  }

  private send(m: Json) {
    this.io.write(JSON.stringify({ jsonrpc: '2.0', ...m }));
  }

  begin() {
    // fs/terminal desligados: o agente usa as próprias ferramentas e cada uma passa pela permissão acima
    this.send({ id: 1, method: 'initialize', params: { protocolVersion: ACP_PROTOCOL_VERSION, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } } });
  }

  private flush(): AgentStreamEvent[] {
    if (!this.text.trim()) return [];
    const out: AgentStreamEvent[] = [{ type: 'message', text: redactText(this.text, 8000).text, visibleToUser: true }];
    this.text = '';
    return out;
  }

  private finish(stopReason: string | undefined, error?: { code: string; message: string }): AgentStreamEvent[] {
    this.state.phase = 'done';
    this.state.stopReason = stopReason;
    const out = this.flush();
    if (error) {
      this.state.failed = true;
      out.push({ type: 'error', code: error.code, userMessage: redactText(error.message, 1000).text });
    } else if (stopReason !== 'end_turn') {
      this.state.failed = true;
      out.push({ type: 'error', code: stopReason === 'max_tokens' || stopReason === 'max_turn_requests' ? 'MAX_TURNS' : stopReason === 'refusal' ? 'REFUSED' : 'TASK_FAILED', userMessage: `ACP stopReason ${stopReason ?? '?'}` });
    }
    this.io.end();
    return out;
  }

  /** Uma mensagem JSON-RPC do agente → eventos do contrato (e, quando preciso, a resposta no stdin). */
  handle(value: unknown): AgentStreamEvent[] {
    const m = obj(value);
    if (!m) return [{ type: 'error', code: 'PARSE_ERROR', userMessage: 'ACP line is not an object' }];
    const method = str(m.method);
    const id = m.id as number | string | undefined;

    // resposta a um pedido nosso
    if (!method && id !== undefined) {
      const err = obj(m.error);
      if (err) {
        const message = str(err.message) ?? 'ACP error';
        const data = str(obj(err.data)?.message) ?? (err.data === undefined ? '' : JSON.stringify(err.data));
        return this.finish(undefined, { code: classifyAcpError(typeof err.code === 'number' ? err.code : undefined, `${message} ${data}`), message: `${message}${data ? `: ${data}` : ''}` });
      }
      const result = obj(m.result) ?? {};
      if (id === 1) {
        const pv = result.protocolVersion;
        if (pv !== ACP_PROTOCOL_VERSION) return this.finish(undefined, { code: 'UNSUPPORTED_VERSION', message: `ACP protocolVersion ${String(pv)} (AER speaks ${ACP_PROTOCOL_VERSION})` });
        this.state.phase = 'session';
        this.send({ id: 2, method: 'session/new', params: { cwd: this.req.workingDirectory, mcpServers: [] } });
        const info = obj(result.agentInfo);
        return [{ type: 'status', status: 'INIT', detail: `${str(info?.name) ?? '?'} ${str(info?.version) ?? ''}`.trim().slice(0, 100) }];
      }
      if (id === 2) {
        const sessionId = str(result.sessionId);
        if (!sessionId) return this.finish(undefined, { code: 'PARSE_ERROR', message: 'session/new without sessionId' });
        this.state.sessionId = sessionId;
        this.state.phase = 'prompt';
        this.send({ id: 3, method: 'session/prompt', params: { sessionId, prompt: [{ type: 'text', text: this.prompt }] } });
        return [{ type: 'status', status: 'SESSION_STARTED' }];
      }
      if (id === 3) return this.finish(str(result.stopReason));
      return [];
    }

    if (method === 'session/update') {
      const u = obj(obj(m.params)?.update) ?? {};
      const kind = str(u.sessionUpdate);
      switch (kind) {
        case 'agent_message_chunk': {
          const c = obj(u.content);
          if (c?.type === 'text') this.text += str(c.text) ?? '';
          return [];
        }
        case 'agent_thought_chunk':
        case 'user_message_chunk':
        case 'available_commands_update':
        case 'current_mode_update':
        case 'plan':
        case 'session_info_update': // antigravity 1.5.13: título da sessão gerado pelo agente; sem efeito para o AER
        case 'usage_update': // opencode: {used, size, cost} = ocupação da janela de contexto, não tokens consumidos; não vira uso
          return [];
        case 'tool_call': {
          const tid = str(u.toolCallId) ?? '?';
          const t: ToolInfo = { kind: str(u.kind), title: str(u.title), locations: locationsOf(u.locations) };
          this.tools.set(tid, t);
          // só kind e caminhos: rawInput (conteúdo, comandos) não vai para o log (§12.2)
          return [...this.flush(), { type: 'tool_call', name: toolName(t), safeArguments: { title: safeTitle(t), paths: t.locations } }];
        }
        case 'tool_call_update': {
          const tid = str(u.toolCallId) ?? '?';
          const t = this.tools.get(tid) ?? { locations: [] };
          if (str(u.kind)) t.kind = str(u.kind);
          const locs = locationsOf(u.locations);
          if (locs.length) t.locations = locs;
          this.tools.set(tid, t);
          const status = str(u.status);
          if (status !== 'completed' && status !== 'failed') return [];
          const out: AgentStreamEvent[] = [{ type: 'tool_result', name: toolName(t), success: status === 'completed', safeSummary: redactText(`${status} ${safeTitle(t)}`, 300).text }];
          if (status === 'completed' && t.kind === 'edit') for (const l of t.locations) out.push({ type: 'file_change', relativePath: relativeTo(this.req.workingDirectory, l), kind: 'modify' });
          return out;
        }
        default:
          return [{ type: 'status', status: 'UNRECOGNIZED_EVENT', detail: (kind ?? '?').slice(0, 60) }];
      }
    }

    if (method === 'session/request_permission' && id !== undefined) {
      const p = obj(m.params) ?? {};
      const tc = obj(p.toolCall) ?? {};
      const known = this.tools.get(str(tc.toolCallId) ?? '');
      const diffs = diffPathsOf(tc.content);
      const locs = [...new Set([...locationsOf(tc.locations), ...diffs])];
      // sem kind declarado, um diff é por definição uma edição; a política de caminho continua valendo
      const call = { kind: str(tc.kind) ?? known?.kind ?? (diffs.length ? 'edit' : undefined), locations: locs.length ? locs : known?.locations };
      if (known && call.kind === 'edit') {
        known.kind ??= 'edit';
        if (!known.locations.length) known.locations = locs;
      }
      const d = decidePermission(call, this.req.mode, this.req.workingDirectory);
      const options = Array.isArray(p.options) ? p.options.map(obj).filter((x): x is Json => !!x) : [];
      // só *_once: nenhuma decisão do AER pode persistir no cliente do usuário; sem a opção, responde "cancelled"
      const pick = options.find((o) => o.kind === (d.allow ? 'allow_once' : 'reject_once'));
      if (pick) this.send({ id, result: { outcome: { outcome: 'selected', optionId: pick.optionId } } });
      else this.send({ id, result: { outcome: { outcome: 'cancelled' } } });
      const allowed = d.allow && !!pick;
      return [{ type: 'status', status: allowed ? 'PERMISSION_GRANTED' : 'PERMISSION_DENIED', detail: redactText(`${call.kind ?? '?'} ${(call.locations ?? []).join(',')} — ${pick ? d.reason : 'no matching option; cancelled'}`, 300).text }];
    }

    if (method && id !== undefined) {
      // fs/*, terminal/* e outros: desligados nas capabilities; responde erro para o agente não travar esperando
      this.send({ id, error: { code: -32601, message: `${method} is not supported by the AER client` } });
      return [{ type: 'status', status: 'CLIENT_METHOD_REFUSED', detail: method.slice(0, 80) }];
    }
    return method ? [{ type: 'status', status: 'UNRECOGNIZED_EVENT', detail: method.slice(0, 60) }] : [];
  }
}

export interface AcpSpec {
  id: ProviderId;
  binary: string;
  label: string;
  /** argumentos que sobem o servidor ACP na worktree */
  acpArgs: (cwd: string) => string[];
  versionArgs: string[];
  /** faixa testada; null = nenhuma versão testada ainda (UNSUPPORTED_VERSION sempre) */
  supported: { min: string; maxExclusive: string } | null;
  verifiedVersions: readonly string[];
  loginHint: string;
  /** variáveis extras para o subprocesso (p.ex. forçar o pedido de permissão) */
  env?: Readonly<Record<string, string>>;
  notes?: Partial<Record<Capability, string>>;
}

export interface AcpOptions {
  executable?: string;
  prefixArgs?: string[];
  env?: Readonly<Record<string, string | undefined>>;
  probeTimeoutMs?: number;
  graceMs?: number;
}

export class AcpProvider implements AgentProvider {
  readonly id: ProviderId;
  readonly contractVersion = PROVIDER_CONTRACT_VERSION;
  readonly requiresConsent = true;
  private readonly running = new Map<string, number>();
  private readonly platform: ProcessPlatform;
  private readonly spec: AcpSpec;
  private readonly o: AcpOptions;

  constructor(platform: ProcessPlatform, spec: AcpSpec, o: AcpOptions = {}) {
    this.platform = platform;
    this.spec = spec;
    this.id = spec.id;
    this.o = o;
  }

  private env() {
    return { ...scopedEnv(this.spec.id, this.o.env ?? process.env), ...(this.spec.env ?? {}) };
  }

  async probe(): Promise<ProviderProbeResult> {
    const checkedAt = new Date().toISOString();
    const exe = this.o.executable ?? findExecutable(this.spec.binary, this.o.env ?? process.env);
    const doc: Record<Capability, ProviderCapabilityInfo['status']> = {
      headless: 'SUPPORTED', structured_stream: 'SUPPORTED', file_edit: 'SUPPORTED', interrupt: 'SUPPORTED', usage_tokens: 'NOT_SUPPORTED',
      session_resume: 'NOT_SUPPORTED', tool_approvals: 'SUPPORTED', mcp: 'NOT_SUPPORTED', native_plugins: 'UNKNOWN', skills: 'UNKNOWN',
      subscription_quota: 'UNKNOWN', parallel_sessions: 'CONDITIONAL',
    };
    const notes: Partial<Record<Capability, string>> = {
      tool_approvals: 'session/request_permission decidido pela política do AER (sem shell, só a worktree)',
      usage_tokens: 'o ACP v1 não reporta uso; nada é estimado',
      mcp: 'desligado pelo AER nesta fase (mcpServers: [])',
      session_resume: 'desligado pelo AER nesta fase',
      parallel_sessions: 'limite 1 por padrão (termos não verificados)',
      ...this.spec.notes,
    };
    const caps = (ok: boolean): ProviderCapabilityInfo[] => (Object.keys(doc) as Capability[]).map((id) => ({
      id, checkedAt, source: 'OFFICIAL_DOC' as const, status: ok ? doc[id] : 'UNKNOWN', ...(notes[id] ? { notes: notes[id] } : {}),
    }));
    const base = { providerId: this.id, contractVersion: this.contractVersion, simulated: false, contractStatus: 'UNVERIFIED' as const };
    const fail = (availability: ProviderAvailability, evidence: string[], extra: Partial<ProviderProbeResult> = {}): ProviderProbeResult => ({ ...base, ...extra, availability, capabilities: caps(false), evidence });
    if (!exe) return fail('NOT_INSTALLED', [`${this.spec.binary} not found in PATH`]);
    const v = await runShort(this.platform, exe, [...(this.o.prefixArgs ?? []), ...this.spec.versionArgs], { cwd: os.homedir(), env: this.env(), timeoutMs: this.o.probeTimeoutMs ?? 15_000 });
    const version = /(\d+\.\d+\.\d+)/.exec(`${v.stdout}\n${v.stderr}`)?.[1];
    if (v.exitCode !== 0 || !version) return fail('UNKNOWN', [`${this.spec.versionArgs.join(' ')} ${v.timedOut ? 'TIMEOUT' : `exit ${v.exitCode}`}`], { executable: exe });
    const s = this.spec.supported;
    if (!s) return fail('UNSUPPORTED_VERSION', [`version ${version}: no ${this.spec.label} version has been tested by the AER yet`], { executable: exe, version });
    if (!versionInRange(version, s.min, s.maxExclusive)) return fail('UNSUPPORTED_VERSION', [`version ${version} outside [${s.min}, ${s.maxExclusive})`], { executable: exe, version });
    const contractStatus = this.spec.verifiedVersions.includes(version) ? 'VERIFIED' as const : 'UNVERIFIED' as const;
    // não há comando oficial de status de login: a autenticação aparece no session/new (NOT_AUTHENTICATED), sem ler credenciais
    return { ...base, contractStatus, executable: exe, version, availability: 'READY', capabilities: caps(true), evidence: [`version -> ${version}`, `auth: checked at session/new (${this.spec.loginHint})`] };
  }

  async *start(req: AgentRunRequest): AsyncGenerator<AgentStreamEvent> {
    const probe = await this.probe();
    if (probe.availability !== 'READY' || !probe.executable) {
      yield { type: 'error', code: probe.availability, userMessage: `${this.spec.id} ${probe.availability}: ${probe.evidence.join('; ')}` };
      yield { type: 'exit', exitCode: null, signal: null, cancelled: false, reconciled: true };
      return;
    }
    const prompt = readFileSync(req.instructionsFile, 'utf8');
    let session: AcpSession | undefined;
    try {
      yield* runAgentProcess(this.platform, {
        command: probe.executable, args: [...(this.o.prefixArgs ?? []), ...this.spec.acpArgs(req.workingDirectory)], cwd: req.workingDirectory, env: this.env(),
        timeoutMs: req.timeoutMs, signal: req.signal, ...(this.o.graceMs === undefined ? {} : { graceMs: this.o.graceMs }),
        stdin: (io) => {
          session = new AcpSession(req, prompt, io);
          session.begin();
        },
        map: (v) => session?.handle(v) ?? [],
        onSpawn: (pid) => this.running.set(req.attemptId, pid),
        finish: ({ exitCode, stderrTail }) => (session?.state.phase === 'done' ? [] : [{ type: 'error', code: exitCode === 0 ? 'NO_RESULT' : classifyAcpError(undefined, stderrTail), userMessage: `${this.spec.id} ended before the ACP prompt finished (exit ${exitCode})` }]),
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

/** Versões com fixture real capturada (TAR-0041, 23/11/2026): kimi com escrita concedida e shell negado. */
export const KIMI_VERIFIED_VERSIONS: readonly string[] = ['1.50.0'];
/** opencode 2.4.1: escrita concedida e shell negado capturados (23/11/2026). A 1.19.6 só teve o erro de chave expirada. */
export const OPENCODE_VERIFIED_VERSIONS: readonly string[] = ['2.4.1'];

export const KIMI_SPEC: AcpSpec = {
  id: 'kimi', binary: 'kimi', label: 'Kimi Code CLI',
  acpArgs: () => ['acp'], versionArgs: ['--version'],
  supported: { min: '1.50.0', maxExclusive: '1.51.0' }, verifiedVersions: KIMI_VERIFIED_VERSIONS,
  loginHint: 'run `kimi login` yourself; the AER never logs in for you',
};

export const OPENCODE_SPEC: AcpSpec = {
  id: 'opencode', binary: 'opencode', label: 'OpenCode',
  // 2.4.1 removeu `acp --cwd` (com a flag, imprime a ajuda e não sobe o servidor): o diretório vem do cwd do processo e do session/new
  acpArgs: () => ['acp'], versionArgs: ['--version'],
  supported: { min: '2.4.1', maxExclusive: '2.5.0' }, verifiedVersions: OPENCODE_VERIFIED_VERSIONS,
  loginHint: 'run `opencode auth login` yourself; the AER never logs in for you',
  // shortcut: OPENCODE_CONFIG_CONTENT ainda não confirmado em execução real (TAR-0041); sem ele, a config do usuário decide
  env: { OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { edit: 'ask', bash: 'ask', webfetch: 'ask' } }) },
};

/**
 * Google: Antigravity CLI (`agy acp`, oficial). O Gemini CLI deixou de aceitar login de conta Google para planos
 * individuais em 18/06/2026 (migração para o Antigravity); por isso o provider `google` usa o `agy`.
 * `--sandbox` liga as restrições de terminal do próprio agente (defesa extra; o AER já nega `execute`).
 * `--dangerously-skip-permissions` é proibido (§12) e nunca é passado.
 */
/** agy 1.5.13: escrita concedida e shell negado capturados (23/11/2026). */
export const ANTIGRAVITY_VERIFIED_VERSIONS: readonly string[] = ['1.5.13'];
export const ANTIGRAVITY_SPEC: AcpSpec = {
  id: 'google', binary: 'agy', label: 'Antigravity CLI',
  acpArgs: () => ['acp', '--sandbox'], versionArgs: ['--version'],
  supported: { min: '1.5.13', maxExclusive: '1.6.0' }, verifiedVersions: ANTIGRAVITY_VERIFIED_VERSIONS,
  loginHint: 'run `agy` and log in with Google yourself; the AER never logs in for you',
};

export const createKimiProvider = (platform: ProcessPlatform, o?: AcpOptions) => new AcpProvider(platform, KIMI_SPEC, o);
export const createOpenCodeProvider = (platform: ProcessPlatform, o?: AcpOptions) => new AcpProvider(platform, OPENCODE_SPEC, o);
export const createAntigravityProvider = (platform: ProcessPlatform, o?: AcpOptions) => new AcpProvider(platform, ANTIGRAVITY_SPEC, o);
