import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createBaseAdapter, detectPlatform } from '@aer/platform-core';
import type { AgentStreamEvent } from '@aer/provider-sdk';
import { CodexProvider, classifyCodexError, codexArgs, mapCodexEvent, type CodexStreamState } from '../src/index.ts';

// FALSO binário com o formato documentado (fixtures doc-derived-*). Nenhum Codex real é chamado.
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const fake = path.join(fixtures, 'fake-codex.mjs');
const adapter = createBaseAdapter(detectPlatform(), 'test');
const dir = mkdtempSync(path.join(os.tmpdir(), 'aer codex ç '));
// Windows: taskkill /T termina de forma assíncrona e a pasta pode seguir ocupada por alguns segundos (EBUSY, run 45219403006)
afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }), 30_000);
const log = path.join(dir, 'calls.jsonl');
const env = (x: Record<string, string> = {}) => ({ PATH: process.env.PATH, HOME: process.env.HOME, SystemRoot: process.env.SystemRoot, FAKE_LOG: log, ANTHROPIC_API_KEY: 'sk-ant-nao-deve-chegar-no-codex', ...x });
const provider = (x: Record<string, string> = {}) => new CodexProvider(adapter, { executable: process.execPath, prefixArgs: [fake], env: env(x), graceMs: 200 });

async function run(p: CodexProvider, o: { timeoutMs?: number } = {}): Promise<AgentStreamEvent[]> {
  const instructionsFile = path.join(dir, 'INSTR.md');
  writeFileSync(instructionsFile, '# tarefa de teste\n');
  const out: AgentStreamEvent[] = [];
  for await (const e of p.start({ taskId: 'TAR-0001', attemptId: 'ATT-0001', workingDirectory: dir, instructionsFile, allowedPaths: ['.'], deniedPaths: [], mode: 'WORKTREE_WRITE', approvedToolPolicyId: 't', timeoutMs: o.timeoutMs ?? 10_000, signal: new AbortController().signal })) out.push(e);
  return out;
}
const calls = () => readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { args: string[]; envKeys: string[] });

describe('codex args (TAR-0034)', () => {
  it('uses exec --json in the worktree sandbox and never the dangerous flags', () => {
    const a = codexArgs({ mode: 'WORKTREE_WRITE', workingDirectory: '/w' }, 'faça X');
    expect(a).toEqual(['exec', '--json', '--ephemeral', '-C', '/w', '-s', 'workspace-write', '-c', 'approval_policy="never"', '--', 'faça X']);
    expect(a.join(' ')).not.toMatch(/dangerously|danger-full-access|--trust/);
    expect(codexArgs({ mode: 'READ_ONLY', workingDirectory: '/w', modelPreference: 'gpt-5' }, 'x')).toEqual(expect.arrayContaining(['-s', 'read-only', '-m', 'gpt-5']));
  });
});

describe('mapCodexEvent (doc-derived, UNVERIFIED)', () => {
  it('maps thread/turn/items/usage without logging commands', () => {
    const cwd = '/w/t';
    const st = {};
    const ev = readFileSync(path.join(fixtures, 'doc-derived-ok.jsonl'), 'utf8').replaceAll('__CWD__', cwd).trim().split('\n').flatMap((l) => mapCodexEvent(JSON.parse(l), st, cwd));
    expect(ev.map((e) => e.type)).toEqual(['status', 'status', 'tool_call', 'tool_result', 'file_change', 'message', 'usage', 'usage', 'usage']);
    expect(ev[4]).toEqual({ type: 'file_change', relativePath: 'NOTA.md', kind: 'create' });
    expect(JSON.stringify(ev)).not.toContain('sk-abcdefghijklmnop');
  });

  it('classifies auth expiry apart from rate limits', () => {
    expect(classifyCodexError('your refresh token has expired')).toBe('AUTH_EXPIRED');
    expect(classifyCodexError("You've hit your usage limit")).toBe('RATE_LIMITED');
    expect(classifyCodexError('Not logged in. Run codex login')).toBe('NOT_AUTHENTICATED');
    expect(mapCodexEvent({ type: 'novo.evento' }, {}, '/')).toEqual([{ type: 'status', status: 'UNRECOGNIZED_EVENT', detail: 'novo.evento' }]);
  });
});

