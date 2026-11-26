import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { initProject, loadPlatformAdapter } from '@aer/project-store';
import { chatSession } from '../src/chat-commands.ts';
import { Engine } from '../src/engine.ts';

// 1.4.0: num plano real (principal = IA real), o simulador nunca recebe tarefa.
const adapter = await loadPlatformAdapter();
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })));

async function withMain(main: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aer workers '));
  dirs.push(root);
  initProject(root, adapter, 'w');
  const file = path.join(root, '.ases', 'CONFIG.json');
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), chat: { main } }, null, 2));
  const engine = await Engine.start(root, adapter, { simulators: 2 });
  const chat = chatSession(engine);
  // probe fixo: claude e google prontos e autorizados, mais os simuladores
  (chat as unknown as { probeAll: () => Promise<Record<string, { availability: string }>> }).probeAll = async () => ({ claude: { availability: 'READY' }, google: { availability: 'READY' }, simulator: { availability: 'READY' }, 'simulator-2': { availability: 'READY' } });
  (chat as unknown as { consent: Set<string> }).consent.add('claude').add('google');
  return { engine, chat };
}

describe('who can receive plan tasks', () => {
  it('real main: only real AIs (never the simulator)', async () => {
    const { engine, chat } = await withMain('claude');
    try {
      expect((await chat.workers()).sort()).toEqual(['claude', 'google']);
    } finally {
      await engine.stop();
    }
  });

  it('simulated main (tests, demos): simulators work too', async () => {
    const { engine, chat } = await withMain('simulator');
    try {
      expect(await chat.workers()).toEqual(expect.arrayContaining(['simulator', 'simulator-2']));
    } finally {
      await engine.stop();
    }
  });
});
