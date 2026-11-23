import { canonicalJson, sha256Hex } from '@aer/contracts';

/** Escopos de permissão do §12.3. Qualquer coisa fora desta lista é negada (deny-by-default, AER-REQ-161). */
export const SCOPES = [
  'READ_REPO', 'WRITE_TASK_WORKTREE', 'EXEC_TESTS', 'EXEC_BUILD', 'EXEC_SHELL_APPROVED', 'NETWORK_ALLOWED_DOMAINS', 'READ_EXTERNAL_PATHS',
  'WRITE_EXTERNAL_PATHS', 'INSTALL_PACKAGES', 'ACCESS_SECRETS', 'USE_MCP', 'GIT_COMMIT', 'GIT_MERGE', 'GIT_PUSH', 'DELETE_FILES', 'RUN_PRIVILEGED', 'PUBLISH_RELEASE',
] as const;
export type Scope = (typeof SCOPES)[number];

export interface Operation {
  scope: string;
  /** o que é afetado: p.ex. "EXT-0003", "plugin:foo@market", "mcp:server-id" */
  subject: string;
  /** conteúdo exato que a aprovação cobre (manifest hash, comando, argumentos): mudar qualquer byte invalida a aprovação */
  detail: Record<string, unknown>;
}

/** Hash da operação exata (AER-REQ-162): aprovação vale só para este conteúdo. */
export const operationHash = (op: Operation) => sha256Hex(canonicalJson({ scope: op.scope, subject: op.subject, detail: op.detail }));

export interface Policy {
  /** liberado sem pergunta */
  allow: readonly Scope[];
  /** só com aprovação humana vinculada ao hash */
  approval: readonly Scope[];
  /** nunca, mesmo com aprovação */
  deny: readonly Scope[];
}

/** Política padrão do AER V1: só leitura do repo e escrita na worktree da tarefa sem pergunta; privilégio nunca (§12.2). */
export const DEFAULT_POLICY: Policy = {
  allow: ['READ_REPO', 'WRITE_TASK_WORKTREE'],
  approval: ['EXEC_TESTS', 'EXEC_BUILD', 'EXEC_SHELL_APPROVED', 'NETWORK_ALLOWED_DOMAINS', 'READ_EXTERNAL_PATHS', 'WRITE_EXTERNAL_PATHS',
    'INSTALL_PACKAGES', 'ACCESS_SECRETS', 'USE_MCP', 'GIT_COMMIT', 'GIT_MERGE', 'GIT_PUSH', 'DELETE_FILES', 'PUBLISH_RELEASE'],
  deny: ['RUN_PRIVILEGED'],
};

/** Interseção de políticas (global ∩ projeto ∩ tarefa …, §12.3): nenhuma camada concede mais que a mais restritiva. */
export function intersect(...ps: readonly Policy[]): Policy {
  const deny = new Set(ps.flatMap((p) => p.deny));
  const allow = SCOPES.filter((s) => !deny.has(s) && ps.every((p) => p.allow.includes(s)));
  const approval = SCOPES.filter((s) => !deny.has(s) && !allow.includes(s) && ps.every((p) => p.allow.includes(s) || p.approval.includes(s)));
  return { allow, approval, deny: SCOPES.filter((s) => !allow.includes(s) && !approval.includes(s)) };
}

export interface ApprovalLike {
  id: string;
  scope: string;
  operationHash: string;
  state: 'PENDING' | 'GRANTED' | 'DENIED' | 'EXPIRED' | 'CONSUMED';
  expiresAt: string | null;
  taskId: string | null;
}

export type Decision =
  | { decision: 'ALLOW'; reason: string; approvalId?: string }
  | { decision: 'DENY'; reason: string }
  | { decision: 'NEEDS_APPROVAL'; reason: string; operationHash: string };

/**
 * Decide uma operação. Aprovação só vale se: GRANTED, não expirada, mesmo escopo, mesmo hash exato e, se foi
 * dada para uma tarefa, para a mesma tarefa (não se transfere a outro processo/agente, §12.2 item 7).
 */
export function evaluate(op: Operation, o: { policy?: Policy; approvals?: readonly ApprovalLike[]; taskId?: string | null; now?: Date } = {}): Decision {
  const policy = o.policy ?? DEFAULT_POLICY;
  if (!(SCOPES as readonly string[]).includes(op.scope)) return { decision: 'DENY', reason: `unclassified scope ${op.scope} (deny-by-default)` };
  const scope = op.scope as Scope;
  if (policy.deny.includes(scope)) return { decision: 'DENY', reason: `${scope} is denied by policy` };
  if (policy.allow.includes(scope)) return { decision: 'ALLOW', reason: `${scope} allowed by policy` };
  if (!policy.approval.includes(scope)) return { decision: 'DENY', reason: `${scope} not granted by any policy layer` };
  const hash = operationHash(op);
  const now = (o.now ?? new Date()).getTime();
  const ok = (o.approvals ?? []).find((a) => a.state === 'GRANTED' && a.scope === scope && a.operationHash === hash
    && (a.expiresAt === null || Date.parse(a.expiresAt) > now) && (a.taskId === null || a.taskId === (o.taskId ?? null)));
  if (ok) return { decision: 'ALLOW', reason: `approved by ${ok.id}`, approvalId: ok.id };
  return { decision: 'NEEDS_APPROVAL', reason: `${scope} requires approval for this exact operation`, operationHash: hash };
}