describe('mapCodexEvent against REAL captured output (TAR-0035, codex 0.170.0)', () => {
  const replay = (name: string) => {
    const cwd = '/w/t';
    const st: CodexStreamState = {};
    const ev = readFileSync(path.join(fixtures, name), 'utf8').replaceAll('__CWD__', cwd).trim().split('\n').flatMap((l) => mapCodexEvent(JSON.parse(l), st, cwd));
    return { ev, st };
  };
  it('read-only run: message and usage, turn completed, nothing unrecognized', () => {
    const { ev, st } = replay('real-0.170.0-readonly.jsonl');
    expect(ev).toContainEqual({ type: 'message', text: 'OK', visibleToUser: true });
    expect(ev.filter((e) => e.type === 'status' && e.status === 'UNRECOGNIZED_EVENT')).toEqual([]);
    expect(ev.filter((e) => e.type === 'usage').length).toBeGreaterThan(0);
    expect(st.turnEnded).toBe('completed');
  });
  it('write run: file_change "add" item (started + completed) yields exactly one create', () => {
    const { ev, st } = replay('real-0.170.0-write.jsonl');
    expect(ev.filter((e) => e.type === 'file_change')).toEqual([{ type: 'file_change', relativePath: 'nota.txt', kind: 'create' }]);
    expect(st.turnEnded).toBe('completed');
  });
});

describe('CodexProvider with a fake binary', () => {
  it('probe READY / NOT_AUTHENTICATED / UNSUPPORTED_VERSION / NOT_INSTALLED', async () => {
    expect(await provider().probe()).toMatchObject({ availability: 'READY', version: '0.170.0', contractStatus: 'VERIFIED' });
    expect(await provider({ FAKE_VERSION: '0.170.1' }).probe()).toMatchObject({ availability: 'READY', contractStatus: 'UNVERIFIED' });
    expect((await provider({ FAKE_AUTH: 'none' }).probe()).availability).toBe('NOT_AUTHENTICATED');
    expect((await provider({ FAKE_VERSION: '0.171.0' }).probe()).availability).toBe('UNSUPPORTED_VERSION');
    expect((await new CodexProvider(adapter, { env: { PATH: dir } }).probe()).availability).toBe('NOT_INSTALLED');
  });

  it('run ok writes in the worktree; Anthropic credentials never reach codex (AER-REQ-127)', async () => {
    const ev = await run(provider({ FAKE_SCENARIO: 'ok' }));
    expect(ev.at(-1)).toEqual({ type: 'exit', exitCode: 0, signal: null, cancelled: false, reconciled: true });
    expect(ev.some((e) => e.type === 'error')).toBe(false);
    expect(existsSync(path.join(dir, 'NOTA.md'))).toBe(true);
    expect(calls().find((c) => c.args[0] === 'exec')!.envKeys).not.toContain('ANTHROPIC_API_KEY');
  });

  it('auth expired, rate limit and missing turn end are errors, never success', async () => {
    expect((await run(provider({ FAKE_SCENARIO: 'auth' }))).find((e) => e.type === 'error')).toMatchObject({ code: 'AUTH_EXPIRED' });
    expect((await run(provider({ FAKE_SCENARIO: 'ratelimit' }))).find((e) => e.type === 'error')).toMatchObject({ code: 'RATE_LIMITED' });
    expect((await run(provider({ FAKE_SCENARIO: 'noresult' }))).find((e) => e.type === 'error')).toMatchObject({ code: 'NO_RESULT' });
  });

  it('hang + timeout terminates the tree', async () => {
    const ev = await run(provider({ FAKE_SCENARIO: 'hang' }), { timeoutMs: 500 });
    expect(ev.find((e) => e.type === 'error')).toMatchObject({ code: 'TIMEOUT' });
    expect(ev.at(-1)).toMatchObject({ type: 'exit', reconciled: true });
  });
});
