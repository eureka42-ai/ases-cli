import type { EventEnvelope } from '@aer/contracts';
import { describeToolCall } from '@aer/provider-sdk';

/**
 * PHASE-19: a ação, em português e na hora: qual IA, qual tarefa (ou "principal", no chat) e o que está fazendo.
 * Eventos sem ação legível devolvem undefined e ficam com a linha técnica.
 */
export function actionText(e: EventEnvelope): string | undefined {
  const p = e.payload as Record<string, unknown>;
  const who = String(p.providerId ?? p.provider ?? '');
  const where = e.taskId ? `${who} · ${e.taskId}` : `${who} (principal)`;
  const short = (t: unknown, n = 60) => {
    const s = String(t ?? '').replace(/\s+/g, ' ').trim();
    // corta na palavra, não no meio dela
    if (s.length <= n) return s;
    const cut = /\s/.test(s[n]!) ? s.slice(0, n) : s.slice(0, n).replace(/\s+\S*$/, '');
    return `${cut.trimEnd()}…`;
  };
  switch (e.eventType) {
    case 'ProviderToolCallObserved': {
      let args: unknown = p.arguments;
      try {
        args = typeof p.arguments === 'string' ? JSON.parse(p.arguments) : p.arguments;
      } catch {
        // argumentos redigidos/cortados: só o nome
      }
      return `${where} · ${describeToolCall(String(p.name), args)}`;
    }
    case 'ProviderToolResultObserved': {
      if (p.name !== 'file_change') return undefined;
      const [kind = '', ...file] = String(p.summary ?? '').split(' ');
      return `${where} · ${kind === 'create' ? 'Criou' : kind === 'delete' ? 'Apagou' : 'Editou'} ${file.join(' ')}`;
    }
    case 'ChatMessageAdded':
      return p.role === 'user' ? `você: ${short(p.text)}` : p.role === 'main' ? `${who} respondeu: ${short(p.text)}` : undefined;
    case 'PlanProposed': {
      const tasks = (p.tasks as { provider: string }[] | undefined) ?? [];
      return `plano ${String(p.planId)}: ${tasks.length} tarefa${tasks.length === 1 ? '' : 's'} → ${[...new Set(tasks.map((t) => t.provider))].join(', ')}`;
    }
    case 'AttemptStarted':
      return `${who} começou ${e.taskId ?? ''}`.trimEnd();
    case 'MainProviderChanged':
      return `principal: ${String(p.from)} → ${String(p.to)}`;
    default:
      return undefined;
  }
}

/** Uma linha por evento, igual no modo texto e na TUI. */
export function formatEvent(e: EventEnvelope, unicode: boolean): string {
  const p = e.payload as Record<string, unknown>;
  const time = new Date(e.occurredAt).toLocaleTimeString('pt-BR', { hour12: false });
  const action = actionText(e);
  if (action) return `#${String(e.seq).padStart(4, '0')} ${time} ${action}`;
  const arrow = unicode ? '→' : '->';
  const what = typeof p.from === 'string'
    ? `${String(p.from)} ${arrow} ${String(p.to)}${p.reason ? ` (${String(p.reason)})` : ''}`
    : typeof p.title === 'string' ? `"${p.title}"` : '';
  return `#${String(e.seq).padStart(4, '0')} ${time} ${e.eventType.padEnd(18)} ${e.taskId ?? e.phaseId ?? ''} ${what}`.trimEnd();
}

export type Severity = 'info' | 'warning' | 'error' | 'critical';

/** Severidade derivada do tipo e do payload (o envelope não tem campo próprio); usada por `--errors` (AER-REQ-095). */
export function eventSeverity(e: EventEnvelope): Severity {
  const p = e.payload as Record<string, unknown>;
  switch (e.eventType) {
    case 'SecurityViolationBlocked': return 'critical';
    case 'TaskFailed': case 'TaskBlocked': case 'ProviderUnavailable': case 'ApprovalDenied': return 'error';
    case 'AttemptExited': return p.state === 'FAILED' || p.state === 'UNKNOWN' ? 'error' : 'info';
    case 'TestRunCompleted': return p.exitCode !== 0 || Number(p.failed) > 0 ? 'error' : 'info';
    case 'TaskReworkRequested': case 'TaskCancelled': case 'RecoveryStarted': return 'warning';
    default: return 'info';
  }
}
export const isError = (e: EventEnvelope) => { const s = eventSeverity(e); return s === 'error' || s === 'critical'; };
