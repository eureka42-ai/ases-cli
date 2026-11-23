import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createBaseAdapter, detectPlatform } from '@aer/platform-core';
import type { AgentStreamEvent } from '@aer/provider-sdk';
import { AcpProvider, GEMINI_SPEC, KIMI_SPEC, OPENCODE_SPEC, decidePermission, insideWorktree, type AcpSpec } from '../src/index.ts';

// FALSO servidor ACP (fixtures/fake-acp.mjs). Nenhum Kimi/OpenCode/Gemini real é chamado.
const fake = fileURLToPath(new URL('./fixtures/fake-acp.mjs', import.meta.url));
const adapter = createBaseAdapter(detectPlatform(), 'test');
const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'aer acp ç ')));
// Windows: taskkill /T termina de forma assíncrona e a pasta pode seguir ocupada por alguns segundos (EBUSY)
afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }), 30_000);
const log = path.join(root, 'calls.jsonl');
let n = 0;
const env = (x: Record<string, string> = {}) => ({ PATH: process.env.PATH, HOME: process.env.HOME, SystemRoot: process.env.SystemRoot, FAKE_LOG: log, ANTHROPIC_API_KEY: 'sk-ant-nao-deve-chegar-0000', OPENAI_API_KEY: 'sk-nao-deve-chegar-0000', ...x });
const provider = (spec: AcpSpec, x: Record<string, string> = {}) => new AcpProvider(adapter, spec, { executable: process.execPath, prefixArgs: [fake], env: env(x), graceMs: 300 });

async function run(p: AcpProvider, o: { mode?: 'READ_ONLY' | 'WORKTREE_WRITE'; timeoutMs?: number; signal?: AbortSignal } = {}) {
  const wt = path.join(root, `wt${++n}`);
  (await import('node:fs')).mkdirSync(wt);
  const instructionsFile = path.join(root, `INSTR${n}.md`);
  writeFileSync(instructionsFile, '# tarefa de teste\n');
  const ev: AgentStreamEvent[] = [];
  for await (const e of p.start({ taskId: 'TAR-0001', attemptId: `ATT-${n}`, workingDirectory: wt, instructionsFile, allowedPaths: ['.'], deniedPaths: [], mode: o.mode ?? 'WORKTREE_WRITE', approvedToolPolicyId: 't', timeoutMs: o.timeoutMs ?? 10_000, signal: o.signal ?? new AbortController().signal })) ev.push(e);
  return { ev, wt };
}
const calls = () => readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const replies = () => calls().filter((c) => c.recv && !c.recv.method && c.recv.id >= 100).map((c) => c.recv);
const types = (ev: AgentStreamEvent[]) => ev.map((e) => (e.type === 'status' ? `status:${e.status}` : e.type));

describe('permission policy (TAR-0038)', () => {
  it('allows reads and in-worktree edits only; never shell, fetch, unknown kinds or escapes', () => {
    const w = '/w/t';
    expect(decidePermission({ kind: 'read', locations: ['/w/t/a'] }, 'READ_ONLY', w).allow).toBe(true);
    expect(decidePermission({ kind: 'edit', locations: ['/w/t/a'] }, 'WORKTREE_WRITE', w).allow).toBe(true);
    expect(decidePermission({ kind: 'edit', locations: ['/w/t/a'] }, 'READ_ONLY', w).allow).toBe(false);
    expect(decidePermission({ kind: 'edit', locations: [] }, 'WORKTREE_WRITE', w).allow).toBe(false);
    expect(decidePermission({ kind: 'edit', locations: ['/w/t2/a'] }, 'WORKTREE_WRITE', w).allow).toBe(false);
    expect(decidePermission({ kind: 'read', locations: ['/w/t/../../etc/passwd'] }, 'WORKTREE_WRITE', w).allow).toBe(false);
    for (const kind of ['execute', 'fetch', 'delete', 'move', 'other', undefined]) expect(decidePermission({ kind, locations: [] }, 'WORKTREE_WRITE', w).allow).toBe(false);
    expect(insideWorktree('C:\\w\\t', 'C:\\w\\t\\x.md')).toBe(true);
  });
});

