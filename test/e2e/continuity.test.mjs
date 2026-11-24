import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BIN, requireBuild, runSync, tempProject } from './helpers.mjs';

requireBuild();
const p = tempProject('e2e cont ç');
afterAll(() => p.cleanup());
const repo = path.resolve('.');
const bin = path.join(p.dir, 'bin');
const gitDir = path.dirname(spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim());
const PATH = [bin, path.dirname(process.execPath), gitDir].join(path.delimiter);
const env = { ...process.env, NO_COLOR: '1', PATH, Path: PATH, HOME: path.join(p.dir, 'home'), USERPROFILE: path.join(p.dir, 'home') };
const session = (lines) => {
  const r = spawnSync(process.execPath, [BIN.ases, '--no-tui'], { cwd: p.dir, encoding: 'utf8', input: [...lines, '/exit', ''].join('\n'), timeout: 90_000, env });
  expect(r.status, `${lines.join(' | ')}\n--- stdout ---\n${r.stdout?.slice(-3000)}\n--- stderr ---\n${r.stderr?.slice(-2000)}`).toBe(0);
  return r.stdout;
};
const git = (...a) => spawnSync('git', a, { cwd: p.dir, encoding: 'utf8' }).stdout;

// o falso `claude` é um script sh (POSIX); no Windows a troca de provider é coberta pelo teste de unidade do scheduler
describe.runIf(process.platform !== 'win32')('PHASE-11 gate: switch a task between two providers without losing files, tests or history (TAR-0058)', () => {
  it('simulator → claude (fake official CLI) with handoff, real test run, independent review and usage', () => {
    git('init', '-q', '-b', 'main');
    for (const [k, v] of [['user.name', 'AER E2E'], ['user.email', 'e2e@example.invalid'], ['commit.gpgsign', 'false']]) git('config', k, v);
    expect(runSync(BIN.ases, ['init', '--name', 'cont'], p.dir).status).toBe(0);
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    mkdirSync(bin, { recursive: true });
    mkdirSync(env.HOME, { recursive: true });
    writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(repo, 'packages/provider-claude/test/fixtures/fake-claude.mjs')}" "$@"\n`);
    chmodSync(path.join(bin, 'claude'), 0o755);

    // tentativa 1: simulador
    let out = session(['/phase new P', '/task new PHASE-01 Funcionalidade --provider simulator', '/task move TAR-0001 READY', '/run']);
    expect(out).toMatch(/TAR-0001 ATT-0001 simulator \[SIMULATED\] (→|->) REVIEW/);

    // test run real, com aprovação EXEC_TESTS do comando exato (sem shell; o script não tem espaços)
    const check = "process.exit(require('fs').existsSync('SIMULATED/TAR-0001.md')?0:1)";
    out = session([`/test TAR-0001 node -e ${check}`]);
    const apr = /(APR-\d{4}) PENDING/.exec(out)[1];
    out = session([`/approval grant ${apr} responsável`, `/test TAR-0001 node -e ${check}`]);
    expect(out).toMatch(/TAR-0001: `node -e .*` → exit 0 · log \.ases\/evidence\/TAR-0001-test-01\.log/);
    expect(existsSync(path.join(p.dir, '.ases/evidence/TAR-0001-test-01.log'))).toBe(true);

    // /diff só lê: estado de todas as worktrees (HEAD + status) igual antes e depois (AER-REQ-097)
    const wtState = () => git('worktree', 'list', '--porcelain').split(/\r?\n/).filter((l) => l.startsWith('worktree ')).map((l) => {
      const w = l.slice(9);
      return `${w} ${spawnSync('git', ['-C', w, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout} ${spawnSync('git', ['-C', w, 'status', '--porcelain'], { encoding: 'utf8' }).stdout}`;
    }).join('\n');
    const before = wtState();
    out = session(['/diff TAR-0001']);
    expect(out).toMatch(/TAR-0001 ATT-0001 \(ases\/TAR-0001\/ATT-0001 desde [0-9a-f]{12}\)/);
    expect(out).toContain('SIMULATED/TAR-0001.md');
    expect(wtState()).toBe(before);

    // handoff para outro provider: HANDOFF gravado e a próxima tentativa parte do checkpoint 1
    const tip1 = git('rev-parse', 'ases/TAR-0001/ATT-0001').trim();
    out = session(['/handoff TAR-0001 claude continuar a funcionalidade com outro agente']);
    expect(out).toMatch(new RegExp(`TAR-0001: simulator (→|->) claude · \\.ases/handoffs/TAR-0001-H01\\.md · próxima tentativa parte de ${tip1.slice(0, 12)} · tarefa READY`));
    const h = readFileSync(path.join(p.dir, '.ases/handoffs/TAR-0001-H01.md'), 'utf8');
    expect(h).toMatch(/`node -e .*` → exit 0/);
    expect(h).not.toMatch(/@example\.invalid/);

    // tentativa 2: claude (falso) — sem --consent não roda; com --consent continua de onde o simulador parou
    out = session(['/run']);
    expect(out).toMatch(/TAR-0001 - claude (→|->) BLOCKED: CONSENT_REQUIRED/);
    out = session(['/task move TAR-0001 READY', '/run --consent claude']);
    expect(out).toMatch(/TAR-0001 ATT-0002 claude (→|->) REVIEW/);
    const files = git('ls-tree', '-r', '--name-only', 'ases/TAR-0001/ATT-0002');
    expect(files).toContain('SIMULATED/TAR-0001.md'); // arquivo do 1º provider
    expect(files).toContain('NOTA.md'); // arquivo do 2º provider
    expect(spawnSync('git', ['merge-base', '--is-ancestor', tip1, 'ases/TAR-0001/ATT-0002'], { cwd: p.dir }).status).toBe(0);
    expect(readFileSync(path.join(p.dir, '.ases/worktrees/TAR-0001-ATT-0002.instructions.md'), 'utf8')).toContain('# HANDOFF TAR-0001');

    // revisão independente: autor não revisa; outro provider revisa só lendo; revisor que escreve é INVALID e nada entra na tarefa
    out = session(['/review TAR-0001 simulator:review']);
    expect(out).toMatch(/simulator wrote attempts of TAR-0001; an independent review needs another provider/);
    out = session(['/task new PHASE-01 Outra --provider claude', '/task move TAR-0002 READY', '/run --consent claude']);
    expect(out).toMatch(/TAR-0002 ATT-0001 claude (→|->) REVIEW/);
    out = session(['/review TAR-0002 simulator:review']);
    expect(out).toMatch(/REV-0001 TAR-0002: APPROVED \(parecer do revisor\) · \.ases\/reviews\/TAR-0002-REV-0001\.md/);
    out = session(['/review TAR-0002 simulator:review-write', '/task TAR-0002']);
    expect(out).toMatch(/REV-0002 TAR-0002: INVALID \(REVIEWER_WROTE/);
    expect(out).toMatch(/estado REVIEW/); // a revisão não muda o estado; a decisão é humana
    expect(git('ls-tree', '-r', '--name-only', 'ases/TAR-0002/ATT-0001')).not.toContain('REVISOR-ESCREVEU.md');
    expect(existsSync(path.join(p.dir, 'REVISOR-ESCREVEU.md'))).toBe(false);

    // uso: por provider, com fonte, sem somar providers; o simulador não reporta tokens (—)
    out = session(['/usage TAR-0001', '/resume', '/resume']);
    expect(out).toMatch(/claude · 1 tentativa\(s\)\n\s+TOKENS_INPUT/);
    expect(out).toMatch(/fonte: claude stream-json result/);
    expect(out).toMatch(/simulator · 1 tentativa\(s\)\n\s+TOKENS_INPUT\s+0 tokens · fonte: UNKNOWN|simulator · 1 tentativa\(s\) · tokens: —/);
    expect(out.match(/nada a recuperar/g)).toHaveLength(2);

    // histórico: as duas tentativas, o handoff e o test run continuam no banco/relatórios
    const status = readFileSync(path.join(p.dir, '.ases/phases/PHASE-01/TAR-0001/STATUS.json'), 'utf8');
    expect(JSON.parse(status).lastTest).toMatchObject({ exitCode: 0 });
  }, 180_000);
});
