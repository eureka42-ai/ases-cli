#!/usr/bin/env node
// Smoke do pacote instalado (AER-REQ-004/232, C-OS-05): instala o .tgz num prefixo TEMPORÁRIO (não mexe no npm global do
// usuário), roda `ases` e `ases-tar` pelos atalhos que o npm criou, faz um fluxo real (init, /ases import, /gate G0) e
// desinstala, conferindo que os atalhos somem. `--offline`: o pacote é autocontido, nada vem da rede.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { npmCli } from './npm-cli.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tgz = readdirSync(path.join(repo, '.pack')).find((f) => f.endsWith('.tgz'));
if (!tgz) throw new Error('rode node scripts/pack.mjs antes');
const prefix = mkdtempSync(path.join(os.tmpdir(), 'aer-pkg ç '));
const proj = mkdtempSync(path.join(os.tmpdir(), 'aer-proj ç '));
const win = process.platform === 'win32';
const binDir = win ? prefix : path.join(prefix, 'bin');
const npm = (...a) => execFileSync(process.execPath, [npmCli(), ...a, '--prefix', prefix, '--no-audit', '--no-fund', '--offline'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
// os comandos são chamados PELO NOME, com o prefixo no PATH, como o usuário roda (no Windows, via cmd.exe → ases.cmd);
// os argumentos são fixos deste script, nunca entrada externa
const PATHV = `${binDir}${path.delimiter}${process.env.PATH ?? process.env.Path ?? ''}`;
// config pessoal isolada: o smoke nunca grava projetos recentes/autorização na config de quem roda
const cfgHome = mkdtempSync(path.join(os.tmpdir(), 'aer-smoke-config-'));
const env = { ...process.env, PATH: PATHV, Path: PATHV, NO_COLOR: '1', XDG_CONFIG_HOME: cfgHome, APPDATA: cfgHome };
const run = (bin, args, input) => {
  const r = win
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', [bin, ...args].join(' ')], { cwd: proj, encoding: 'utf8', input: input ?? '', env })
    : spawnSync(path.join(binDir, bin), args, { cwd: proj, encoding: 'utf8', input: input ?? '', env });
  if (r.status !== 0) throw new Error(`${bin} ${args.join(' ')} → exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};
const check = (cond, msg) => {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
  console.log(`ok  ${msg}`);
};
try {
  npm('install', '-g', path.join(repo, '.pack', tgz));
  const shim = (b) => existsSync(path.join(binDir, win ? `${b}.cmd` : b));
  check(shim('ases') && shim('ases-tar'), `os dois comandos instalados em ${binDir}`);
  check(/^ases \d/.test(run('ases', ['--version'])), 'ases --version');
  check(/^ases-tar \d/.test(run('ases-tar', ['--version'])), 'ases-tar --version');
  // C-OS-05: os comandos respondem pelo PATH em cada shell disponível nesta máquina (bash, zsh, PowerShell)
  const shells = win ? [['pwsh', ['-NoProfile', '-Command']], ['powershell', ['-NoProfile', '-Command']], ['cmd', ['/d', '/c']]] : [['bash', ['-c']], ['zsh', ['-c']], ['pwsh', ['-NoProfile', '-Command']]];
  let tested = 0;
  for (const [sh, flags] of shells) {
    const probe = spawnSync(sh, [...flags, win && sh === 'cmd' ? 'ases --version && ases-tar --version' : 'ases --version; ases-tar --version'], { encoding: 'utf8', env });
    if (probe.error && probe.error.code === 'ENOENT') {
      console.log(`--  ${sh}: não instalado nesta máquina (NOT_RUN)`);
      continue;
    }
    check(probe.status === 0 && /ases \d/.test(probe.stdout) && /ases-tar \d/.test(probe.stdout), `${sh}: ases e ases-tar pelo PATH`);
    tested++;
  }
  check(tested > 0, `${tested} shell(s) testado(s)`);
  const doctor = JSON.parse(run('ases', ['doctor', '--json']));
  check(doctor.platform === process.platform && Array.isArray(doctor.providers), 'ases doctor --json');
  // PHASE-18: `ases update --check` contra um registro FALSO local (sem rede; a instalação real não é tocada)
  const reg = path.join(proj, 'registro-falso.json');
  writeFileSync(reg, JSON.stringify({ 'dist-tags': { latest: '99.0.0' } }));
  env.AER_REGISTRY = pathToFileURL(reg).href;
  check(/disponível 99\.0\.0/.test(run('ases', ['update', '--check'])), 'ases update --check vê a versão nova no registro');
  writeFileSync(reg, JSON.stringify({ 'dist-tags': { latest: run('ases', ['--version']).split(' ')[1] } }));
  check(/já está na versão mais nova/.test(run('ases', ['update'])), 'ases update na versão atual não reinstala');
  delete env.AER_REGISTRY;
  run('ases', ['init', '--name', 'smoke']);
  const out = run('ases', ['--no-tui'], '/ases import\n/gate G0\n/exit\n');
  check(/G0: PASS/.test(out), 'fontes ASES distribuídas no pacote: /ases import + /gate G0 PASS');
  npm('uninstall', '-g', '@eureka42-ai/aer');
  check(!shim('ases') && !shim('ases-tar'), 'uninstall remove os dois comandos');
  check(existsSync(path.join(proj, '.ases', 'db', 'ases.sqlite')), 'uninstall não apaga dados do projeto');
} finally {
  rmSync(prefix, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  rmSync(proj, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
