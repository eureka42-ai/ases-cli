import { spawnSync } from 'node:child_process';
import { rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BIN, requireBuild, runSync, tempProject } from './helpers.mjs';

// TAR-0067 (AER-REQ-230): o mesmo projeto aberto por letra de unidade, UNC, junction e unidade do `subst` é UM projeto
// (mesmo projectId e o mesmo banco), com espaço e acento no caminho. Só no Windows real.
describe.runIf(process.platform === 'win32')('Windows paths: drive letter, UNC, junction, subst (TAR-0067)', () => {
  requireBuild();
  const p = tempProject('e2e win ç');
  const sys = (exe) => path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', exe);
  let letter;
  const junction = `${p.dir}-junction`;
  afterAll(() => {
    if (letter) spawnSync(sys('subst.exe'), [`${letter}:`, '/d']);
    rmSync(junction, { force: true }); // só o link; o alvo é apagado pelo cleanup
    p.cleanup();
  }, 30_000);
  const doctor = (cwd) => {
    const r = runSync(BIN.ases, ['doctor', '--json'], cwd, {}, 60_000);
    expect(r.status, `${cwd}\n${r.stderr}`).toBe(0);
    return JSON.parse(r.stdout).project.projectId;
  };
  const session = (cwd, lines) => spawnSync(process.execPath, [BIN.ases, '--no-tui'], { cwd, input: `${lines.join('\n')}\n/exit\n`, encoding: 'utf8', timeout: 60_000 });

  it('one project id and one database across all four spellings of the path', () => {
    const init = runSync(BIN.ases, ['init', '--name', 'win paths', '--json'], p.dir, {}, 60_000);
    expect(init.status, init.stderr).toBe(0);
    const id = JSON.parse(init.stdout).projectId;

    const drive = /^([A-Za-z]):\\(.*)$/.exec(p.dir);
    expect(drive).not.toBeNull();
    const unc = `\\\\localhost\\${drive[1].toUpperCase()}$\\${drive[2]}`;
    symlinkSync(p.dir, junction, 'junction');
    letter = ['R', 'S', 'T', 'U', 'V', 'W'].find((l) => spawnSync(sys('subst.exe'), [`${l}:`, p.dir]).status === 0);
    expect(letter, 'no free drive letter for subst').toBeDefined();

    for (const cwd of [p.dir, unc, junction, `${letter}:\\`]) expect(doctor(cwd)).toBe(id);
    // escreve por um caminho e lê por outro: é o mesmo banco
    expect(session(unc, ['/phase new Criada pelo UNC']).stdout).toMatch(/criada PHASE-01/);
    expect(session(`${letter}:\\`, ['/phases']).stdout).toMatch(/PHASE-01\s+PLANNED\s+Criada pelo UNC/);
    expect(session(junction, ['/phase new Pela junction']).stdout).toMatch(/criada PHASE-02/);
    expect(session(p.dir, ['/phases']).stdout).toMatch(/PHASE-02\s+PLANNED\s+Pela junction/);
  }, 240_000);
});
