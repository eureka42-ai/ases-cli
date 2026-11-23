import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createBaseAdapter, detectPlatform } from '@aer/platform-core';
import type { AgentStreamEvent } from '@aer/provider-sdk';
import { ClaudeCodeProvider, claudeArgs, classifyClaudeError, mapClaudeEvent, type ClaudeStreamState } from '../src/index.ts';

// Os testes usam um FALSO binário com o formato documentado (fixtures doc-derived-*). Nenhum Claude real é chamado.
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const fake = path.join(fixtures, 'fake-claude.mjs');
const adapter = createBaseAdapter(detectPlatform(), 'test');
const dir = mkdtempSync(path.join(os.tmpdir(), 'aer claude ç '));
// Windows: taskkill /T termina de forma assíncrona e a pasta pode seguir ocupada por alguns segundos (EBUSY, run 45219403006)
afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }), 30_000);
const log = path.join(dir, 'calls.jsonl');
const env = (x: Record<string, string> = {}) => ({ PATH: process.env.PATH, HOME: process.env.HOME, SystemRoot: process.env.SystemRoot, FAKE_LOG: log, OPENAI_API_KEY: 'sk-nao-deve-chegar-no-claude-0000', GEMINI_API_KEY: 'x', ...x });
const provider = (x: Record<string, string> = {}) => new ClaudeCodeProvider(adapter, { executable: process.execPath, prefixArgs: [fake], env: env(x), graceMs: 200 });

async function run(p: ClaudeCodeProvider, o: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<AgentStreamEvent[]> {
  const instructionsFile = path.join(dir, 'INSTR.md');
  writeFileSync(instructionsFile, '# tarefa de teste\n');
  const out: AgentStreamEvent[] = [];
  for await (const e of p.start({ taskId: 'TAR-0001', attemptId: 'ATT-0001', workingDirectory: dir, instructionsFile, allowedPaths: ['.'], deniedPaths: [], mode: 'WORKTREE_WRITE', approvedToolPolicyId: 't', timeoutMs: o.timeoutMs ?? 10_000, signal: o.signal ?? new AbortController().signal })) out.push(e);
  return out;
}
const calls = () => readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { args: string[]; envKeys: string[] });

describe('claude args (TAR-0033)', () => {
  it('uses documented headless flags and never the dangerous ones', () => {
    const a = claudeArgs({ mode: 'WORKTREE_WRITE' }, 'faça X');
    expect(a.slice(0, 2)).toEqual(['-p', 'faça X']);
    expect(a).toEqual(expect.arrayContaining(['--output-format', 'stream-json', '--verbose', '--restricted', '--no-session-persistence', '--strict-mcp-config']));
    expect(a.join(' ')).not.toMatch(/dangerously|bypassPermissions|--bare/);
    expect(claudeArgs({ mode: 'READ_ONLY', modelPreference: 'sonnet' }, 'x')).toEqual(expect.arrayContaining(['--permission-mode', 'plan', '--tools', 'Read,Grep,Glob', '--model', 'sonnet']));
  });
});

