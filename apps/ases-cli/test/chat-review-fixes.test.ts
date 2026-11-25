import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initProject, loadPlatformAdapter } from '@aer/project-store';
import { chatSession } from '../src/chat-commands.ts';
import { handleLine } from '../src/commands.ts';
import { Engine } from '../src/engine.ts';

// Correções da revisão final da PHASE-18 (C1, I3, I5).
const adapter = await loadPlatformAdapter();
const dirs: string[] = [];
const g = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' });
beforeAll(() => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'aer-fix-home-'));
  dirs.push(home);
  process.env.XDG_CONFIG_HOME = home;
  process.env.APPDATA = home;
});
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })));

async function project(chat: Record<string, unknown>): Promise<{ root: string; e: Engine }> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aer fix ç '));
  dirs.push(root);
  g(root, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'T'], ['user.email', 't@example.invalid'], ['commit.gpgsign', 'false']]) g(root, 'config', k!, v!);
  initProject(root, adapter, 'fix');
  const f = path.join(root, '.ases', 'CONFIG.json');
  writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), chat }, null, 2));
  writeFileSync(path.join(root, '.gitignore'), '.ases/db/\n.ases/worktrees/\n.ases/evidence/\n.ases/handoffs/\n.ases/reviews/\n');
  writeFileSync(path.join(root, 'README.md'), '# fix\n');
  g(root, 'add', '-A');
  g(root, 'commit', '-q', '-m', 'base');
  return { root, e: await Engine.start(root, adapter, { simulators: 3 }) };
}
const say = async (e: Engine, line: string) => String(await handleLine(e, line));

describe('final review fixes (PHASE-18)', () => {
  it('C1: consent and test command checked into the repo config are NOT authority', async () => {
    const { root, e } = await project({ main: 'simulator', crossReview: false, consent: ['claude', 'codex'], testCommand: [process.execPath, '-e', 'process.exit(1)'] });
    try {
      expect(chatSession(e).consent.has('claude')).toBe(false);
      expect(await say(e, '/config')).toMatch(/comando de teste: .* \(não autorizado; confirme com \/config teste/);
      await say(e, 'divida em tarefas o cadastro');
      const out = await say(e, '/plano executar');
      expect(out).toMatch(/testes NONE/);
      expect(out).toMatch(/comando de teste do projeto não autorizado/);
      // a autorização vale pelo banco local (não versionado), não pelo arquivo
      await say(e, `/config teste ${process.execPath} -e process.exit(0)`);
      await say(e, '/config consentir claude --save');
      expect(JSON.parse(readFileSync(path.join(root, '.ases', 'CONFIG.json'), 'utf8')).chat.consent).toEqual(['claude', 'codex']); // arquivo intocado
    } finally {
      await e.stop();
    }
    const e2 = await Engine.start(root, adapter, { simulators: 3 });
    try {
      expect(chatSession(e2).consent.has('claude')).toBe(true); // --save gravou no banco local
      expect(chatSession(e2).consent.has('codex')).toBe(false);
      expect(await say(e2, '/config')).toMatch(/comando de teste: .*process\.exit\(0\) \(autorizado\)/);
      await say(e2, '/config revogar claude');
    } finally {
      await e2.stop();
    }
    const e3 = await Engine.start(root, adapter, { simulators: 3 });
    expect(chatSession(e3).consent.has('claude')).toBe(false);
    await e3.stop();
  }, 120_000);

  it('PHASE-19: one-time consent in the personal config authorizes every installed AI; revogar todas turns it off', async () => {
    const { setConsentAll, globalConfigFile } = await import('@aer/project-store');
    const { root, e } = await project({ main: 'simulator', crossReview: false });
    await e.stop();
    setConsentAll(true, globalConfigFile());
    const e2 = await Engine.start(root, adapter, { simulators: 3 });
    try {
      for (const id of ['claude', 'codex', 'kimi', 'opencode', 'google']) expect(chatSession(e2).consent.has(id)).toBe(true);
      expect(await say(e2, '/config revogar todas')).toMatch(/todas as IAs revogadas/);
      expect(chatSession(e2).consent.has('claude')).toBe(false);
    } finally {
      await e2.stop();
    }
    const e3 = await Engine.start(root, adapter, { simulators: 3 });
    expect(chatSession(e3).consent.has('claude')).toBe(false);
    await e3.stop();
  }, 60_000);

  it('I3: /parar and engine stop interrupt a running main turn', async () => {
    const { e } = await project({ main: 'simulator', crossReview: false });
    try {
      const c = await chatSession(e).conversation();
      e.mutate((s) => s.setMainProvider(c.id, 'simulator:hang'));
      const t0 = Date.now();
      const pending = say(e, 'olá');
      await new Promise((r) => setTimeout(r, 700));
      expect(await say(e, '/parar')).toMatch(/parando/);
      expect(await pending).toMatch(/erro/);
      expect(Date.now() - t0).toBeLessThan(15_000);
      const pending2 = say(e, 'de novo');
      await new Promise((r) => setTimeout(r, 700));
      await e.stop();
      expect(await pending2).toMatch(/erro/);
    } finally {
      await e.stop().catch(() => undefined);
    }
  }, 60_000);

  it('I5: /aceitar after a dirty-tree refusal can be retried', async () => {
    const { root, e } = await project({ main: 'simulator', crossReview: false });
    try {
      await say(e, 'divida em tarefas o cadastro');
      await say(e, '/plano executar');
      writeFileSync(path.join(root, 'README.md'), '# mexido\n');
      expect(await say(e, '/aceitar 1')).toMatch(/mudanças não salvas/);
      g(root, 'checkout', '--', 'README.md');
      expect(await say(e, '/aceitar 1')).toMatch(/TAR-0001: integrada/);
    } finally {
      await e.stop();
    }
  }, 120_000);
});
