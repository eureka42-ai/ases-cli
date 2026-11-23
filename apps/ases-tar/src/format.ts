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