describe('mapClaudeEvent (doc-derived, UNVERIFIED)', () => {
  it('maps init/text/tool_use/tool_result/result, redacts and keeps only safe tool arguments', () => {
    const cwd = '/w/t';
    const st = {};
    const lines = readFileSync(path.join(fixtures, 'doc-derived-ok.jsonl'), 'utf8').replaceAll('__CWD__', cwd).trim().split('\n').map((l) => JSON.parse(l));
    const ev = lines.flatMap((l) => mapClaudeEvent(l, st, cwd));
    expect(ev.map((e) => e.type)).toEqual(['status', 'message', 'tool_call', 'file_change', 'tool_result', 'message', 'usage', 'usage', 'usage', 'usage']);
    expect(ev[2]).toEqual({ type: 'tool_call', name: 'Write', safeArguments: { keys: ['file_path', 'content'], file_path: '/w/t/NOTA.md' } });
    expect(JSON.stringify(ev)).not.toContain('sk-abcdefghijklmnop'); // conteúdo do arquivo não vaza
    expect(ev[3]).toEqual({ type: 'file_change', relativePath: 'NOTA.md', kind: 'create' });
    expect(ev.filter((e) => e.type === 'usage').map((e) => (e as { metric: string }).metric)).toEqual(['TOKENS_INPUT', 'TOKENS_OUTPUT', 'TOKENS_CACHE_READ', 'TOKENS_CACHE_WRITE']);
  });

  it('file outside the worktree stays absolute so the worker rejects it', () => {
    const ev = mapClaudeEvent({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/etc/passwd' } }] } }, {}, '/w/t');
    expect(ev[1]).toEqual({ type: 'file_change', relativePath: '/etc/passwd', kind: 'modify' });
  });

  it('unknown vendor event types are recorded, not fatal; non-objects are PARSE_ERROR', () => {
    expect(mapClaudeEvent({ type: 'novidade_2027' }, {}, '/')).toEqual([{ type: 'status', status: 'UNRECOGNIZED_EVENT', detail: 'novidade_2027' }]);
    expect(mapClaudeEvent([1], {}, '/')[0]).toMatchObject({ code: 'PARSE_ERROR' });
  });

  it('classifies auth expiry apart from rate limits (AER-REQ-107/125)', () => {
    expect(classifyClaudeError('Not logged in · Please run /login')).toBe('NOT_AUTHENTICATED');
    expect(classifyClaudeError('OAuth token has expired')).toBe('AUTH_EXPIRED');
    expect(classifyClaudeError('Claude usage limit reached')).toBe('RATE_LIMITED');
    expect(classifyClaudeError('boom')).toBe('TASK_FAILED');
  });
});

describe('mapClaudeEvent against REAL captured output (TAR-0035, claude 2.1.330)', () => {
  const replay = (name: string) => {
    const cwd = '/w/t';
    const st: ClaudeStreamState = {};
    const ev = readFileSync(path.join(fixtures, name), 'utf8').replaceAll('__CWD__', cwd).trim().split('\n').flatMap((l) => mapClaudeEvent(JSON.parse(l), st, cwd));
    return { ev, st };
  };
  it('read-only run: init, text, rate-limit status, usage; nothing unrecognized', () => {
    const { ev, st } = replay('real-2.1.330-readonly.jsonl');
    expect(ev.filter((e) => e.type === 'status' && e.status === 'UNRECOGNIZED_EVENT')).toEqual([]);
    expect(ev).toContainEqual({ type: 'message', text: 'OK', visibleToUser: true });
    expect(ev).toContainEqual({ type: 'status', status: 'RATE_LIMIT_ALLOWED', detail: 'five_hour' });
    expect(ev.filter((e) => e.type === 'usage')).toHaveLength(4);
    expect(st.result?.isError).toBe(false);
  });
  it('write run: Write tool becomes a relative file_change inside the worktree', () => {
    const { ev, st } = replay('real-2.1.330-write.jsonl');
    expect(ev.filter((e) => e.type === 'file_change')).toEqual([{ type: 'file_change', relativePath: 'nota.txt', kind: 'create' }]);
    expect(ev.filter((e) => e.type === 'status' && e.status === 'UNRECOGNIZED_EVENT')).toEqual([]);
    expect(ev.some((e) => e.type === 'tool_result' && e.success)).toBe(true);
    expect(st.result?.isError).toBe(false);
  });
});

describe('ClaudeCodeProvider with a fake binary', () => {
  it('probe: READY via the official status command, VERIFIED only for the captured version, no email in evidence', async () => {
    const p = await provider().probe();
    expect(p).toMatchObject({ availability: 'READY', version: '2.1.330', contractStatus: 'VERIFIED', simulated: false });
    expect(JSON.stringify(p)).not.toContain('example.invalid');
    expect(calls().map((c) => c.args)).toEqual([['--version'], ['auth', 'status']]);
    expect(await provider({ FAKE_VERSION: '2.1.331' }).probe()).toMatchObject({ availability: 'READY', contractStatus: 'UNVERIFIED' });
  });

  it('probe states: NOT_INSTALLED, NOT_AUTHENTICATED, AUTH_EXPIRED, UNSUPPORTED_VERSION (AER-REQ-103/125)', async () => {
    expect((await new ClaudeCodeProvider(adapter, { env: { PATH: dir } }).probe()).availability).toBe('NOT_INSTALLED');
    expect((await provider({ FAKE_AUTH: 'none' }).probe()).availability).toBe('NOT_AUTHENTICATED');
    expect((await provider({ FAKE_AUTH: 'expired' }).probe()).availability).toBe('AUTH_EXPIRED');
    expect((await provider({ FAKE_VERSION: '3.0.0' }).probe()).availability).toBe('UNSUPPORTED_VERSION');
  });

  it('run ok: events, file written, exit 0 reconciled; other providers\' credentials are not passed (AER-REQ-127)', async () => {
    const ev = await run(provider({ FAKE_SCENARIO: 'ok' }));
    expect(ev.at(-1)).toEqual({ type: 'exit', exitCode: 0, signal: null, cancelled: false, reconciled: true });
    expect(ev.some((e) => e.type === 'error')).toBe(false);
    expect(existsSync(path.join(dir, 'NOTA.md'))).toBe(true);
    const runCall = calls().find((c) => c.args[0] === '-p')!;
    expect(runCall.envKeys).not.toContain('OPENAI_API_KEY');
    expect(runCall.envKeys).not.toContain('GEMINI_API_KEY');
  });

  it('auth error and rate limit end as distinct errors; missing result is never success', async () => {
    expect((await run(provider({ FAKE_SCENARIO: 'auth' }))).find((e) => e.type === 'error')).toMatchObject({ code: 'NOT_AUTHENTICATED' });
    expect((await run(provider({ FAKE_SCENARIO: 'ratelimit' }))).find((e) => e.type === 'error')).toMatchObject({ code: 'RATE_LIMITED' });
    expect((await run(provider({ FAKE_SCENARIO: 'noresult' }))).find((e) => e.type === 'error')).toMatchObject({ code: 'NO_RESULT' });
  });

  it('hang + timeout: tree terminated, TIMEOUT', async () => {
    const ev = await run(provider({ FAKE_SCENARIO: 'hang' }), { timeoutMs: 500 });
    expect(ev.find((e) => e.type === 'error')).toMatchObject({ code: 'TIMEOUT' });
    expect(ev.at(-1)).toMatchObject({ type: 'exit', reconciled: true });
  });

  it('not ready: no run process is ever spawned', async () => {
    const before = calls().length;
    const ev = await run(provider({ FAKE_AUTH: 'none' }));
    expect(ev[0]).toMatchObject({ type: 'error', code: 'NOT_AUTHENTICATED' });
    expect(calls().slice(before).every((c) => c.args[0] !== '-p')).toBe(true);
  });
});
