import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { payloadSha256, type EventEnvelope } from '@aer/contracts';

interface EventSource {
  eventsSince(afterSeq: number, limit?: number): EventEnvelope[];
}

/**
 * Reconstrói o espelho HISTORY.jsonl a partir do banco, em ordem de seq (AER-REQ-067).
 * Escreve num temporário e renomeia: uma falha no meio nunca trunca o arquivo válido anterior (§4.3).
 * A transação já confirmada no banco não depende do sucesso do export (§6.4): basta rodar de novo.
 */
export function exportHistory(source: EventSource, file: string, pageSize = 500): { events: number; lastSeq: number } {
  const tmp = `${file}.${process.pid}.tmp`;
  const lines: string[] = [];
  let lastSeq = 0;
  try {
    for (;;) {
      const page = source.eventsSince(lastSeq, pageSize);
      if (!page.length) break;
      for (const e of page) lines.push(JSON.stringify(e));
      lastSeq = page.at(-1)!.seq;
    }
    // shortcut: monta o arquivo em memória; trocar por stream incremental quando o histórico passar de ~100 mil eventos
    writeFileSync(tmp, lines.length ? `${lines.join('\n')}\n` : '', 'utf8');
    renameSync(tmp, file);
  } catch (err) {
    if (existsSync(tmp)) rmSync(tmp);
    throw err;
  }
  return { events: lines.length, lastSeq };
}

/** Detecta lacunas, duplicatas, JSON inválido e payload adulterado (AER-REQ-068). */
export function verifyHistory(file: string): { events: number; problems: string[] } {
  const problems: string[] = [];
  const ids = new Set<string>();
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  lines.forEach((line, i) => {
    let e: EventEnvelope;
    try {
      e = JSON.parse(line) as EventEnvelope;
    } catch {
      problems.push(`line ${i + 1}: invalid JSON`);
      return;
    }
    if (e.seq !== i + 1) problems.push(`line ${i + 1}: expected seq ${i + 1}, got ${e.seq}`);
    if (ids.has(e.eventId)) problems.push(`line ${i + 1}: duplicate eventId ${e.eventId}`);
    ids.add(e.eventId);
    if (payloadSha256(e.payload) !== e.payloadSha256) problems.push(`line ${i + 1}: payloadSha256 mismatch (seq ${e.seq})`);
  });
  return { events: lines.length, problems };
}
