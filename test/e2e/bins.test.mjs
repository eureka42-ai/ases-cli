import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BIN, requireBuild, runSync, tempProject } from './helpers.mjs';

requireBuild();
const p = tempProject('bins');
afterAll(p.cleanup);
const ESC = /\u001b/;

describe('built bins (TAR-0011, AER-REQ-004, AER-REQ-245, AER-REQ-247)', () => {
  it('both bins answer --version and --help without ANSI when piped', () => {
    for (const bin of [BIN.ases, BIN.tar]) {
      const v = runSync(bin, ['--version'], p.dir);
      expect(v.status).toBe(0);
      expect(v.stdout).toMatch(/^ases(-tar)? 0\.0\.0 \(protocol 1\)\n$/);
      const h = runSync(bin, ['--help'], p.dir);
      expect(h.status).toBe(0);
      expect(h.stdout).toMatch(/Eureka42/);
      expect(h.stdout + h.stderr).not.toMatch(ESC);
    }
  });

  it('--json output is pure JSON (no banner, no ANSI)', () => {
    const v = runSync(BIN.ases, ['--version', '--json'], p.dir);
    expect(JSON.parse(v.stdout)).toEqual({ app: '0.0.0', protocol: 1 });
    const d = runSync(BIN.ases, ['doctor', '--json'], p.dir);
    expect(d.status).toBe(0);
    const report = JSON.parse(d.stdout);
    expect(report.platform).toBe(process.platform);
    expect(report.providers.map((x) => x.id)).toEqual(['simulator', 'claude', 'codex', 'kimi', 'opencode', 'google']);
    expect(report.providers.every((x) => ['SIMULATED', 'UNVERIFIED', 'VERIFIED'].includes(x.contract))).toBe(true);
    // macOS: Keychain nativo; Windows: indisponível de propósito (sem CLI que receba o segredo fora do argv); Linux: depende de D-Bus/secret-tool
    const backend = { darwin: 'macos-keychain', win32: 'windows-credential-manager', linux: 'linux-secret-service' }[process.platform];
    expect(report.secretStore.backend).toBe(backend);
    if (process.platform === 'darwin') expect(report.secretStore.available).toBe(true);
    if (process.platform === 'win32') expect(report.secretStore.available).toBe(false);
  });

  it('init is non-destructive on a second run (AER-REQ-011)', () => {
    const a = runSync(BIN.ases, ['init', '--name', 'bins', '--json'], p.dir);
    const b = runSync(BIN.ases, ['init', '--json'], p.dir);
    expect(JSON.parse(a.stdout).created.length).toBeGreaterThan(5);
    expect(JSON.parse(b.stdout)).toEqual({ projectId: JSON.parse(a.stdout).projectId, created: [] });
  });

  it('unimplemented commands say so explicitly and never fake success', () => {
    const r = runSync(BIN.ases, ['agents'], p.dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/ainda não implementado \(planejado: PHASE-07\)/);
    expect(runSync(BIN.tar, ['--errors'], p.dir).status).toBe(2);
    expect(runSync(BIN.ases, ['--bogus'], p.dir).status).toBe(2);
  });

  it('outside a project both bins exit 2 with guidance', () => {
    const outside = tempProject('fora');
    try {
      expect(runSync(BIN.ases, [], outside.dir).status).toBe(2);
      expect(runSync(BIN.tar, ['--json'], outside.dir).stderr).toMatch(/não é um projeto ASES/);
    } finally {
      outside.cleanup();
    }
  });

  it('refuses to run the engine on an interim-bootstrap .ases/ (no second writer)', () => {
    const q = tempProject('interino');
    try {
      runSync(BIN.ases, ['init'], q.dir);
      writeFileSync(path.join(q.dir, '.ases', 'HISTORY.jsonl'), `${JSON.stringify({ seq: 1, actor: 'ases-dev-interim' })}\n`);
      const r = runSync(BIN.ases, [], q.dir);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/INTERIM_PROJECT/);
    } finally {
      q.cleanup();
    }
  });
});
