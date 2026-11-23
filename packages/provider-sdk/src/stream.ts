import { StringDecoder } from 'node:string_decoder';
import { z } from 'zod';
import type { AgentStreamEvent } from './types.ts';

export type DecodedLine = { ok: true; value: unknown } | { ok: false; code: 'INVALID_JSON' | 'LINE_TOO_LONG'; detail: string };

/**
 * NDJSON incremental (AER-REQ-104, §7.6): chunks podem cortar uma linha ou um caractere UTF-8 ao meio; linha acima do
 * limite é descartada até o próximo '\n' e vira um erro (nunca cresce memória sem limite).
 */
export class NdjsonDecoder {
  private readonly decoder = new StringDecoder('utf8');
  private buf = '';
  private skipping = false;
  private readonly maxLineBytes: number;
  constructor(maxLineBytes = 1024 * 1024) {
    this.maxLineBytes = maxLineBytes;
  }

  push(chunk: Buffer | string): DecodedLine[] {
    return this.take(typeof chunk === 'string' ? chunk : this.decoder.write(chunk), false);
  }

  end(): DecodedLine[] {
    return this.take(this.decoder.end(), true);
  }

  private take(text: string, final: boolean): DecodedLine[] {
    const out: DecodedLine[] = [];
    this.buf += text;
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (this.skipping) this.skipping = false;
      else this.line(line, out);
    }
    if (!this.skipping && Buffer.byteLength(this.buf) > this.maxLineBytes) {
      out.push({ ok: false, code: 'LINE_TOO_LONG', detail: `line exceeds ${this.maxLineBytes} bytes; discarded` });
      this.buf = '';
      this.skipping = true;
    }
    if (final) {
      if (!this.skipping) this.line(this.buf, out);
      this.buf = '';
      this.skipping = false;
    }
    return out;
  }

  private line(raw: string, out: DecodedLine[]): void {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) return;
    if (Buffer.byteLength(line) > this.maxLineBytes) {
      out.push({ ok: false, code: 'LINE_TOO_LONG', detail: `line exceeds ${this.maxLineBytes} bytes; discarded` });
      return;
    }
    try {
      out.push({ ok: true, value: JSON.parse(line) });
    } catch {
      out.push({ ok: false, code: 'INVALID_JSON', detail: `invalid JSON line (${Buffer.byteLength(line)} bytes)` });
    }
  }
}

const text = z.string().max(64 * 1024);
const AgentStreamEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('message'), text, visibleToUser: z.boolean() }),
  z.strictObject({ type: z.literal('tool_call'), name: z.string().min(1).max(200), safeArguments: z.unknown() }),
  z.strictObject({ type: z.literal('tool_result'), name: z.string().min(1).max(200), success: z.boolean(), safeSummary: text }),
  z.strictObject({ type: z.literal('file_change'), relativePath: z.string().min(1).max(4096), kind: z.enum(['create', 'modify', 'delete']) }),
  z.strictObject({ type: z.literal('usage'), metric: z.string().min(1), value: z.number().finite(), unit: z.string().min(1), source: z.string().min(1) }),
  z.strictObject({ type: z.literal('approval_request'), operationHash: z.string().regex(/^[0-9a-f]{64}$/), description: text }),
  z.strictObject({ type: z.literal('status'), status: z.string().min(1).max(100), detail: text.optional() }),
  z.strictObject({ type: z.literal('error'), code: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/), userMessage: text }),
]);

/**
 * Valida um objeto do agente contra o contrato. Formato desconhecido vira `error` PARSE_ERROR, nunca sucesso (§7.6).
 * `exit` não é aceito daqui: só o adapter o sintetiza, a partir do processo real.
 */
export function normalizeEvent(value: unknown): AgentStreamEvent {
  const r = AgentStreamEventSchema.safeParse(value);
  if (r.success) return r.data as AgentStreamEvent;
  const type = typeof value === 'object' && value !== null && 'type' in value ? String((value as { type: unknown }).type).slice(0, 40) : '?';
  return { type: 'error', code: 'PARSE_ERROR', userMessage: `unrecognized event from agent (type ${type})` };
}

export function decodeToEvents(lines: DecodedLine[]): AgentStreamEvent[] {
  return lines.map((l) => (l.ok ? normalizeEvent(l.value) : { type: 'error', code: 'PARSE_ERROR', userMessage: `${l.code}: ${l.detail}` }));
}
