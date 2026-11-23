import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createBaseAdapter, detectPlatform } from '@aer/platform-core';
import type { AgentStreamEvent } from '@aer/provider-sdk';
import { SimulatorProvider } from '../src/index.ts';

const adapter = createBaseAdapter(detectPlatform(), 'test');
const dir = mkdtempSync(path.join(os.tmpdir(), 'aer sim ç '));
afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

async function run(sim: SimulatorProvider, scenario: string, o: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<AgentStreamEvent[]> {
  const instructionsFile = path.join(dir, 'INSTR.md');
  writeFileSync(instructionsFile, '# instruções fixas\n');
  const out: AgentStreamEvent[] = [];
  for await (const e of sim.start({
    taskId: 'TAR-0001', attemptId: 'ATT-0001', workingDirectory: dir, instructionsFile, allowedPaths: ['.'], deniedPaths: [], mode: 'WORKTREE_WRITE',
    approvedToolPolicyId: 'test', timeoutMs: o.timeoutMs ?? 10_000, signal: o.signal ?? new AbortController().signal, modelPreference: scenario,
  })) out.push(e);
  return out;
}

describe('SimulatorProvider probe (AER-REQ-102/103/108/110)', () => {
  it('is READY, labelled simulated, with dated capability sources', async () => {
    const p = await new SimulatorProvider(adapter).probe();
    expect(p).toMatchObject({ providerId: 'simulator', availability: 'READY', version: '1.0.0', simulated: true, contractVersion: 1 });
    expect(p.capabilities.find((c) => c.id === 'structured_stream')).toMatchObject({ status: 'SUPPORTED', source: 'RUNTIME_PROBE' });
    expect(p.capabilities.find((c) => c.id === 'usage_tokens')).toMatchObject({ status: 'NOT_SUPPORTED' });
    expect(p.capabilities.every((c) => !Number.isNaN(Date.parse(c.checkedAt)))).toBe(true);
  });

  it('probe only runs --version (fake binary records every invocation)', async () => {
    const log = path.join(dir, 'calls.log');
    const fake = path.join(dir, 'fake-agent.mjs');
    writeFileSync(fake, `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');\nprocess.stdout.write('ases-simulator 9.9.9\\n');\n`);
    const p = await new SimulatorProvider(adapter, { script: fake }).probe();
    expect(p.availability).toBe('UNSUPPORTED_VERSION');
    expect(readFileSync(log, 'utf8')).toBe('["--version"]\n');
    // versão não suportada bloqueia a execução: o agente nunca é chamado com argumentos de run
    const ev = await run(new SimulatorProvider(adapter, { script: fake }), 'ok');
    expect(ev[0]).toMatchObject({ type: 'error', code: 'UNSUPPORTED_VERSION' });
    expect(readFileSync(log, 'utf8').trim().split('\n').every((l) => l === '["--version"]')).toBe(true);
  });

  it('degrades to PROVIDER_UNAVAILABLE when the simulator is missing', async () => {
    const sim = new SimulatorProvider(adapter, { script: path.join(dir, 'nao-existe.mjs') });
    expect((await sim.probe()).availability).toBe('PROVIDER_UNAVAILABLE');
    expect((await run(sim, 'ok'))[0]).toMatchObject({ type: 'error', code: 'PROVIDER_UNAVAILABLE' });
  });
});

describe('SimulatorProvider runs (deterministic)', () => {
  it('ok: same events every run, writes inside cwd, exit 0 reconciled', async () => {
    const sim = new SimulatorProvider(adapter);
    const a = await run(sim, 'ok');
    const b = await run(sim, 'ok');
    expect(a).toEqual(b);
    expect(a.map((e) => e.type)).toEqual(['status', 'message', 'tool_call', 'file_change', 'tool_result', 'message', 'exit']);
    expect(a.at(-1)).toEqual({ type: 'exit', exitCode: 0, signal: null, cancelled: false, reconciled: true });
    expect(existsSync(path.join(dir, 'SIMULATED', 'TAR-0001.md'))).toBe(true);
    expect((await sim.getUsage())[0]).toMatchObject({ source: 'UNKNOWN', value: null });
  });

  it('fail keeps the real exit code; garbage becomes PARSE_ERROR', async () => {
    const sim = new SimulatorProvider(adapter);
    expect((await run(sim, 'fail')).at(-1)).toMatchObject({ type: 'exit', exitCode: 1 });
    const g = await run(sim, 'garbage');
    expect(g.filter((e) => e.type === 'error').map((e) => (e as { code: string }).code)).toEqual(['PARSE_ERROR', 'PARSE_ERROR']);
  });

  it('hang: timeout terminates the tree (grandchild included) and says so', async () => {
    const ev = await run(new SimulatorProvider(adapter, { graceMs: 200 }), 'hang', { timeoutMs: 600 });
    const child = Number((ev.find((e) => e.type === 'status' && e.status === 'CHILD_SPAWNED') as { detail: string }).detail);
    expect(ev.find((e) => e.type === 'error')).toMatchObject({ code: 'TIMEOUT' });
    expect(ev.at(-1)).toMatchObject({ type: 'exit', reconciled: true, cancelled: false });
    expect(() => process.kill(child, 0)).toThrow();
  });

  it('abort signal cancels and marks the exit as cancelled', async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 300);
    const ev = await run(new SimulatorProvider(adapter, { graceMs: 200 }), 'hang', { signal: ac.signal });
    expect(ev.at(-1)).toMatchObject({ type: 'exit', cancelled: true, reconciled: true });
  });

  it('rejects unknown scenarios without spawning anything', async () => {
    expect((await run(new SimulatorProvider(adapter), '; rm -rf /'))[0]).toMatchObject({ type: 'error', code: 'INVALID_INPUT' });
  });
});
