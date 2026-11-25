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

  it('a shell attempt blocked by the deny rule is only recorded; a shell that actually ran is a violation', () => {
    const started = mapCursorEvent(ev({ type: 'tool_call', subtype: 'started', call_id: 'z', tool_call: { shellToolCall: { args: { command: 'ls' } } } }), {}, cwd);
    expect(started).toEqual([{ type: 'tool_call', name: 'Shell', safeArguments: {} }]);
    const denied = mapCursorEvent(ev({ type: 'tool_call', subtype: 'completed', call_id: 'z', tool_call: { shellToolCall: { args: { command: 'ls' }, result: { permissionDenied: { command: 'ls', error: 'Command blocked by permissions configuration' } } } } }), {}, cwd);
    expect(denied).toEqual([{ type: 'tool_result', name: 'Shell', success: false, safeSummary: 'shell bloqueado pela regra do AER' }]);
    for (const tc of [{ shellToolCall: { args: { command: 'ls' }, result: { success: { exitCode: 0 } } } }, { function: { name: 'run_terminal_cmd', arguments: '{}', result: { success: {} } } }]) {
      const ran = mapCursorEvent(ev({ type: 'tool_call', subtype: 'completed', call_id: 'z', tool_call: tc }), {}, cwd);
      expect(ran[0]).toMatchObject({ type: 'error', code: 'SECURITY_VIOLATION' });
    }
  });

  it('the deny rule is set only during the run and the user file is restored exactly', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = await import('node:fs');
    const { withShellDenied } = await import('../src/index.ts');
    const ws = mkdtempSync(path.join(os.tmpdir(), 'aer cursor deny '));
    let during = '';
    await withShellDenied(ws, async () => { during = readFileSync(path.join(ws, '.cursor', 'cli.json'), 'utf8'); });
    expect(JSON.parse(during).permissions.deny).toContain('Shell(*)');
    expect(existsSync(path.join(ws, '.cursor'))).toBe(false); // criado pelo AER, removido depois
    mkdirSync(path.join(ws, '.cursor'));
    const mine = '{ "permissions": { "allow": ["Read(src/**)"], "deny": ["Read(.env*)"] } }\n';
    writeFileSync(path.join(ws, '.cursor', 'cli.json'), mine);
    await withShellDenied(ws, async () => {
      const j = JSON.parse(readFileSync(path.join(ws, '.cursor', 'cli.json'), 'utf8'));
      expect(j.permissions.deny).toEqual(['Read(.env*)', 'Shell(*)']);
      expect(j.permissions.allow).toEqual(['Read(src/**)']);
    });
    expect(readFileSync(path.join(ws, '.cursor', 'cli.json'), 'utf8')).toBe(mine); // byte a byte
    await expect(withShellDenied(ws, async () => { throw new Error('falhou no meio'); })).rejects.toThrow('falhou no meio');
    expect(readFileSync(path.join(ws, '.cursor', 'cli.json'), 'utf8')).toBe(mine); // restaurado mesmo com erro
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
    expect(out.find((e) => e.type === 'error' && /shell/.test((e as { userMessage: string }).userMessage))).toMatchObject({ code: 'SECURITY_VIOLATION' }); // sem a regra, o shell rodou de verdade
    expect(st.done).toBe('success');
    // a leitura fora da pasta do projeto (uma skill em ~/.claude) também é violação
    expect(out.filter((e) => e.type === 'error' && /fora da pasta/.test((e as { userMessage: string }).userMessage))).toHaveLength(1);
  });
});

describe('real run WITH the deny rule (smoke with consent, 25/11/2026)', () => {
  it('the shell is blocked before running: recorded, not a violation; the turn ends normally', async () => {
    const { readFileSync } = await import('node:fs');
    const lines = readFileSync(new URL('./fixtures/real-cursor-2026.11.22-shell-denied.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const st: CursorStreamState = {};
    const out = lines.flatMap((l) => mapCursorEvent(l, st, '/WORKTREE'));
    expect(out.some((e) => e.type === 'error')).toBe(false);
    expect(out).toContainEqual({ type: 'tool_result', name: 'Shell', success: false, safeSummary: 'shell bloqueado pela regra do AER' });
    expect(out.filter((e) => e.type === 'message').map((e) => (e as { text: string }).text)).toContain('SHELL BLOQUEADO');
    expect(st.done).toBe('success');
  });
});

describe('CursorProvider.start with a fake cursor-agent (PHASE-22)', () => {
  it('the deny rule exists while the agent runs and is gone when the stream ends', async () => {
    const { mkdtempSync, writeFileSync, existsSync, readFileSync } = await import('node:fs');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'aer cursor start '));
    const ws = mkdtempSync(path.join(os.tmpdir(), 'aer cursor ws '));
    const seen = path.join(dir, 'seen.txt');
    const f = path.join(dir, 'fake.mjs');
    writeFileSync(f, `import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('2026.11.22-x'); process.exit(0); }
if (a[0] === 'status') { console.log('Logged in'); process.exit(0); }
const ws = a[a.indexOf('--workspace') + 1];
const rule = existsSync(ws + '/.cursor/cli.json') ? readFileSync(ws + '/.cursor/cli.json', 'utf8') : 'NENHUMA';
writeFileSync(${JSON.stringify(seen)}, rule);
console.log(JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } }));
console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok' }));
`);
    const instructionsFile = path.join(dir, 'i.md');
    writeFileSync(instructionsFile, 'faça');
    const p = new CursorProvider(createBaseAdapter(detectPlatform(), 'test'), { executable: process.execPath, prefixArgs: [f] });
    const out: AgentStreamEvent[] = [];
    for await (const e of p.start({ taskId: 'TAR-0001', attemptId: 'ATT-0001', workingDirectory: ws, instructionsFile, allowedPaths: ['.'], deniedPaths: [], mode: 'WORKTREE_WRITE', approvedToolPolicyId: 't', timeoutMs: 10_000, signal: new AbortController().signal })) out.push(e);
    expect(JSON.parse(readFileSync(seen, 'utf8')).permissions.deny).toContain('Shell(*)');
    expect(existsSync(path.join(ws, '.cursor'))).toBe(false);
    expect(out.at(-1)).toMatchObject({ type: 'exit', exitCode: 0 });
  });
});
