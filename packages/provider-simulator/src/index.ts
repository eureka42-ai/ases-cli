import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlatformAdapter } from '@aer/platform-core';
import {
  PROVIDER_CONTRACT_VERSION, normalizeEvent, runAgentProcess, runShort,
  type AgentProvider, type AgentRunRequest, type AgentStreamEvent, type Capability, type ProviderProbeResult, type ProviderUsageObservation,
} from '@aer/provider-sdk';

export const SIMULATOR_SCENARIOS = ['ok', 'fail', 'hang', 'approval', 'auth-expired', 'garbage', 'escape', 'review', 'review-write'] as const;
export type SimulatorScenario = (typeof SIMULATOR_SCENARIOS)[number];
/** AER-REQ-103: o adapter só invoca a versão do agente que ele conhece. */
export const SUPPORTED_SIMULATOR_VERSIONS = ['1.0.0'] as const;
export const DEFAULT_SCRIPT = fileURLToPath(new URL('../agent/sim-agent.mjs', import.meta.url));

type Platform = Pick<PlatformAdapter, 'id' | 'spawnManagedProcess' | 'terminateProcessTree'>;
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
  readonly requiresConsent = false;
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
    const base = { providerId: this.id, contractVersion: this.contractVersion, executable: this.script, simulated: true, contractStatus: 'SIMULATED' as const };
    const caps = (status: 'SUPPORTED' | 'UNKNOWN') => ALL.map((id) => ({
      id, checkedAt, source: 'RUNTIME_PROBE' as const,
      status: status === 'UNKNOWN' ? ('UNKNOWN' as const) : SUPPORTED.includes(id) ? ('SUPPORTED' as const) : ('NOT_SUPPORTED' as const),
    }));
    if (!existsSync(this.script)) return { ...base, availability: 'PROVIDER_UNAVAILABLE', capabilities: caps('UNKNOWN'), evidence: [`script not found: ${this.script}`] };
    // probe sem efeito colateral (AER-REQ-102): só --version, com timeout
    const r = await runShort(this.platform, this.node, [this.script, '--version'], { cwd: path.dirname(this.script), timeoutMs: this.o.probeTimeoutMs ?? 5000 });
    const out = r.stdout;
    const version = /^ases-simulator (\d+\.\d+\.\d+)\s*$/.exec(out)?.[1];
    if (r.exitCode !== 0 || !version) return { ...base, availability: 'PROVIDER_UNAVAILABLE', capabilities: caps('UNKNOWN'), evidence: [`--version exit ${r.timedOut ? 'TIMEOUT' : r.exitCode}`] };
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

    try {
      yield* runAgentProcess(this.platform, {
        command: this.node, args: [this.script, '--scenario', scenario, '--task', req.taskId, '--instructions', req.instructionsFile],
        cwd: req.workingDirectory, timeoutMs: req.timeoutMs, signal: req.signal, ...(this.o.graceMs === undefined ? {} : { graceMs: this.o.graceMs }),
        map: (v) => [normalizeEvent(v)], onSpawn: (pid) => this.running.set(req.attemptId, pid),
      });
    } finally {
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
