import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BIN, jsonl, requireBuild, runSync, start, tempProject, useSimulatedMain } from './helpers.mjs';

// PHASE-18 (TAR-0089): o chat inteiro com processos reais: principal simulada, 3 IAs simuladas, plano em paralelo,
// revisão cruzada, /desfazer, /aceitar, /sobre, e o ases-tar vendo os eventos do plano.
describe('chat with the main IA, end to end with real processes (PHASE-18)', () => {
  requireBuild();
  const p = tempProject('e2e chat ç');
  const home = mkdtempSync(path.join(os.tmpdir(), 'aer-e2e-home-'));
  const env = { AER_SIMULATORS: '3', XDG_CONFIG_HOME: home, APPDATA: home };
  const g = (...a) => execFileSync('git', a, { cwd: p.dir, encoding: 'utf8' });
  beforeAll(() => {
    g('init', '-q', '-b', 'main');
    for (const [k, v] of [['user.name', 'E2E'], ['user.email', 'e2e@example.invalid'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) g('config', k, v);
    expect(runSync(BIN.ases, ['init', '--name', 'chat'], p.dir, env, 60_000).status).toBe(0);
    useSimulatedMain(p.dir);
    writeFileSync(path.join(p.dir, '.gitignore'), '.ases/db/\n.ases/worktrees/\n.ases/evidence/\n.ases/handoffs/\n.ases/reviews/\n');
    writeFileSync(path.join(p.dir, 'README.md'), '# chat e2e\n');
    g('add', '-A');
    g('commit', '-q', '-m', 'base');
  }, 60_000);
  afterAll(() => p.cleanup(), 30_000);

  it('talk, edit, undo, plan in parallel, summary, accept, about — and ases-tar sees the plan', async () => {
    const ases = start(BIN.ases, ['--no-tui'], p.dir, env);
    try {
      await ases.waitFor('stdout', 'engine ready', 30_000);
      const tar = start(BIN.tar, ['--follow', '--format', 'jsonl'], p.dir, env);
      const say = async (line, expected, ms = 30_000) => {
        const from = ases.out.stdout.length;
        ases.send(line);
        await ases.waitFor('stdout', (s) => expected.test(s.slice(from)), ms);
        return ases.out.stdout.slice(from);
      };
      await say('olá', /simulator> SIMULATED: entendi — olá/);
      await say('edite o readme', /editei SIMULATED\/CHAT\.md/);
      expect(existsSync(path.join(p.dir, 'SIMULATED', 'CHAT.md'))).toBe(true);
      await say('/desfazer', /desfeito: SIMULATED\/CHAT\.md/);
      expect(existsSync(path.join(p.dir, 'SIMULATED', 'CHAT.md'))).toBe(false);
      const plan = await say('divida em tarefas o cadastro', /Plano PLN-0001 \(3 tarefas\)/);
      const assigned = [...plan.matchAll(/\d\. Parte \d → (\S+)/g)].map((m) => m[1]);
      expect(assigned).toHaveLength(3);
      expect(assigned).not.toContain('simulator'); // a principal não recebe tarefas quando há outras IAs
      const run = await say('/plano executar', /resumo — 3 tarefas/, 180_000);
      expect([...run.matchAll(/TAR-000\d \S+ REVIEW/g)]).toHaveLength(3);
      expect(run).toMatch(/revisão APPROVED/); // revisão cruzada por outra IA (simulada)
      const accepted = await say('/aceitar', /TAR-0003: integrada/, 60_000);
      expect(accepted).toMatch(/TAR-0001: integrada/);
      expect(g('log', '--oneline')).toMatch(/TAR-0001/);
      const about = await say('/sobre', /Licença CC BY-NC-ND 4\.0/);
      expect(about).toContain('O Eureka42 é uma iniciativa dos Professores Raul el Greco, Giuseppe Favato e Elzo Brito.');
      await tar.waitFor('stdout', (s) => jsonl(s).some((e) => e.eventType === 'PlanProposed'), 30_000);
      expect(jsonl(tar.out.stdout).some((e) => e.eventType === 'ChatMessageAdded')).toBe(true);
      tar.child.kill();
      await tar.exited;
      ases.send('/sair');
      expect((await ases.exited).code).toBe(0);
    } finally {
      if (ases.child.exitCode === null) ases.child.kill('SIGKILL');
    }
  }, 300_000);
});
