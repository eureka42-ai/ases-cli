import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BIN, requireBuild, runSync, tempProject } from './helpers.mjs';

requireBuild();
const p = tempProject('e2e providers');
afterAll(() => p.cleanup());
// PATH só com o node e o git: claude/codex "desinstalados" (determinístico em qualquer máquina, nenhuma chamada real)
const gitDir = (() => {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' });
  return path.dirname(r.stdout.split(/\r?\n/)[0].trim());
})();
const PATH = [path.dirname(process.execPath), gitDir].join(path.delimiter);
const env = { PATH, Path: PATH };

describe('providers without login or cost (TAR-0036, AER-REQ-116/119/123/130)', () => {
  it('doctor: missing official CLIs do not hide the simulator; each shows its contract status', () => {
    const r = runSync(BIN.ases, ['doctor', '--json'], p.dir, env);
    expect(r.status).toBe(0);
    const byId = Object.fromEntries(JSON.parse(r.stdout).providers.map((x) => [x.id, x]));
    expect(byId.simulator).toMatchObject({ availability: 'READY', contract: 'SIMULATED' });
    expect(byId.claude).toMatchObject({ availability: 'NOT_INSTALLED', contract: 'UNVERIFIED' });
    expect(byId.codex).toMatchObject({ availability: 'NOT_INSTALLED', contract: 'UNVERIFIED' });
    // o PATH do teste inclui a pasta do git; se o cliente estiver na mesma pasta (p.ex. /opt/homebrew/bin), ele é achado
    const inPath = (bin) => PATH.split(path.delimiter).some((d) => ['', '.exe', '.cmd'].some((x) => existsSync(path.join(d, bin + x))));
    for (const [id, bin] of [['kimi', 'kimi'], ['opencode', 'opencode'], ['google', 'gemini']]) {
      if (inPath(bin)) expect(['VERIFIED', 'UNVERIFIED']).toContain(byId[id].contract);
      else expect(byId[id]).toMatchObject({ availability: 'NOT_INSTALLED', contract: 'UNVERIFIED' });
    }
  });

  it('a claude task without --consent never runs; the simulator task in the same run does', () => {
    const git = (...a) => spawnSync('git', a, { cwd: p.dir, encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    for (const [k, v] of [['user.name', 'AER E2E'], ['user.email', 'e2e@example.invalid'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) git('config', k, v);
    expect(runSync(BIN.ases, ['init', '--name', 'prov'], p.dir).status).toBe(0);
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    const script = ['/phase new P', '/task new PHASE-01 real --provider claude', '/task new PHASE-01 sim --provider simulator',
      '/task move TAR-0001 READY', '/task move TAR-0002 READY', '/run', '/exit', ''].join('\n');
    const r = spawnSync(process.execPath, [BIN.ases, '--no-tui'], { cwd: p.dir, encoding: 'utf8', input: script, timeout: 30_000, env: { ...process.env, ...env, NO_COLOR: undefined } });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/TAR-0001 - claude (→|->) BLOCKED: CONSENT_REQUIRED/);
    expect(r.stdout).toMatch(/TAR-0002 ATT-0001 simulator \[SIMULATED\] (→|->) REVIEW/);
  });
});
