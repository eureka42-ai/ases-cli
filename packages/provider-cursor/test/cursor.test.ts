import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createBaseAdapter, detectPlatform } from '@aer/platform-core';
import type { AgentStreamEvent } from '@aer/provider-sdk';
import { CursorProvider, cursorArgs, cursorFinishError, mapCursorEvent, type CursorStreamState } from '../src/index.ts';

// Eventos no formato DOCUMENTADO em cursor.com/docs/cli/reference/output-format (24/11/2026). Sem saída real capturada:
// o contrato fica UNVERIFIED até um smoke real com login.
const cwd = '/w/t';
const ev = (o: Record<string, unknown>) => o;

describe('cursor args (PHASE-21)', () => {
  it('print mode with stream-json, sandbox on, trusted headless workspace, never --force/--yolo', () => {
    const a = cursorArgs({ mode: 'WORKTREE_WRITE', workingDirectory: cwd }, 'faça X');
    expect(a).toEqual(['-p', '--output-format', 'stream-json', '--sandbox', 'enabled', '--trust', '--workspace', cwd, 'faça X']);
    expect(a.join(' ')).not.toMatch(/--force|--yolo|-f\b|approve-mcps/);
    expect(cursorArgs({ mode: 'READ_ONLY', workingDirectory: cwd, modelPreference: 'gpt-5' }, 'x')).toEqual(expect.arrayContaining(['--mode', 'ask', '--model', 'gpt-5']));
  });
});

describe('mapCursorEvent (documented stream-json)', () => {
  it('assistant text, tool calls, writes become file changes; result ends the turn', () => {
    const st: CursorStreamState = {};
    expect(mapCursorEvent(ev({ type: 'system', subtype: 'init', cwd, session_id: 's', model: 'Claude 4 Sonnet', permissionMode: 'default', apiKeySource: 'login' }), st, cwd)).toEqual([{ type: 'status', status: 'INIT', detail: 'Claude 4 Sonnet' }]);
    expect(mapCursorEvent(ev({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Vou ler o README.' }] }, session_id: 's' }), st, cwd)).toEqual([{ type: 'message', text: 'Vou ler o README.', visibleToUser: true }]);
    expect(mapCursorEvent(ev({ type: 'tool_call', subtype: 'started', call_id: 'c1', tool_call: { readToolCall: { args: { path: 'README.md' } } }, session_id: 's' }), st, cwd)).toEqual([{ type: 'tool_call', name: 'Read', safeArguments: { path: 'README.md' } }]);
    expect(mapCursorEvent(ev({ type: 'tool_call', subtype: 'started', call_id: 'c2', tool_call: { writeToolCall: { args: { path: 'docs/a.md', fileText: 'segredo grande', toolCallId: 'x' } } }, session_id: 's' }), st, cwd)).toEqual([{ type: 'tool_call', name: 'Write', safeArguments: { path: 'docs/a.md' } }]);
    expect(mapCursorEvent(ev({ type: 'tool_call', subtype: 'completed', call_id: 'c2', tool_call: { writeToolCall: { args: { path: 'docs/a.md' }, result: { success: { path: '/w/t/docs/a.md', linesCreated: 3, fileSize: 20 } } } }, session_id: 's' }), st, cwd)).toEqual([{ type: 'file_change', relativePath: 'docs/a.md', kind: 'modify' }, { type: 'tool_result', name: 'Write', success: true, safeSummary: 'docs/a.md (3 linhas)' }]);
    expect(mapCursorEvent(ev({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1200, duration_api_ms: 1200, result: 'pronto', session_id: 's' }), st, cwd)).toEqual([]);
    expect(st.done).toBe('success');
    expect(mapCursorEvent(ev({ type: 'reconnecting' }), st, cwd)).toEqual([]); // eventos não documentados são ignorados
  });

  it('any shell/terminal tool is a security violation (the AER never lets an agent use a shell)', () => {
    for (const tc of [{ shellToolCall: { args: { command: 'rm -rf /' } } }, { function: { name: 'run_terminal_cmd', arguments: '{"command":"ls"}' } }, { bashToolCall: { args: {} } }]) {
      const out = mapCursorEvent(ev({ type: 'tool_call', subtype: 'started', call_id: 'z', tool_call: tc, session_id: 's' }), {}, cwd);
      expect(out[0]).toMatchObject({ type: 'error', code: 'SECURITY_VIOLATION' });
    }
  });

  it('result with is_error is a failure; no terminal event explains stderr', () => {
    const st: CursorStreamState = {};
    expect(mapCursorEvent(ev({ type: 'result', subtype: 'error', is_error: true, result: 'quota exceeded' }), st, cwd)).toEqual([{ type: 'error', code: 'RATE_LIMITED', userMessage: 'quota exceeded' }]);
    expect(cursorFinishError(1, "Error: Authentication required. Run 'agent login'")).toMatchObject({ code: 'NOT_AUTHENTICATED', userMessage: expect.stringMatching(/Authentication required/) });
  });
});

describe('CursorProvider.probe (fake cursor-agent)', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aer cursor '));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const adapter = createBaseAdapter(detectPlatform(), 'test');
  const fake = (status: string) => {
    const f = path.join(dir, `fake-${Math.random()}.mjs`);
    writeFileSync(f, `const a = process.argv.slice(2);\nif (a[0] === '--version') { console.log('2026.11.19-f005e9d'); process.exit(0); }\nif (a[0] === 'status') { console.log(${JSON.stringify(status)}); process.exit(0); }\nprocess.exit(2);\n`);
    return new CursorProvider(adapter, { executable: process.execPath, prefixArgs: [f] });
  };
  it('not logged in is NOT_AUTHENTICATED, never READY', async () => {
    expect((await fake('Not logged in').probe())).toMatchObject({ availability: 'NOT_AUTHENTICATED', version: '2026.11.19', contractStatus: 'UNVERIFIED' });
  });
  it('logged in is READY but UNVERIFIED (no real output captured yet)', async () => {
    const p = await fake('✓ Logged in as alguem@example.invalid').probe();
    expect(p).toMatchObject({ availability: 'READY', contractStatus: 'UNVERIFIED', providerId: 'cursor' });
    expect(p.evidence.join(' ')).not.toContain('@'); // e-mail da conta nunca vai para evidência
  });
  it('requires consent (your account and quota)', () => {
    expect(fake('x').requiresConsent).toBe(true);
  });
});

const _types: AgentStreamEvent[] = [];
void _types;

describe('real cursor-agent 2026.11.22 output (smoke with consent, 25/11/2026)', () => {
  it('maps the real stream: messages, the edit as a file change, and the shell attempt as a violation', async () => {
    const { readFileSync } = await import('node:fs');
    const lines = readFileSync(new URL('./fixtures/real-cursor-2026.11.22-write-and-shell.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const st: CursorStreamState = {};
    const out = lines.flatMap((l) => mapCursorEvent(l, st, '/WORKTREE'));
    expect(out.filter((e) => e.type === 'message').map((e) => (e as { text: string }).text)[0]).toBe('Vou criar `NOTA.md` e em seguida rodar `ls`.');
    expect(out).toContainEqual({ type: 'file_change', relativePath: 'NOTA.md', kind: 'modify' });
    expect(out.find((e) => e.type === 'error')).toMatchObject({ code: 'SECURITY_VIOLATION' }); // o shellToolCall real
    expect(st.done).toBe('success');
    // a leitura fora da pasta do projeto (uma skill em ~/.claude) também é violação
    expect(out.filter((e) => e.type === 'error' && /fora da pasta/.test((e as { userMessage: string }).userMessage))).toHaveLength(1);
  });
});
