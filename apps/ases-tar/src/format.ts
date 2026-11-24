import type { EventEnvelope } from '@aer/contracts';

/** Uma linha por evento, igual no modo texto e na TUI. */
export function formatEvent(e: EventEnvelope, unicode: boolean): string {
  const p = e.payload as Record<string, unknown>;
  const time = new Date(e.occurredAt).toLocaleTimeString('pt-BR', { hour12: false });
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
