import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createBaseAdapter, detectPlatform } from '../src/index.ts';

const adapter = createBaseAdapter(detectPlatform(), 'test');
const cwd = mkdtempSync(path.join(os.tmpdir(), 'aer proc ç '));
afterAll(() => rmSync(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
};
const collect = async (p: ReturnType<typeof adapter.spawnManagedProcess>) => {
  let out = '';
  p.child.stdout.on('data', (d: Buffer) => (out += d.toString()));
  p.child.stderr.resume();
  return { ...(await p.exited), out };
};

describe('spawnManagedProcess (AER-REQ-109)', () => {
  it('passes arguments as a vector without shell: metacharacters stay literal', async () => {
    const evil = '; echo PWNED > pwned.txt && rm -rf ~ | $(id) `id`';
    const r = await collect(adapter.spawnManagedProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', evil], { cwd }));
    expect(r).toMatchObject({ exitCode: 0, out: evil });
  });

  it('reports the real exit code (AER-REQ-105)', async () => {
    expect(await collect(adapter.spawnManagedProcess(process.execPath, ['-e', 'process.exit(3)'], { cwd }))).toMatchObject({ exitCode: 3 });
  });
});

describe('terminateProcessTree (AER-REQ-106)', () => {
  it('kills a hung process and its grandchild, and confirms nothing is left', async () => {
    const script = "const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1e9)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1e9)";
    const p = adapter.spawnManagedProcess(process.execPath, ['-e', script], { cwd });
    p.child.stderr.resume();
    const grandchild = await new Promise<number>((resolve) => p.child.stdout.once('data', (d: Buffer) => resolve(Number(d.toString().trim()))));
    expect(alive(grandchild)).toBe(true);
    const t = await adapter.terminateProcessTree(p.pid, { graceMs: 300 });
    expect(t.terminated).toBe(true);
    await p.exited;
    for (let i = 0; i < 40 && alive(grandchild); i++) await new Promise((r) => setTimeout(r, 50));
    expect(alive(grandchild)).toBe(false);
  });

  it('is a no-op for a process that already exited and refuses dangerous pids', async () => {
    const p = adapter.spawnManagedProcess(process.execPath, ['-e', ''], { cwd });
    await p.exited;
    await expect(adapter.terminateProcessTree(p.pid)).resolves.toEqual({ terminated: true, forced: false });
    await expect(adapter.terminateProcessTree(1)).rejects.toMatchObject({ code: 'INVALID_PID' });
    await expect(adapter.terminateProcessTree(0)).rejects.toMatchObject({ code: 'INVALID_PID' });
  });
});
