import { describe, expect, it } from 'vitest';
import { NdjsonDecoder, decodeToEvents, normalizeEvent, redactText } from '../src/index.ts';

const events = [
  { type: 'status', status: 'STARTED' },
  { type: 'message', text: 'olá ⌘ ção 🚀', visibleToUser: true },
  { type: 'tool_call', name: 'write_file', safeArguments: { path: 'a.txt' } },
];
const wire = Buffer.from(events.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

describe('NdjsonDecoder (AER-REQ-104)', () => {
  it('reassembles events fed one byte at a time, including multi-byte UTF-8 split across chunks', () => {
    const d = new NdjsonDecoder();
    const got = [];
    for (let i = 0; i < wire.length; i++) got.push(...d.push(wire.subarray(i, i + 1)));
    got.push(...d.end());
    expect(got).toEqual(events.map((value) => ({ ok: true, value })));
  });

  it('accepts a last line without newline, CRLF and blank lines', () => {
    const d = new NdjsonDecoder();
    expect([...d.push('{"a":1}\r\n\n{"b"'), ...d.push(':2}'), ...d.end()]).toEqual([{ ok: true, value: { a: 1 } }, { ok: true, value: { b: 2 } }]);
  });

  it('reports invalid JSON and over-long lines without buffering them forever', () => {
    const d = new NdjsonDecoder(16);
    const out = [...d.push('{oops}\n'), ...d.push('x'.repeat(10)), ...d.push('y'.repeat(10)), ...d.push('zz\n{"ok":true}\n'), ...d.end()];
    expect(out.map((l) => (l.ok ? 'OK' : l.code))).toEqual(['INVALID_JSON', 'LINE_TOO_LONG', 'OK']);
  });
});

describe('normalizeEvent (§7.6)', () => {
  it('passes valid contract events and turns unknown shapes into PARSE_ERROR, never success', () => {
    expect(normalizeEvent(events[1])).toEqual(events[1]);
    expect(normalizeEvent({ type: 'teleport' })).toMatchObject({ type: 'error', code: 'PARSE_ERROR' });
    expect(normalizeEvent({ type: 'message', text: 'x', visibleToUser: true, extra: 1 })).toMatchObject({ code: 'PARSE_ERROR' });
    // só o adapter sintetiza o fim do processo; um agente não pode "declarar" exit 0
    expect(normalizeEvent({ type: 'exit', exitCode: 0, signal: null, cancelled: false, reconciled: true })).toMatchObject({ code: 'PARSE_ERROR' });
    expect(decodeToEvents([{ ok: false, code: 'INVALID_JSON', detail: 'x' }])).toEqual([{ type: 'error', code: 'PARSE_ERROR', userMessage: 'INVALID_JSON: x' }]);
  });
});

describe('redactText', () => {
  it('redacts known secret shapes and truncates', () => {
    const r = redactText('key sk-abcdefghijklmnopqrstu token ghp_abcdefghijklmnopqrstuvwxyz Bearer abcdefghijklmnopqrst');
    expect(r.text).toBe('key [REDACTED] token [REDACTED] [REDACTED]');
    expect(r.redacted).toBe(true);
    expect(redactText('a'.repeat(10), 4)).toEqual({ text: 'aaaa…', redacted: false, truncated: true });
  });
});