describe('AcpProvider with a fake ACP server', () => {
  it('ok: initialize → session/new → prompt; edit permission granted once; file_change; exit 0 reconciled', async () => {
    rmSync(log, { force: true });
    const { ev, wt } = await run(provider(KIMI_SPEC));
    expect(types(ev)).toEqual(['status:INIT', 'status:SESSION_STARTED', 'message', 'tool_call', 'status:PERMISSION_GRANTED', 'tool_result', 'file_change', 'message', 'exit']);
    expect(ev.find((e) => e.type === 'file_change')).toEqual({ type: 'file_change', relativePath: 'NOTA.md', kind: 'modify' });
    expect(ev.at(-1)).toMatchObject({ type: 'exit', exitCode: 0, cancelled: false, reconciled: true });
    expect(existsSync(path.join(wt, 'NOTA.md'))).toBe(true);
    expect(replies()).toEqual([expect.objectContaining({ result: { outcome: { outcome: 'selected', optionId: 'a1' } } })]); // allow_once, nunca allow_always
    const s = JSON.stringify(ev);
    expect(s).not.toContain('sk-abcdefghijklmnop'); // pensamento e rawInput não vão para o log
    expect(s).not.toContain('pensando');
    const first = calls()[0];
    expect(first.args).toEqual(['acp']);
    expect(first.envKeys).not.toContain('ANTHROPIC_API_KEY');
    expect(first.envKeys).not.toContain('OPENAI_API_KEY');
  });

  it('shell (execute) is rejected once (reject_once) and the tool result is reported as failed', async () => {
    rmSync(log, { force: true });
    const { ev } = await run(provider(KIMI_SPEC, { FAKE_SCENARIO: 'shell' }));
    expect(ev).toContainEqual(expect.objectContaining({ type: 'status', status: 'PERMISSION_DENIED' }));
    expect(ev).toContainEqual(expect.objectContaining({ type: 'tool_result', success: false }));
    expect(replies()[0].result.outcome.optionId).toBe('r1');
  });

  it('edit outside the worktree is denied and nothing is written', async () => {
    rmSync(log, { force: true });
    const { ev } = await run(provider(KIMI_SPEC, { FAKE_SCENARIO: 'escape' }));
    expect(ev.find((e) => e.type === 'status' && e.status === 'PERMISSION_DENIED')).toMatchObject({ detail: expect.stringContaining('outside worktree') });
    expect(ev.some((e) => e.type === 'file_change')).toBe(false);
  });

  it('READ_ONLY mode denies edits', async () => {
    rmSync(log, { force: true });
    const { ev, wt } = await run(provider(KIMI_SPEC), { mode: 'READ_ONLY' });
    expect(ev).toContainEqual(expect.objectContaining({ type: 'status', status: 'PERMISSION_DENIED' }));
    expect(existsSync(path.join(wt, 'NOTA.md'))).toBe(false);
  });

  it('auth required at session/new → NOT_AUTHENTICATED; missing prompt result → NO_RESULT; garbage → PARSE_ERROR; refusal → REFUSED; ACP v2 → UNSUPPORTED_VERSION', async () => {
    const code = async (scenario: string) => (await run(provider(KIMI_SPEC, { FAKE_SCENARIO: scenario }))).ev.filter((e) => e.type === 'error').map((e) => (e as { code: string }).code);
    expect(await code('auth')).toEqual(['NOT_AUTHENTICATED']);
    expect(await code('noresult')).toEqual(['NO_RESULT']);
    expect(await code('garbage')).toContain('PARSE_ERROR');
    expect(await code('refusal')).toEqual(['REFUSED']);
    expect(await code('v2')).toEqual(['UNSUPPORTED_VERSION']);
  });

  it('client methods (fs/*) are refused with a JSON-RPC error instead of hanging', async () => {
    rmSync(log, { force: true });
    const { ev } = await run(provider(KIMI_SPEC, { FAKE_SCENARIO: 'fsread' }));
    expect(ev).toContainEqual({ type: 'status', status: 'CLIENT_METHOD_REFUSED', detail: 'fs/read_text_file' });
    expect(calls().find((c) => c.fsReply)?.fsReply.error.code).toBe(-32601);
    expect(ev.at(-1)).toMatchObject({ type: 'exit', exitCode: 0 });
  });

  it('a hung agent is terminated at the timeout (tree reconciled)', async () => {
    const { ev } = await run(provider(KIMI_SPEC, { FAKE_SCENARIO: 'hang' }), { timeoutMs: 1500 });
    expect(ev).toContainEqual(expect.objectContaining({ type: 'error', code: 'TIMEOUT' }));
    expect(ev.at(-1)).toMatchObject({ type: 'exit', reconciled: true });
  });

  it('opencode: acp --cwd <worktree> and permission forced to ask via OPENCODE_CONFIG_CONTENT', async () => {
    rmSync(log, { force: true });
    const { wt } = await run(provider(OPENCODE_SPEC, { FAKE_VERSION: '1.19.6' }));
    const first = calls()[0];
    expect(first.args).toEqual(['acp', '--cwd', wt]);
    expect(first.envKeys).toContain('OPENCODE_CONFIG_CONTENT');
  });
});

describe('probe (no prompt, no login)', () => {
  it('kimi/opencode READY and UNVERIFIED inside the tested range; outside → UNSUPPORTED_VERSION', async () => {
    expect(await provider(KIMI_SPEC).probe()).toMatchObject({ availability: 'READY', version: '1.50.0', contractStatus: 'UNVERIFIED', simulated: false });
    expect(await provider(KIMI_SPEC, { FAKE_VERSION: '1.51.0' }).probe()).toMatchObject({ availability: 'UNSUPPORTED_VERSION' });
    expect(await provider(OPENCODE_SPEC, { FAKE_VERSION: '1.19.6' }).probe()).toMatchObject({ availability: 'READY', contractStatus: 'UNVERIFIED' });
  });

  it('google: NOT_INSTALLED without gemini; any installed version is UNSUPPORTED_VERSION until tested', async () => {
    const missing = new AcpProvider(adapter, GEMINI_SPEC, { env: { PATH: root } });
    expect(await missing.probe()).toMatchObject({ availability: 'NOT_INSTALLED', providerId: 'google' });
    expect(await provider(GEMINI_SPEC, { FAKE_VERSION: '0.40.0' }).probe()).toMatchObject({ availability: 'UNSUPPORTED_VERSION', evidence: [expect.stringContaining('no Gemini CLI version has been tested')] });
  });
});
