import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { initProject, loadPlatformAdapter } from '@aer/project-store';
import { Engine, simulatorCount } from '../src/engine.ts';

const adapter = await loadPlatformAdapter();
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })));

describe('extra simulators (PHASE-18, TAR-0081)', () => {
  it('AER_SIMULATORS accepts 1..4, anything else is 1', () => {
    expect([undefined, '3', '4', '0', '9', 'x'].map((v) => simulatorCount({ AER_SIMULATORS: v }))).toEqual([1, 3, 4, 1, 1, 1]);
  });
  it('the engine registers simulator-2..N as distinct providers', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'aer-sims-'));
    dirs.push(dir);
    initProject(dir, adapter, 'sims');
    const e = await Engine.start(dir, adapter, { simulators: 3 });
    try {
      expect(Object.keys(e.providers).filter((k) => k.startsWith('simulator'))).toEqual(['simulator', 'simulator-2', 'simulator-3']);
      expect((await e.providers['simulator-3']!.probe()).providerId).toBe('simulator-3');
    } finally {
      await e.stop();
    }
  });
});
