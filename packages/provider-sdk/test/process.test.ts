import { describe, expect, it } from 'vitest';
import { createBaseAdapter, detectPlatform } from '@aer/platform-core';
import { runAgentProcess, type AgentStreamEvent } from '../src/index.ts';

const adapter = createBaseAdapter(detectPlatform(), 'test');

describe('runAgentProcess output cap (AER-REQ-171)', () => {
  it('flooding stdout past maxOutputBytes kills the tree and reports OUTPUT_LIMIT, not success', async () => {
    // linhas NDJSON válidas sem fim: só o teto de bytes totais para o agente
    const flood = "const l=JSON.stringify({t:'x'.repeat(1000)})+'\\n';const w=()=>{while(process.stdout.write(l));process.stdout.once('drain',w)};w()";
    const out: AgentStreamEvent[] = [];
    for await (const e of runAgentProcess(adapter, {
      command: process.execPath, args: ['-e', flood], cwd: process.cwd(), timeoutMs: 20_000, signal: new AbortController().signal,
      maxOutputBytes: 256 * 1024, graceMs: 200, map: () => [], finish: () => [{ type: 'status', status: 'FINISH_CALLED' }],
    })) out.push(e);
    expect(out.find((e) => e.type === 'error')).toMatchObject({ code: 'OUTPUT_LIMIT' });
    expect(out.some((e) => e.type === 'status' && e.status === 'FINISH_CALLED')).toBe(false);
    expect(out.at(-1)).toMatchObject({ type: 'exit', reconciled: true });
  }, 30_000);
});

describe('findExecutable (1.4.0)', () => {
  it.runIf(process.platform !== 'win32')('also finds CLIs in ~/.opencode/bin and ~/.local/bin when PATH lacks them', async () => {
    const { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { findExecutable } = await import('../src/index.ts');
    const home = mkdtempSync(path.join(os.tmpdir(), 'aer-find-'));
    try {
      mkdirSync(path.join(home, '.opencode', 'bin'), { recursive: true });
      writeFileSync(path.join(home, '.opencode', 'bin', 'opencode'), '#!/bin/sh\n');
      chmodSync(path.join(home, '.opencode', 'bin', 'opencode'), 0o755);
      expect(findExecutable('opencode', { PATH: '/usr/bin', HOME: home }, 'linux')).toBe(path.join(home, '.opencode', 'bin', 'opencode'));
      expect(findExecutable('opencode', { PATH: '/usr/bin' }, 'linux')).toBeUndefined(); // sem HOME, só o PATH
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
