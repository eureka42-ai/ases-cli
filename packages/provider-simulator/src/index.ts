import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlatformAdapter } from '@aer/platform-core';
import {
  NdjsonDecoder, PROVIDER_CONTRACT_VERSION, decodeToEvents,
  type AgentProvider, type AgentRunRequest, type AgentStreamEvent, type Capability, type ProviderProbeResult, type ProviderUsageObservation,
} from '@aer/provider-sdk';

export const SIMULATOR_SCENARIOS = ['ok', 'fail', 'hang', 'approval', 'auth-expired', 'garbage', 'escape'] as const;
export type SimulatorScenario = (typeof SIMULATOR_SCENARIOS)[number];
/** AER-REQ-103: o adapter só invoca a versão do agente que ele conhece. */
export const SUPPORTED_SIMULATOR_VERSIONS = ['1.0.0'] as const;
export const DEFAULT_SCRIPT = fileURLToPath(new URL('../agent/sim-agent.mjs', import.meta.url));

type Platform = Pick<PlatformAdapter, 'spawnManagedProcess' | 'terminateProcessTree'>;
export interface SimulatorOptions {
  script?: string;
  node?: string;
  probeTimeoutMs?: number;
  /** espera entre SIGTERM e SIGKILL ao cancelar */
  graceMs?: number;
}

const SUPPORTED: Capability[] = ['headless', 'structured_stream', 'file_edit', 'interrupt', 'parallel_sessions'];
const ALL: Capability[] = ['headless', 'structured_stream', 'session_resume', 'file_edit', 'tool_approvals', 'native_plugins', 'skills', 'mcp', 'usage_tokens', 'subscription_quota', 'interrupt', 'parallel_sessions'];

/**
 * Provider SIMULATED (§7.3): processo Node local e determinístico. Nada de rede, IA ou custo; usage é sempre UNKNOWN.
 * Cenário escolhido por `modelPreference` (as "modelos" do simulador são cenários de teste).
 */
export class SimulatorProvider implements AgentProvider {
  readonly id = 'simulator' as const;
  readonly contractVersion = PROVIDER_CONTRACT_VERSION;
  private readonly running = new Map<string, number>();
  private readonly script: string;
  private readonly node: string;
  private readonly platform: Platform;
  private readonly o: SimulatorOptions;

  constructor(platform: Platform, o: SimulatorOptions = {}) {
    this.platform = platform;
    this.o = o;
    this.script = o.script ?? DEFAULT_SCRIPT;
    this.node = o.node ?? process.execPath;
  }

  async probe(): Promise<ProviderProbeResult> {
    const checkedAt = new Date().toISOString();
    const base = { providerId: this.id, contractVersion: this.contractVersion, executable: this.script, simulated: true };
    const caps = (status: 'SUPPORTED' | 'UNKNOWN') => ALL.map((id) => ({
      id, checkedAt, source: 'RUNTIME_PROBE' as const,
      status: status === 'UNKNOWN' ? ('UNKNOWN' as const) : SUPPORTED.includes(id) ? ('SUPPORTED' as const) : ('NOT_SUPPORTED' as const),
    }));
    if (!existsSync(this.script)) return { ...base, availability: 'PROVIDER_UNAVAILABLE', capabilities: caps('UNKNOWN'), evidence: [`script not found: ${this.script}`] };
    // probe sem efeito colateral (AER-REQ-102): só --version, com timeout
    const p = this.platform.spawnManagedProcess(this.node, [this.script, '--version'], { cwd: path.dirname(this.script) });
    let out = '';
    p.child.stdout.on('data', (d: Buffer) => {
      if (out.length < 200) out += d.toString('utf8');
    });
    p.child.stderr.resume();
    const timer = setTimeout(() => void this.platform.terminateProcessTree(p.pid, { graceMs: 100 }), this.o.probeTimeoutMs ?? 5000);
    const r = await p.exited.finally(() => clearTimeout(timer));
    const version = /^ases-simulator (\d+\.\d+\.\d+)\s*$/.exec(out)?.[1];
    if (r.exitCode !== 0 || !version) return { ...base, availability: 'PROVIDER_UNAVAILABLE', capabilities: caps('UNKNOWN'), evidence: [`--version exit ${r.exitCode ?? r.signal}`] };
    if (!(SUPPORTED_SIMULATOR_VERSIONS as readonly string[]).includes(version)) {
      return { ...base, version, availability: 'UNSUPPORTED_VERSION', capabilities: caps('UNKNOWN'), evidence: [`version ${version} not in ${SUPPORTED_SIMULATOR_VERSIONS.join(', ')}`] };
    }
    return { ...base, version, availability: 'READY', capabilities: caps('SUPPORTED'), evidence: [`--version -> ${version}`] };
  }

  async *start(req: AgentRunRequest): AsyncGenerator<AgentStreamEvent> {
    const scenario = req.modelPreference ?? 'ok';
    const fail = (code: string, userMessage: string): AgentStreamEvent[] => [{ type: 'error', code, userMessage }, { type: 'exit', exitCode: null, signal: null, cancelled: false, reconciled: true }];
    if (!(SIMULATOR_SCENARIOS as readonly string[]).includes(scenario)) return yield* fail('INVALID_INPUT', `unknown simulator scenario: ${scenario}`);
    const probe = await this.probe();
    if (probe.availability !== 'READY') return yield* fail(probe.availability, `simulator ${probe.availability}: ${probe.evidence.join('; ')}`);
    if (req.signal.aborted) return yield* fail('CANCELLED', 'cancelled before start');

    const p = this.platform.spawnManagedProcess(this.node, [this.script, '--scenario', scenario, '--task', req.taskId, '--instructions', req.instructionsFile], { cwd: req.workingDirectory });
    this.running.set(req.attemptId, p.pid);
    p.child.stderr.resume(); // shortcut: stderr do simulador é descartado; capturar redigido quando houver providers reais (PHASE-07)
    let timedOut = false;
    let cancelled = false;
    const stop = () => void this.platform.terminateProcessTree(p.pid, this.o.graceMs === undefined ? {} : { graceMs: this.o.graceMs });
    const onAbort = () => {
      cancelled = true;
      stop();
    };
    req.signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, req.timeoutMs);
    try {
      const decoder = new NdjsonDecoder();
      for await (const chunk of p.child.stdout) yield* decodeToEvents(decoder.push(chunk as Buffer));
      yield* decodeToEvents(decoder.end());
      const r = await p.exited;
      if (timedOut) yield { type: 'error', code: 'TIMEOUT', userMessage: `agent exceeded ${req.timeoutMs} ms and was terminated` };
      // reconciliação: mesmo após saída normal, nenhum neto pode sobrar no grupo
      const t = await this.platform.terminateProcessTree(p.pid, { graceMs: 200 });
      yield { type: 'exit', exitCode: r.exitCode, signal: r.signal, cancelled, reconciled: t.terminated };
    } finally {
      clearTimeout(timer);
      req.signal.removeEventListener('abort', onAbort);
      this.running.delete(req.attemptId);
    }
  }

  async cancel(attemptId: string): Promise<void> {
    const pid = this.running.get(attemptId);
    if (pid !== undefined) await this.platform.terminateProcessTree(pid, this.o.graceMs === undefined ? {} : { graceMs: this.o.graceMs });
  }

  async getUsage(): Promise<ProviderUsageObservation[]> {
    // §8.1: o simulador não consome tokens nem cota; o valor é desconhecido, não zero
    return [{ metric: 'TOKENS_INPUT', value: null, unit: 'tokens', source: 'UNKNOWN', observedAt: new Date().toISOString() }];
  }
}
