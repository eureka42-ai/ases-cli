// §7.2 do MD mestre: contrato que todo adapter de agente implementa (AER-REQ-101). Versão incrementa em mudança incompatível.
export const PROVIDER_CONTRACT_VERSION = 1;

export const PROVIDER_IDS = ['claude', 'codex', 'kimi', 'google', 'opencode', 'cursor', 'simulator'] as const;
/** `simulator-N`: simuladores extras para testar a distribuição entre IAs (PHASE-18; AER_SIMULATORS) */
export type ProviderId = (typeof PROVIDER_IDS)[number] | `simulator-${number}`;

export type Capability =
  | 'headless' | 'structured_stream' | 'session_resume' | 'file_edit'
  | 'tool_approvals' | 'native_plugins' | 'skills' | 'mcp'
  | 'usage_tokens' | 'subscription_quota' | 'interrupt' | 'parallel_sessions';

export type ProviderAvailability =
  | 'READY' | 'NOT_INSTALLED' | 'NOT_AUTHENTICATED' | 'AUTH_EXPIRED'
  | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'UNSUPPORTED_VERSION'
  | 'UNSUPPORTED_AUTH_MODE' | 'UNKNOWN';

/** AER-REQ-110: toda capacidade declara status, fonte e data da verificação. */
export interface ProviderCapabilityInfo {
  id: Capability;
  status: 'SUPPORTED' | 'NOT_SUPPORTED' | 'UNKNOWN' | 'CONDITIONAL';
  source: 'OFFICIAL_DOC' | 'RUNTIME_PROBE' | 'USER_CONFIG' | 'UNKNOWN';
  checkedAt: string;
  notes?: string;
}

export interface ProviderProbeResult {
  providerId: ProviderId;
  contractVersion: number;
  executable?: string;
  version?: string;
  availability: ProviderAvailability;
  capabilities: ProviderCapabilityInfo[];
  evidence: string[];
  /** true só no simulador: telas e evidências mostram SIMULATED (§7.3) */
  simulated: boolean;
  /**
   * AER-REQ-119: VERIFIED = parser validado contra fixture real capturada desta versão; UNVERIFIED = escrito a partir
   * da documentação, ainda sem captura; SIMULATED = simulador.
   */
  contractStatus: 'VERIFIED' | 'UNVERIFIED' | 'SIMULATED';
}

export interface AgentRunRequest {
  taskId: string;
  attemptId: string;
  workingDirectory: string;
  instructionsFile: string;
  allowedPaths: string[];
  deniedPaths: string[];
  mode: 'READ_ONLY' | 'WORKTREE_WRITE';
  approvedToolPolicyId: string;
  modelPreference?: string;
  resumeReference?: string;
  timeoutMs: number;
  signal: AbortSignal;
}

export type AgentStreamEvent =
  | { type: 'message'; text: string; visibleToUser: boolean }
  | { type: 'tool_call'; name: string; safeArguments: unknown }
  | { type: 'tool_result'; name: string; success: boolean; safeSummary: string }
  | { type: 'file_change'; relativePath: string; kind: 'create' | 'modify' | 'delete' }
  | { type: 'usage'; metric: string; value: number; unit: string; source: string }
  | { type: 'approval_request'; operationHash: string; description: string }
  | { type: 'status'; status: string; detail?: string }
  | { type: 'error'; code: string; userMessage: string }
  /** fim do processo, sintetizado pelo adapter (não pelo agente): código de saída real (AER-REQ-105); reconciled = árvore confirmada encerrada */
  | { type: 'exit'; exitCode: number | null; signal: string | null; cancelled: boolean; reconciled: boolean };

/** §8.1: métrica sem dado oficial fica UNKNOWN, nunca estimada. */
export interface ProviderUsageObservation {
  metric: string;
  value: number | null;
  unit: string;
  source: 'PROVIDER_REPORTED' | 'UNKNOWN';
  observedAt: string;
}

export interface InstalledExtension {
  kind: 'skill' | 'plugin' | 'mcp' | 'hook' | 'subagent';
  name: string;
  version?: string;
}

export interface AgentProvider {
  readonly id: ProviderId;
  readonly contractVersion: number;
  /** true quando rodar usa a conta do usuário (cota/cobrança): o AER exige aceite explícito antes até do probe (AER-REQ-123) */
  readonly requiresConsent: boolean;
  probe(): Promise<ProviderProbeResult>;
  start(request: AgentRunRequest): AsyncIterable<AgentStreamEvent>;
  cancel(attemptId: string, reason: string): Promise<void>;
  listResumeReferences?(projectRoot: string): Promise<string[]>;
  getUsage?(): Promise<ProviderUsageObservation[]>;
  listExtensions?(): Promise<InstalledExtension[]>;
}

/** Códigos de erro que mudam o destino da tarefa: auth expirada nunca é confundida com rate limit (AER-REQ-107). */
export const BLOCKING_ERROR_CODES = ['AUTH_EXPIRED', 'NOT_AUTHENTICATED', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'UNSUPPORTED_VERSION'] as const;
